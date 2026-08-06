"""Ortam degiskenlerinden konfigurasyon yuklemesi."""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _int(key: str, default: int) -> int:
    raw = os.getenv(key, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _bool(key: str, default: bool) -> bool:
    raw = os.getenv(key, "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "evet", "acik", "on"}


def _opt_str(key: str) -> str | None:
    raw = os.getenv(key, "").strip()
    return raw or None


def _id_set(key: str) -> frozenset[int]:
    """'123,456' formatindaki ID listesini cozer. Gecersiz girdiler atlanir."""
    raw = os.getenv(key, "")
    ids: set[int] = set()
    for part in raw.replace(";", ",").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            ids.add(int(part))
        except ValueError:
            continue
    return frozenset(ids)


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_service_key: str
    henrik_api_key: str
    henrik_rate_limit_per_min: int
    poll_interval_seconds: int
    session_gap_minutes: int
    stall_alert_hours: int
    loss_streak_alert: int
    telegram_bot_token: str | None
    telegram_ops_chat_id: str | None
    telegram_admin_ids: frozenset[int]
    discord_bot_token: str | None
    discord_ops_channel_id: int | None
    discord_guild_id: int | None
    discord_admin_ids: frozenset[int]
    discord_webhook_url: str | None
    mirror_to_ops: bool

    @property
    def telegram_enabled(self) -> bool:
        return bool(self.telegram_bot_token)

    @property
    def discord_enabled(self) -> bool:
        return bool(self.discord_bot_token)

    @property
    def discord_webhook_enabled(self) -> bool:
        """Webhook yalnizca operator bildirimi gonderir, komut alamaz."""
        return bool(self.discord_webhook_url) and not self.discord_bot_token


def load_config() -> Config:
    api_key = os.getenv("HENRIK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "HENRIK_API_KEY tanimli degil. .env.example dosyasini .env olarak kopyalayip doldur."
        )

    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
    if not supabase_url or not supabase_key:
        raise RuntimeError(
            "SUPABASE_URL ve SUPABASE_SERVICE_KEY tanimli degil.\n"
            "Supabase Dashboard > Project Settings > API Keys > service_role anahtarini kopyala.\n"
            "Bu anahtar RLS'i baypas eder; sadece .env'de dursun, panele KOYMA."
        )
    if supabase_key.startswith("sb_publishable_") or supabase_key.startswith("eyJ") and "anon" in supabase_key:
        raise RuntimeError(
            "SUPABASE_SERVICE_KEY publishable/anon anahtari gibi gorunuyor. "
            "service_role anahtarini kullan, yoksa tracker RLS yuzunden hicbir sey yazamaz."
        )

    discord_ops = _opt_str("DISCORD_OPS_CHANNEL_ID")
    discord_guild = _opt_str("DISCORD_GUILD_ID")

    cfg = Config(
        supabase_url=supabase_url,
        supabase_service_key=supabase_key,
        henrik_api_key=api_key,
        henrik_rate_limit_per_min=_int("HENRIK_RATE_LIMIT_PER_MIN", 30),
        poll_interval_seconds=_int("POLL_INTERVAL_SECONDS", 300),
        session_gap_minutes=_int("SESSION_GAP_MINUTES", 20),
        stall_alert_hours=_int("STALL_ALERT_HOURS", 24),
        loss_streak_alert=_int("LOSS_STREAK_ALERT", 3),
        telegram_bot_token=_opt_str("TELEGRAM_BOT_TOKEN"),
        telegram_ops_chat_id=_opt_str("TELEGRAM_OPS_CHAT_ID"),
        telegram_admin_ids=_id_set("TELEGRAM_ADMIN_IDS"),
        discord_bot_token=_opt_str("DISCORD_BOT_TOKEN"),
        discord_ops_channel_id=int(discord_ops) if discord_ops else None,
        discord_guild_id=int(discord_guild) if discord_guild else None,
        discord_admin_ids=_id_set("DISCORD_ADMIN_IDS"),
        discord_webhook_url=_opt_str("DISCORD_WEBHOOK_URL"),
        mirror_to_ops=_bool("MIRROR_TO_OPS", True),
    )

    if not cfg.telegram_enabled and not cfg.discord_enabled:
        extra = ""
        if cfg.discord_webhook_url:
            extra = (
                "\nDISCORD_WEBHOOK_URL tanimli ama webhook yalnizca mesaj GONDERIR, "
                "komut ALAMAZ. Siparis baglayabilmek icin komut arayuzu sart."
            )
        raise RuntimeError(
            "Komut arayuzu gerekli: TELEGRAM_BOT_TOKEN veya DISCORD_BOT_TOKEN doldur." + extra
        )

    # Admin listesi yoksa bot yalnizca operator sohbetine cevap verir. O da yoksa
    # komutlar tamamen kapali kalir - sessizce calismasin diye erken hata veriyoruz.
    if cfg.telegram_enabled and not cfg.telegram_admin_ids and not cfg.telegram_ops_chat_id:
        raise RuntimeError(
            "Telegram acik ama ne TELEGRAM_ADMIN_IDS ne TELEGRAM_OPS_CHAT_ID tanimli; "
            "bot hicbir komuta cevap veremez."
        )
    if cfg.discord_enabled and not cfg.discord_admin_ids and not cfg.discord_ops_channel_id:
        raise RuntimeError(
            "Discord acik ama ne DISCORD_ADMIN_IDS ne DISCORD_OPS_CHANNEL_ID tanimli; "
            "bot hicbir komuta cevap veremez."
        )
    return cfg
