"""Supabase veri katmani (PostgREST uzerinden).

Siparislerin kaynagi paneldeki `resells` tablosu. Tracker kendi durumunu
`tracker_state`, cektigi maclari `tracker_matches` tablosunda tutuyor.

Baglanti service_role anahtariyla kuruluyor; bu anahtar RLS'i baypas eder,
dolayisiyla SADECE sunucuda calisan bu daemon'da kullanilmali, panelde asla.

Siparis ID'leri UUID oldugu icin komutlarda tam UUID yazmak zorunda kalmayasin
diye kisa on-ek (ilk 8 karakter) ile eslesme destekleniyor: /durum a1b2c3d4
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

log = logging.getLogger(__name__)

# Panelin bolge etiketleri -> HenrikDev bolge kodlari.
# Turkiye Valorant'ta EU sunucularinda oynuyor.
PANEL_REGION_TO_API = {
    "TR": "eu", "EU": "eu", "NA": "na", "AP": "ap", "KR": "kr",
    "LATAM": "latam", "BR": "br", "DIGER": "eu", "DIĞER": "eu",
}

# Yoklanan durumlar: is fiilen boostcuda. 'yeni' henuz atanmamis demek,
# o yuzden poll edilmez - yoksa kimse oynamadigi icin 24 saat sonra bos yere
# "takilma" uyarisi ureterek gurultu yapar.
ACTIVE_STATUSES = ("atandi", "devam")

# /liste ve /bagla'da gorunen durumlar. 'yeni' de dahil, boylece siparisi
# boostciya atanmadan once hesaba baglayip hazir edebilirsin; atanip 'atandi'ya
# gecince yoklama kendiliginden baslar.
LISTABLE_STATUSES = ("yeni", "atandi", "devam")

HANDLE_LEN = 8
MIN_HANDLE_LEN = 4


def panel_region_to_api(region: str | None) -> str:
    if not region:
        return "eu"
    return PANEL_REGION_TO_API.get(region.strip().upper(), "eu")


def handle_of(order_id: str) -> str:
    """UUID'nin komutlarda kullanilan kisa hali."""
    return str(order_id).replace("-", "")[:HANDLE_LEN]


class StoreError(RuntimeError):
    pass


