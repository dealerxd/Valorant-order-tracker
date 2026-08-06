"""Discord webhook gondericisi (bot token'i gerekmeyen hafif alternatif).

Webhook tek bir kanala mesaj ATABILIR ama komut ALAMAZ. Bu yuzden yalnizca
operator bildirimleri icin kullanilir; musteri kanallari ve slash komutlari
gercek bot token'i ister (bkz. bot_discord.py).

discord.py'ye bagimli degil, duz HTTP.
"""

from __future__ import annotations

import asyncio
import logging

import httpx

log = logging.getLogger(__name__)

MAX_LEN = 1900  # Discord siniri 2000, kod blogu sarmalayicisina pay birakiyoruz


def _block(text: str) -> str:
    return f"```\n{text[:MAX_LEN]}\n```"


class DiscordWebhookSender:
    """Dispatcher'in bekledigi `send(target, text)` arayuzunu saglar.

    Webhook sabit bir kanala yazdigi icin `target` yok sayilir.
    """

    def __init__(self, url: str):
        self.url = url
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(15.0))

    async def aclose(self) -> None:
        await self._client.aclose()

    async def describe(self) -> dict:
        """Webhook'u DOGRULAR ama mesaj GONDERMEZ (sadece GET).

        Donen alanlar: name, channel_id, guild_id.
        """
        resp = await self._client.get(self.url)
        if resp.status_code == 404:
            raise RuntimeError("Webhook bulunamadi (404) - silinmis ya da URL yanlis")
        if resp.status_code != 200:
            raise RuntimeError(f"Webhook dogrulanamadi: HTTP {resp.status_code} {resp.text[:200]}")
        return resp.json()

    async def send(self, target: str, text: str) -> None:
        payload = {"content": _block(text), "allowed_mentions": {"parse": []}}
        for attempt in range(3):
            resp = await self._client.post(self.url, json=payload)
            if resp.status_code in (200, 204):
                return
            if resp.status_code == 429:
                # Discord webhook limiti: 30 istek / dakika
                wait = float(resp.headers.get("Retry-After", "2") or 2)
                log.warning("Webhook rate limit, %.1f sn bekleniyor", wait)
                await asyncio.sleep(min(wait, 30))
                continue
            raise RuntimeError(f"Webhook gonderimi basarisiz: HTTP {resp.status_code} {resp.text[:200]}")
        raise RuntimeError("Webhook gonderimi 3 denemede basarisiz oldu")
