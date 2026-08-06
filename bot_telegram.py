"""Telegram botu: komut arayuzu + bildirim gondericisi."""

from __future__ import annotations

import logging

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

import commands
import henrik
from config import Config
from notify import Dispatcher
from store import Store

log = logging.getLogger(__name__)

MAX_LEN = 4000  # Telegram siniri 4096, pay birakiyoruz


class TelegramBot:
    def __init__(self, config: Config, client: henrik.HenrikClient,
                 store: Store, dispatcher: Dispatcher):
        self.config = config
        self.client = client
        self.store = store
        self.dispatcher = dispatcher
        self.app: Application = (
            Application.builder().token(config.telegram_bot_token or "").build()
        )
        self._register()

    # --- Yetki ---------------------------------------------------------------

    def _authorized(self, update: Update) -> bool:
        """Admin listesi varsa ona bak; yoksa sadece operator sohbetine izin ver."""
        admins = self.config.telegram_admin_ids
        if admins:
            user = update.effective_user
            return bool(user and user.id in admins)
        chat = update.effective_chat
        ops = self.config.telegram_ops_chat_id
        return bool(chat and ops and str(chat.id) == str(ops))

    # --- Yardimcilar ---------------------------------------------------------

    @staticmethod
    def _args(context: ContextTypes.DEFAULT_TYPE) -> str:
        return " ".join(context.args or [])

    async def _reply(self, update: Update, text: str) -> None:
        if update.message is None:
            return
        await update.message.reply_text(text[:MAX_LEN])

    def _guard(self, handler):
        async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
            if not self._authorized(update):
                chat = update.effective_chat
                user = update.effective_user
                log.warning(
                    "Yetkisiz komut: user=%s chat=%s",
                    user.id if user else "?", chat.id if chat else "?",
                )
                await self._reply(
                    update,
                    "Bu bot yetkili kullanicilara acik.\n"
                    f"Chat ID: {chat.id if chat else '?'} / User ID: {user.id if user else '?'}",
                )
                return
            await handler(update, context)

        return wrapper

    # --- Komutlar ------------------------------------------------------------

    def _register(self) -> None:
        handlers = {
            "bagla": self._cmd_link,
            "link": self._cmd_link,
            "liste": self._cmd_list,
            "list": self._cmd_list,
            "durum": self._cmd_status,
            "status": self._cmd_status,
            "musteri": self._cmd_customer,
            "duraklat": self._cmd_pause,
            "devam": self._cmd_resume,
            "kaldir": self._cmd_unlink,
            "yardim": self._cmd_help,
            "help": self._cmd_help,
            "start": self._cmd_help,
        }
        for name, handler in handlers.items():
            self.app.add_handler(CommandHandler(name, self._guard(handler)))

    async def _cmd_link(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        await self._reply(update, await commands.cmd_link(
            self.store, self.client, self.dispatcher, self._args(context)))

    async def _cmd_list(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        await self._reply(update, await commands.cmd_list(self.store))

    async def _cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        await self._reply(update, await commands.cmd_status(self.store, self._args(context)))

    async def _cmd_customer(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        chat = update.effective_chat
        if chat is None:
            return
        await self._reply(update, await commands.cmd_customer(
            self.store, self._args(context), "telegram", str(chat.id)))

    async def _cmd_pause(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        await self._reply(update, await commands.cmd_pause(self.store, self._args(context)))

    async def _cmd_resume(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        await self._reply(update, await commands.cmd_resume(self.store, self._args(context)))

    async def _cmd_unlink(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        await self._reply(update, await commands.cmd_unlink(self.store, self._args(context)))

    async def _cmd_help(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        chat = update.effective_chat
        extra = f"\n\nBu sohbetin ID'si: {chat.id}" if chat else ""
        await self._reply(update, commands.cmd_help() + extra)

    # --- Dispatcher arayuzu --------------------------------------------------

    async def send(self, target: str, text: str) -> None:
        # Duz metin gonderiyoruz: mesajlarda hesap adi gecebiliyor ve Markdown/HTML
        # ozel karakterleri (_ * # <) gonderimi patlatir.
        await self.app.bot.send_message(chat_id=int(target), text=text[:MAX_LEN])

    # --- Yasam dongusu -------------------------------------------------------

    async def start(self) -> None:
        await self.app.initialize()
        await self.app.start()
        if self.app.updater is not None:
            await self.app.updater.start_polling(drop_pending_updates=True)
        me = await self.app.bot.get_me()
        log.info("Telegram botu hazir: @%s", me.username)

    async def stop(self) -> None:
        try:
            if self.app.updater is not None and self.app.updater.running:
                await self.app.updater.stop()
            if self.app.running:
                await self.app.stop()
            await self.app.shutdown()
        except Exception:  # noqa: BLE001 - kapanista hata dongu bozmasin
            log.exception("Telegram botu kapatilirken hata")
