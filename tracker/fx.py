"""Gunluk doviz kuru cekimi.

Kur simdiye kadar panelde her siparise ELLE giriliyordu. Unutuldugunda kar
hesabi sessizce bozuluyor: dis kaynak maliyeti 0 sayiliyor, brut gelir TL'ye
cevrilemiyor. Yanlis girildiginde de fark aylar sonra ortaya cikiyor.

Kuru panel degil BU servis cekiyor. Panel statik bir sayfa; her acilista disari
istek atmasi, kur servisi dustugunde ya da CORS politikasi degistiginde kur
alaninin bos kalmasi demek. Tracker zaten surekli calisiyor, gunde bir istek
onun icin bedava.

Cekilen kur SIPARISIN kuru degil: siparis kaydedilirken panel bu tablodan
okuyup `order_finance.rate` alanina yaziyor ve orada sabitleniyor. Buradaki
tablo yalnizca "bugunun kuru neydi" sorusunu cevapliyor.

Kur servisi dusebilir. Dustugunde eski kuru silmiyoruz ve uydurma bir deger
yazmiyoruz - panel son bilinen kuru tarihiyle birlikte gosteriyor, boylece
bayat kur fark ediliyor.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timezone

import httpx

from domain import FX_TABLE
from store import Store, StoreError

log = logging.getLogger(__name__)

# Panelde secilebilen para birimleri (TRY haric - kendisine cevrilmiyor).
CURRENCIES = ("USD", "EUR")

# Anahtar istemeyen, ucretsiz ve kaynagini acikca yazan bir servis.
# Sirayla deneniyor: ilki cevap vermezse ikincisi. Iki bagimsiz kaynak,
# birinin kesintisi kuru gunlerce bayat birakmasin diye.
SOURCES = (
    ("frankfurter", "https://api.frankfurter.app/latest?from={cur}&to=TRY"),
    ("erapi", "https://open.er-api.com/v6/latest/{cur}"),
)

FETCH_TIMEOUT = 20.0
# Gunde bir yetiyor; kur gun ici oynasa da siparis anindaki kur zaten
# order_finance'ta sabitleniyor.
INTERVAL_SECONDS = 6 * 3600


def _parse(source: str, cur: str, payload: dict) -> float | None:
    """Servis cevabindan TRY karsiligini cikarir. Bicim degisirse None."""
    try:
        if source == "frankfurter":
            return float(payload["rates"]["TRY"])
        if source == "erapi":
            if payload.get("result") not in (None, "success"):
                return None
            return float(payload["rates"]["TRY"])
    except (KeyError, TypeError, ValueError):
        return None
    return None


async def fetch_rate(client: httpx.AsyncClient, cur: str) -> tuple[float, str] | None:
    """Bir para biriminin TRY karsiligi. Hicbir kaynak vermezse None."""
    for name, url in SOURCES:
        try:
            resp = await client.get(url.format(cur=cur), timeout=FETCH_TIMEOUT)
            resp.raise_for_status()
            rate = _parse(name, cur, resp.json())
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("%s kuru %s kaynagindan alinamadi: %s", cur, name, exc)
            continue
        # Sifir ya da negatif kur veri hatasi; yazarsak kar hesabi bozulur.
        if rate is None or rate <= 0:
            log.warning("%s kuru %s kaynagindan anlamsiz geldi: %r", cur, name, rate)
            continue
        return rate, name
    return None


class FxUpdater:
    """Kuru periyodik cekip fx_rates tablosuna yazar."""

    def __init__(self, store: Store):
        self.store = store
        self._stop = asyncio.Event()

    def stop(self) -> None:
        self._stop.set()

    async def run(self) -> None:
        log.info("Kur guncelleyici basladi (%d sn araliginda)", INTERVAL_SECONDS)
        async with httpx.AsyncClient(headers={"User-Agent": "resell-tracker/1.0"}) as client:
            while not self._stop.is_set():
                try:
                    await self.update_once(client)
                except Exception:  # noqa: BLE001 - dongu olmemeli
                    log.exception("Kur guncellemesinde beklenmeyen hata")
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=INTERVAL_SECONDS)
                except asyncio.TimeoutError:
                    pass
        log.info("Kur guncelleyici durdu")

    async def update_once(self, client: httpx.AsyncClient) -> dict[str, float]:
        bugun = datetime.now(timezone.utc).date()
        yazilan: dict[str, float] = {}
        for cur in CURRENCIES:
            sonuc = await fetch_rate(client, cur)
            if sonuc is None:
                log.error("%s kuru hicbir kaynaktan alinamadi, eski kur korunuyor", cur)
                continue
            rate, kaynak = sonuc
            try:
                await self.store.save_fx_rate(cur, bugun, rate, kaynak)
            except StoreError as exc:
                log.error("%s kuru yazilamadi: %s", cur, exc)
                continue
            yazilan[cur] = rate
            log.info("%s/TRY = %.4f (%s)", cur, rate, kaynak)
        return yazilan


__all__ = ["CURRENCIES", "FxUpdater", "fetch_rate", "INTERVAL_SECONDS"]
