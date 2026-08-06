"""Bildirim dagitici.

Telegram ve Discord gondericileri buraya kaydediliyor; tracker ve komutlar
platformu bilmeden `to_customer` / `to_ops` cagiriyor. Bir platform
konfigure edilmemisse sessizce atlaniyor.
"""

from __future__ import annotations

import logging
from typing import Protocol

log = logging.getLogger(__name__)


class SenderBackend(Protocol):
    async def send(self, target: str, text: str) -> None: ...


class Dispatcher:
    def __init__(self) -> None:
        self._telegram: SenderBackend | None = None
        self._discord: SenderBackend | None = None
        self._ops_tg: str | None = None
        self._ops_dc: str | None = None
        # Webhook modunda Discord tek bir kanala yaziyor; musteri kanallari
        # ayirt edilemedigi icin bildirimler sadece operatore gider.
        self._discord_ops_only = False
        # Musteriye giden her mesajin kopyasi operatore de dussun mu?
        self._mirror_to_ops = False

    def set_mirror_to_ops(self, enabled: bool) -> None:
        self._mirror_to_ops = enabled

    def register_telegram(self, backend: SenderBackend, ops_chat_id: str | None) -> None:
        self._telegram = backend
        self._ops_tg = ops_chat_id

    def register_discord(self, backend: SenderBackend, ops_channel_id: int | str | None,
                         *, ops_only: bool = False) -> None:
        self._discord = backend
        self._ops_dc = str(ops_channel_id) if ops_channel_id else None
        self._discord_ops_only = ops_only

    async def _send(self, backend: SenderBackend | None, target: str | None, text: str) -> bool:
        if backend is None or not target:
            return False
        try:
            await backend.send(target, text)
            return True
        except Exception as exc:  # noqa: BLE001 - bir kanalin hatasi digerini durdurmamali
            log.error("Bildirim gonderilemedi (%s): %s", target, exc)
            return False

    async def to_customer(self, order: dict, text: str) -> bool:
        """Siparise bagli musteri kanallarina gonderir. Hicbiri yoksa False."""
        tg_target = order.get("customer_tg_chat")
        dc_target = order.get("customer_dc_channel")

        sent_tg = await self._send(self._telegram, tg_target, text)
        sent_dc = False
        if not self._discord_ops_only:
            sent_dc = await self._send(self._discord, dc_target, text)
        sent = sent_tg or sent_dc

        if self._mirror_to_ops:
            # Musteri kanali zaten operator kanaliysa ikinci kez gonderme
            already = (tg_target and str(tg_target) == str(self._ops_tg)) or \
                      (dc_target and str(dc_target) == str(self._ops_dc))
            if not already:
                handle = order.get("handle", "?")
                who = order.get("riot_id") or ""
                etiket = f"[#{handle} {who} -> musteri]" if sent \
                    else f"[#{handle} {who} -> MUSTERI KANALI YOK]"
                await self.to_ops(f"{etiket}\n{text}")

        return sent

    async def to_ops(self, text: str) -> None:
        """Operator kanallarina gonderir (her iki platforma da)."""
        await self._send(self._telegram, self._ops_tg, text)
        await self._send(self._discord, self._ops_dc, text)
