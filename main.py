"""Giris noktasi: botlari ve poll dongusunu birlikte calistirir.

    python main.py
"""

from __future__ import annotations

import asyncio
import logging
import sys

import henrik
from config import load_config
from notify import Dispatcher
from store import Store, StoreError
from tracker import Tracker


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-7s %(name)-16s %(message)s",
        datefmt="%H:%M:%S",
    )
    # Kutuphanelerin gurultusunu kis
    for noisy in ("httpx", "httpcore", "discord", "telegram", "apscheduler"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


async def run() -> None:
    config = load_config()
    log = logging.getLogger("main")

    client = henrik.HenrikClient(config.henrik_api_key, config.henrik_rate_limit_per_min)
    store = Store(config.supabase_url, config.supabase_service_key)
    dispatcher = Dispatcher()
    dispatcher.set_mirror_to_ops(config.mirror_to_ops)
    if config.mirror_to_ops:
        log.info("Musteriye giden mesajlarin kopyasi operator kanalina da dusecek")

    try:
        order_count = await store.ping()
        log.info("Supabase baglandi: %s (%d siparis)", config.supabase_url, order_count)
    except StoreError as exc:
        await store.aclose()
        await client.aclose()
        raise RuntimeError(
            f"Supabase'e baglanilamadi: {exc}\n"
            "SUPABASE_URL ve SUPABASE_SERVICE_KEY degerlerini kontrol et."
        ) from exc

    telegram_bot = None
    discord_bot = None
    webhook = None
    tasks: list[asyncio.Task] = []

    try:
        if config.telegram_enabled:
            from bot_telegram import TelegramBot

            telegram_bot = TelegramBot(config, client, store, dispatcher)
            dispatcher.register_telegram(telegram_bot, config.telegram_ops_chat_id)
            await telegram_bot.start()

        if config.discord_webhook_enabled:
            from discord_webhook import DiscordWebhookSender

            webhook = DiscordWebhookSender(config.discord_webhook_url or "")
            info = await webhook.describe()
            dispatcher.register_discord(webhook, "webhook", ops_only=True)
            log.info(
                "Discord webhook hazir: #%s kanali (bildirim gonderir, komut almaz)",
                info.get("channel_id"),
            )

        if config.discord_enabled:
            from bot_discord import DiscordBot

            discord_bot = DiscordBot(config, client, store, dispatcher)
            dispatcher.register_discord(discord_bot, config.discord_ops_channel_id)
            tasks.append(
                asyncio.create_task(
                    discord_bot.start(config.discord_bot_token or ""), name="discord"
                )
            )
            # Bildirim gonderebilmesi icin baglantinin kurulmasini bekle
            try:
                await asyncio.wait_for(discord_bot.wait_until_ready(), timeout=60)
            except asyncio.TimeoutError:
                log.error("Discord 60 sn icinde baglanamadi, devam ediliyor")

        tracker = Tracker(config, client, store, dispatcher)
        tasks.append(asyncio.create_task(tracker.run(), name="tracker"))

        log.info("Sistem calisiyor. Durdurmak icin Ctrl+C.")
        await dispatcher.to_ops("Takip sistemi baslatildi.")

        # Herhangi bir gorev olurse (ornegin Discord baglantisi koparsa) hepsini kapat
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            exc = task.exception()
            if exc is not None:
                log.error("%s gorevi hata ile bitti: %s", task.get_name(), exc)

    except (KeyboardInterrupt, asyncio.CancelledError):
        log.info("Kapatiliyor...")
    finally:
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        if discord_bot is not None:
            await discord_bot.close()
        if telegram_bot is not None:
            await telegram_bot.stop()
        if webhook is not None:
            await webhook.aclose()
        await store.aclose()
        await client.aclose()
        logging.getLogger("main").info("Kapandi.")


def cli() -> int:
    setup_logging()
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        return 0
    except RuntimeError as exc:
        # Konfigurasyon hatalari icin traceback gostermeye gerek yok
        print(f"\nHata: {exc}\n", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(cli())
