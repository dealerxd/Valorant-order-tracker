"""HenrikDev Valorant API istemcisi.

Docs: https://docs.henrikdev.xyz/
Auth: `Authorization: <API_KEY>` (Bearer prefix'i YOK)

Rate limit notu: v4'te her API cagrisi +1, arkada Riot'a giden her fetch de ayrica
+1 sayiliyor. Yani cache miss'te bir istek iki birim yiyor. Asagidaki token bucket
bu yuzden her istegi 2 birim sayarak guvenli tarafta kaliyor.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx

log = logging.getLogger(__name__)

BASE_URL = "https://api.henrikdev.xyz"

VALID_REGIONS = {"eu", "na", "ap", "kr", "latam", "br"}
VALID_PLATFORMS = {"pc", "console"}


class HenrikError(RuntimeError):
    """API'den beklenmeyen yanit."""


class AccountNotFound(HenrikError):
    pass


class InvalidApiKey(HenrikError):
    """401 - anahtar yanlis, eksik ya da iptal edilmis."""

    def __init__(self) -> None:
        super().__init__(
            "HenrikDev API anahtari gecersiz (401 Unauthorized).\n"
            "HENRIK_API_KEY degerini kontrol et: basinda/sonunda tirnak, bosluk ya da "
            "satir sonu olmamali, 'HDEV-' ile baslamali."
        )


class RateLimited(HenrikError):
    def __init__(self, retry_after: float):
        super().__init__(f"Rate limit asildi, {retry_after:.0f} sn sonra tekrar denenecek")
        self.retry_after = retry_after


@dataclass
class AccountInfo:
    puuid: str
    name: str
    tag: str
    region: str | None
    level: int | None
    platforms: list[str]


@dataclass
class MmrSnapshot:
    tier_id: int | None
    tier_name: str
    rr: int
    elo: int | None
    last_change: int
    leaderboard_placement: int | None
    games_needed_for_rating: int


@dataclass
class HistoryEntry:
    match_id: str
    played_at: str | None
    tier_id: int | None
    tier_name: str
    rr: int
    rr_change: int
    elo: int | None
    map_name: str | None
    refunded_rr: int
    derank_protected: bool
    season: str | None


class _RateLimiter:
    """60 saniyelik kayan pencere uzerinde token bucket."""

    def __init__(self, per_minute: int, cost_per_request: int = 2):
        self.capacity = max(1, per_minute)
        self.cost = cost_per_request
        self._events: list[tuple[float, int]] = []
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            while True:
                now = time.monotonic()
                self._events = [(ts, c) for ts, c in self._events if now - ts < 60.0]
                used = sum(c for _, c in self._events)
                if used + self.cost <= self.capacity:
                    self._events.append((now, self.cost))
                    return
                oldest = self._events[0][0]
                wait = max(0.05, 60.0 - (now - oldest))
                log.debug("Rate limit doldu, %.1f sn bekleniyor", wait)
                await asyncio.sleep(wait)


def _first(data: dict[str, Any], *keys: str, default: Any = None) -> Any:
    """Alan adi surumler arasinda degistigi icin ilk dolu olani sec."""
    for key in keys:
        if key in data and data[key] is not None:
            return data[key]
    return default


def _nested_name(value: Any) -> str | None:
    if isinstance(value, dict):
        return value.get("name")
    if isinstance(value, str):
        return value
    return None


def _nested_id(value: Any) -> int | None:
    if isinstance(value, dict):
        raw = value.get("id")
        return int(raw) if isinstance(raw, (int, float)) else None
    if isinstance(value, (int, float)):
        return int(value)
    return None