class Store:
    def __init__(self, url: str, service_key: str):
        base = url.rstrip("/") + "/rest/v1"
        self._client = httpx.AsyncClient(
            base_url=base,
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=httpx.Timeout(20.0),
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    # --- Alt seviye ----------------------------------------------------------

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        try:
            resp = await self._client.request(method, path, **kwargs)
        except httpx.RequestError as exc:
            raise StoreError(f"Supabase baglanti hatasi: {exc}") from exc

        if resp.status_code >= 400:
            detail = resp.text[:300]
            raise StoreError(f"Supabase HTTP {resp.status_code}: {detail}")
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    async def _select(self, table: str, params: dict[str, Any]) -> list[dict]:
        rows = await self._request("GET", f"/{table}", params=params)
        return rows if isinstance(rows, list) else []

    async def ping(self) -> int:
        """Baglantiyi dogrular, panel siparis sayisini doner."""
        rows = await self._select("resells", {"select": "id"})
        return len(rows)

    # --- Siparisler ----------------------------------------------------------

    @staticmethod
    def _shape(row: dict) -> dict:
        """resells + tracker_state satirini tek duz sozluge indirger.

        messages.py ve tracker.py bu sozlugu order['alan'] seklinde okuyor.
        """
        state = row.get("tracker_state") or {}
        if isinstance(state, list):
            state = state[0] if state else {}

        order_id = row.get("id")
        riot_id = row.get("riot_id") or ""
        name, _, tag = riot_id.partition("#")

        return {
            "id": order_id,
            "handle": handle_of(order_id),
            "riot_id": riot_id,
            "name": name or "?",
            "tag": tag or "?",
            "panel_region": row.get("region"),
            "durum": row.get("durum"),
            "order_type": row.get("order_type"),
            "baslangic": row.get("baslangic"),
            "hedef": row.get("hedef"),
            "note": row.get("note"),
            "booster_id": row.get("booster_id"),
            "archived": bool(row.get("archived")),
            "created_at": row.get("created_at"),
            # tracker_state tarafi
            "tracked": bool(state),
            "puuid": state.get("puuid"),
            "region": state.get("region") or panel_region_to_api(row.get("region")),
            "platform": state.get("platform") or "pc",
            "start_elo": state.get("start_elo"),
            "target_elo": state.get("target_elo"),
            "current_elo": state.get("current_elo"),
            "last_match_id": state.get("last_match_id"),
            "last_match_at": state.get("last_match_at"),
            "season": state.get("season"),
            "session_open": bool(state.get("session_open")),
            "stall_alerted": bool(state.get("stall_alerted")),
            "loss_streak": int(state.get("loss_streak") or 0),
            "loss_alerted": bool(state.get("loss_alerted")),
            "paused": bool(state.get("paused")),
            "customer_tg_chat": state.get("customer_tg_chat"),
            "customer_dc_channel": state.get("customer_dc_channel"),
        }

    _SELECT = "*,tracker_state(*)"

    async def list_trackable(self) -> list[dict]:
        """Poll dongusunun yoklayacagi siparisler: panelde aktif, bagli, duraklatilmamis."""
        rows = await self._select("resells", {
            "select": self._SELECT,
            "durum": f"in.({','.join(ACTIVE_STATUSES)})",
            "archived": "eq.false",
            "order": "created_at.desc",
        })
        orders = [self._shape(r) for r in rows]
        return [o for o in orders if o["tracked"] and not o["paused"]]

    async def list_orders(self, *, only_tracked: bool = False) -> list[dict]:
        """Panelde acik tum siparisler ('yeni' dahil, bagli olmayanlar dahil)."""
        rows = await self._select("resells", {
            "select": self._SELECT,
            "durum": f"in.({','.join(LISTABLE_STATUSES)})",
            "archived": "eq.false",
            "order": "created_at.desc",
        })
        orders = [self._shape(r) for r in rows]
        return [o for o in orders if o["tracked"]] if only_tracked else orders

    async def list_pending_links(self) -> list[dict]:
        """Panelde riot_id girilmis ama henuz takibe alinmamis siparisler.

        Tracker bunlari her turda kendiliginden baglar; panele nick yazmak
        yeterli olsun diye.
        """
        rows = await self._select("resells", {
            "select": self._SELECT,
            "durum": f"in.({','.join(ACTIVE_STATUSES)})",
            "archived": "eq.false",
            "order": "created_at.desc",
        })
        orders = [self._shape(r) for r in rows]
        return [o for o in orders if not o["tracked"] and o["riot_id"]]

    async def get_order(self, handle: str) -> dict | None:
        """Kisa on-ek ya da tam UUID ile siparis bulur."""
        handle = handle.strip().lstrip("#").lower()
        if len(handle) < MIN_HANDLE_LEN:
            return None

        rows = await self._select("resells", {"select": self._SELECT, "order": "created_at.desc"})
        matches = [
            r for r in rows
            if str(r.get("id", "")).replace("-", "").lower().startswith(handle.replace("-", ""))
        ]
        if len(matches) != 1:
            return None
        return self._shape(matches[0])

    async def find_by_puuid(self, puuid: str) -> dict | None:
        rows = await self._select("tracker_state", {"select": "order_id", "puuid": f"eq.{puuid}"})
        if not rows:
            return None
        return await self.get_order(handle_of(rows[0]["order_id"]))

    async def set_riot_id(self, order_id: str, riot_id: str | None) -> None:
        await self._request(
            "PATCH", "/resells",
            params={"id": f"eq.{order_id}"},
            json={"riot_id": riot_id},
        )

    # --- tracker_state -------------------------------------------------------

    async def link(
        self, *, order_id: str, puuid: str, region: str, platform: str,
        start_elo: int, target_elo: int,
    ) -> None:
        """Siparisi bir hesaba baglar (upsert)."""
        await self._request(
            "POST", "/tracker_state",
            headers={"Prefer": "resolution=merge-duplicates"},
            json={
                "order_id": order_id, "puuid": puuid, "region": region,
                "platform": platform, "start_elo": start_elo, "target_elo": target_elo,
                "current_elo": start_elo, "paused": False,
            },
        )

    async def unlink(self, order_id: str) -> None:
        """Takibi kaldirir. Maclar da silinir; siparisin kendisine dokunulmaz."""
        await self._request("DELETE", "/tracker_matches", params={"order_id": f"eq.{order_id}"})
        await self._request("DELETE", "/tracker_state", params={"order_id": f"eq.{order_id}"})

    async def update_state(self, order_id: str, **fields: Any) -> None:
        if not fields:
            return
        allowed = {
            "puuid", "region", "platform", "start_elo", "target_elo", "current_elo",
            "last_match_id", "last_match_at", "last_poll_at", "season", "session_open",
            "stall_alerted", "loss_streak", "loss_alerted", "paused",
            "customer_tg_chat", "customer_dc_channel",
        }
        unknown = set(fields) - allowed
        if unknown:
            raise ValueError(f"Bilinmeyen alan(lar): {', '.join(sorted(unknown))}")
        await self._request(
            "PATCH", "/tracker_state",
            params={"order_id": f"eq.{order_id}"},
            json=fields,
        )

    # --- Maclar --------------------------------------------------------------

    async def known_match_ids(self, order_id: str) -> set[str]:
        rows = await self._select("tracker_matches", {
            "select": "match_id", "order_id": f"eq.{order_id}",
        })
        return {r["match_id"] for r in rows}

    async def insert_matches(self, order_id: str, matches: list[dict]) -> int:
        """Maclari toplu ekler. (order_id, match_id) benzersiz oldugu icin
        tekrar edenler sessizce atlanir."""
        if not matches:
            return 0
        payload = [{**m, "order_id": order_id} for m in matches]
        result = await self._request(
            "POST", "/tracker_matches",
            headers={"Prefer": "resolution=ignore-duplicates,return=representation"},
            json=payload,
        )
        return len(result) if isinstance(result, list) else 0

    async def unreported_matches(self, order_id: str) -> list[dict]:
        return await self._select("tracker_matches", {
            "select": "*", "order_id": f"eq.{order_id}", "reported": "eq.false",
            "order": "played_at.asc",
        })

    async def mark_reported(self, order_id: str) -> None:
        await self._request(
            "PATCH", "/tracker_matches",
            params={"order_id": f"eq.{order_id}", "reported": "eq.false"},
            json={"reported": True},
        )

    async def recent_matches(self, order_id: str, limit: int = 10) -> list[dict]:
        return await self._select("tracker_matches", {
            "select": "*", "order_id": f"eq.{order_id}",
            "order": "played_at.desc", "limit": str(limit),
        })

    async def match_stats(self, order_id: str) -> dict[str, int]:
        rows = await self._select("tracker_matches", {
            "select": "rr_change", "order_id": f"eq.{order_id}",
        })
        changes = [int(r.get("rr_change") or 0) for r in rows]
        return {
            "total": len(changes),
            "wins": sum(1 for c in changes if c > 0),
            "losses": sum(1 for c in changes if c < 0),
            "draws": sum(1 for c in changes if c == 0),
            "rr": sum(changes),
        }