class HenrikClient:
    def __init__(self, api_key: str, rate_limit_per_min: int = 30):
        self._client = httpx.AsyncClient(
            base_url=BASE_URL,
            headers={
                "Authorization": api_key,
                "Accept": "application/json",
                "User-Agent": "valorant-order-tracker/1.0",
            },
            timeout=httpx.Timeout(20.0),
        )
        self._limiter = _RateLimiter(rate_limit_per_min)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict[str, Any] | None = None, *, retries: int = 2) -> Any:
        for attempt in range(retries + 1):
            await self._limiter.acquire()
            try:
                resp = await self._client.get(path, params=params)
            except httpx.RequestError as exc:
                if attempt >= retries:
                    raise HenrikError(f"Baglanti hatasi: {exc}") from exc
                await asyncio.sleep(2 ** attempt)
                continue

            if resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", "10") or 10)
                if attempt >= retries:
                    raise RateLimited(retry_after)
                log.warning("429 alindi, %.0f sn bekleniyor (%s)", retry_after, path)
                await asyncio.sleep(min(retry_after, 60))
                continue

            if resp.status_code == 401:
                raise InvalidApiKey()

            if resp.status_code == 404:
                raise AccountNotFound(f"Bulunamadi: {path}")

            if resp.status_code >= 500:
                if attempt >= retries:
                    raise HenrikError(f"Sunucu hatasi {resp.status_code} ({path})")
                await asyncio.sleep(2 ** attempt)
                continue

            if resp.status_code != 200:
                detail = ""
                try:
                    body = resp.json()
                    errors = body.get("errors") or []
                    if errors:
                        detail = f" - {errors[0].get('message', '')}"
                except Exception:  # noqa: BLE001 - govde JSON olmayabilir
                    pass
                raise HenrikError(f"HTTP {resp.status_code} ({path}){detail}")

            payload = resp.json()
            if not isinstance(payload, dict) or "data" not in payload:
                raise HenrikError(f"Beklenmeyen yanit govdesi ({path})")
            return payload["data"]

        raise HenrikError(f"Istek basarisiz: {path}")

    async def validate_key(self) -> int:
        """Anahtari acilista dogrular ve dakikalik istek limitini doner.

        Kisisel veri iceren bir endpoint'e vurmaz; sunucu durumu sorgulanir.
        Anahtar bozuksa InvalidApiKey firlatir, boylece bot sessizce acilip
        5 dakika sonra 'baglanamadi' hatasi uretmez.
        """
        await self._limiter.acquire()
        resp = await self._client.get("/valorant/v1/status/eu")
        if resp.status_code == 401:
            raise InvalidApiKey()
        if resp.status_code != 200:
            raise HenrikError(f"HenrikDev dogrulanamadi: HTTP {resp.status_code}")
        try:
            return int(resp.headers.get("x-ratelimit-limit", "0"))
        except ValueError:
            return 0

    # --- Endpoint sarmalayicilari --------------------------------------------

    async def get_account(self, name: str, tag: str, *, force: bool = False) -> AccountInfo:
        # force=true cache'i atlar; isim degistirmis hesaplarda ise yarar
        params = {"force": "true"} if force else None
        data = await self._get(f"/valorant/v2/account/{name}/{tag}", params)
        puuid = data.get("puuid")
        if not puuid:
            raise HenrikError("Yanitta puuid yok")

        # v2'de platforms dizisi geliyor: ["pc"], ["console"] ya da ikisi birden
        raw_platforms = data.get("platforms") or []
        platforms = [str(p).lower() for p in raw_platforms if str(p).lower() in VALID_PLATFORMS]

        return AccountInfo(
            puuid=puuid,
            name=data.get("name") or name,
            tag=data.get("tag") or tag,
            region=data.get("region"),
            level=data.get("account_level"),
            platforms=platforms,
        )

    async def get_mmr(self, region: str, platform: str, puuid: str) -> MmrSnapshot:
        data = await self._get(f"/valorant/v3/by-puuid/mmr/{region}/{platform}/{puuid}")
        current = data.get("current") or {}
        tier = current.get("tier") or {}
        return MmrSnapshot(
            tier_id=_nested_id(tier),
            tier_name=_nested_name(tier) or "Bilinmiyor",
            rr=int(_first(current, "rr", "ranking_in_tier", default=0) or 0),
            elo=current.get("elo"),
            last_change=int(_first(current, "last_change", "mmr_change_to_last_game", default=0) or 0),
            leaderboard_placement=(
                (current.get("leaderboard_placement") or {}).get("rank")
                if isinstance(current.get("leaderboard_placement"), dict)
                else current.get("leaderboard_placement")
            ),
            games_needed_for_rating=int(current.get("games_needed_for_rating") or 0),
        )

    async def get_mmr_history(self, region: str, platform: str, puuid: str) -> list[HistoryEntry]:
        data = await self._get(f"/valorant/v2/by-puuid/mmr-history/{region}/{platform}/{puuid}")

        # v2 -> {"account": {...}, "history": [...]}, v1 -> dogrudan liste
        raw_history = data.get("history") if isinstance(data, dict) else data
        if not isinstance(raw_history, list):
            return []

        entries: list[HistoryEntry] = []
        for item in raw_history:
            if not isinstance(item, dict):
                continue
            match_id = _first(item, "match_id", "matchid")
            if not match_id:
                continue
            tier = item.get("tier")
            season = item.get("season")
            entries.append(
                HistoryEntry(
                    match_id=str(match_id),
                    played_at=_first(item, "date", "date_raw", "match_start_at"),
                    tier_id=_nested_id(tier),
                    tier_name=_nested_name(tier) or "Bilinmiyor",
                    rr=int(_first(item, "rr", "ranking_in_tier", default=0) or 0),
                    rr_change=int(
                        _first(item, "last_change", "mmr_change_to_last_game", default=0) or 0
                    ),
                    elo=item.get("elo"),
                    map_name=_nested_name(item.get("map")),
                    refunded_rr=int(item.get("refunded_rr") or 0),
                    derank_protected=bool(item.get("was_derank_protected")),
                    season=(season.get("short") if isinstance(season, dict) else None),
                )
            )
        return entries
