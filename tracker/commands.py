"""Platformdan bagimsiz komut mantigi.

Siparisler panelde (Supabase `resells`) acilir. Bot yeni siparis OLUSTURMAZ;
mevcut bir siparisi bir Valorant hesabina BAGLAR. Hedef rank, bolge ve not
panelden okunur, tekrar yazilmaz.
"""

from __future__ import annotations

import logging

import henrik
import messages
import ranks
import store as store_mod
from notify import Dispatcher
from store import Store

log = logging.getLogger(__name__)

PLATFORM_FIELD = {
    "telegram": "customer_tg_chat",
    "discord": "customer_dc_channel",
}


async def _require(store: Store, raw: str) -> tuple[dict | None, str | None]:
    handle = raw.strip().split()[0] if raw.strip() else ""
    if len(handle.lstrip("#")) < store_mod.MIN_HANDLE_LEN:
        return None, (
            f"Siparis kodu en az {store_mod.MIN_HANDLE_LEN} karakter olmali.\n"
            f"Kodlari gormek icin: /liste"
        )
    order = await store.get_order(handle)
    if order is None:
        return None, f"'{handle}' ile eslesen tek bir siparis bulunamadi. /liste ile kontrol et."
    return order, None


async def resolve_and_link(
    store: Store, client: henrik.HenrikClient, order: dict, riot_id: str
) -> tuple[bool, str]:
    """riot_id'yi cozup takibi baslatir. (basarili_mi, mesaj) doner.

    Hem /bagla komutu hem tracker'in otomatik baglama adimi bunu kullaniyor,
    boylece iki yol da ayni dogrulamalardan geciyor.
    """
    if "#" not in riot_id:
        return False, f"Riot ID 'isim#tag' formatinda olmali, gelen: {riot_id!r}"
    name, _, tag = riot_id.partition("#")
    if not name or not tag:
        return False, f"Riot ID 'isim#tag' formatinda olmali, gelen: {riot_id!r}"

    if not order["hedef"]:
        return False, (
            f"Siparişte hedef rank bos ({order['order_type']} turu). "
            f"Takip icin panelden hedef rank girilmeli."
        )
    target_tier = ranks.parse_rank(order["hedef"])
    if target_tier is None:
        return False, f"Panelde yazan hedef rank cozulemedi: '{order['hedef']}'"

    region = store_mod.panel_region_to_api(order["panel_region"])

    try:
        account = await client.get_account(name, tag)
    except henrik.AccountNotFound:
        return False, f"{name}#{tag} bulunamadi. Isim ve tag'i kontrol et."
    except henrik.HenrikError as exc:
        return False, f"Hesap sorgulanamadi: {exc}"

    existing = await store.find_by_puuid(account.puuid)
    if existing is not None and existing["id"] != order["id"]:
        return False, (
            f"Bu hesap zaten #{existing['handle']} siparisine bagli. "
            f"Once /kaldir {existing['handle']} yap."
        )

    platform = "pc" if "pc" in account.platforms else (account.platforms[0] if account.platforms else "pc")

    try:
        snapshot = await client.get_mmr(region, platform, account.puuid)
    except henrik.HenrikError as exc:
        return False, f"Rank bilgisi alinamadi: {exc}"

    if snapshot.tier_id is None or snapshot.tier_id < ranks.LOWEST_RANKED_TIER:
        if snapshot.games_needed_for_rating > 0:
            return False, (
                f"{name}#{tag} hala yerlestirmede. "
                f"Rank icin {snapshot.games_needed_for_rating} mac daha gerekiyor."
            )
        return False, f"{name}#{tag} su an unranked gorunuyor."

    start_elo = snapshot.elo if snapshot.elo is not None else ranks.elo_from(snapshot.tier_id, snapshot.rr)
    # Hedef bir tier esigi; elo_from() burada yanlis olur cunku Immortal'da
    # rr=0 Immortal 1 tabanina denk geliyor.
    target_elo = ranks.tier_threshold_elo(target_tier)

    if target_elo <= start_elo:
        return False, (
            f"Hedef mevcut rank'in altinda ya da esit.\n"
            f"Guncel: {ranks.format_elo(start_elo)} / Panel hedefi: {ranks.format_rank(target_tier)}"
        )

    await store.set_riot_id(order["id"], f"{account.name}#{account.tag}")
    await store.link(
        order_id=order["id"], puuid=account.puuid, region=region, platform=platform,
        start_elo=start_elo, target_elo=target_elo,
    )
    return True, (
        f"Hesap: {account.name}#{account.tag} ({region}/{platform})\n"
        f"Baslangic: {ranks.format_elo(start_elo)}\n"
        f"Hedef: {ranks.format_target(target_elo)}  (panelden: {order['hedef']})"
    )


async def cmd_link(store: Store, client: henrik.HenrikClient, dispatcher: Dispatcher, raw: str) -> str:
    """/bagla <siparis-kodu> <isim#tag> — paneldeki siparisi bir hesaba baglar."""
    tokens = raw.split()
    if len(tokens) < 2:
        return (
            "Kullanim: /bagla <siparis-kodu> <isim#tag>\n"
            "Ornek: /bagla a1b2c3d4 Player#TR1\n\n"
            "Siparis kodlarini gormek icin: /liste"
        )

    order, error = await _require(store, tokens[0])
    if error:
        return error
    assert order is not None

    ok, detail = await resolve_and_link(store, client, order, tokens[1])
    if not ok:
        return detail

    order = await store.get_order(order["handle"])
    assert order is not None
    await dispatcher.to_ops(messages.ops_order_linked(order))

    return (
        f"#{order['handle']} takibe alindi.\n\n"
        f"{detail}\n\n"
        f"Musteri bildirimi icin musterinin sohbetinde: /musteri {order['handle']}"
    )


async def cmd_list(store: Store) -> str:
    return messages.order_list(await store.list_orders())


async def cmd_status(store: Store, raw: str) -> str:
    order, error = await _require(store, raw)
    if error:
        return error
    assert order is not None
    if not order["tracked"]:
        return (
            f"#{order['handle']} ({order['baslangic']} -> {order['hedef']}) henuz bir hesaba bagli degil.\n"
            f"Baglamak icin: /bagla {order['handle']} <isim#tag>"
        )
    return messages.order_detail(
        order,
        await store.match_stats(order["id"]),
        await store.recent_matches(order["id"], limit=8),
    )


async def cmd_customer(store: Store, raw: str, platform: str, channel_id: str) -> str:
    tokens = raw.split()
    if not tokens:
        return "Kullanim: /musteri <siparis-kodu>  (musterinin sohbetinde calistir)"

    order, error = await _require(store, tokens[0])
    if error:
        return error
    assert order is not None
    if not order["tracked"]:
        return f"#{order['handle']} once bir hesaba baglanmali: /bagla {order['handle']} <isim#tag>"

    field = PLATFORM_FIELD.get(platform)
    if field is None:
        return "Bu platform desteklenmiyor."

    if len(tokens) > 1 and tokens[1].lower() in {"kapat", "off", "sil"}:
        await store.update_state(order["id"], **{field: None})
        return f"#{order['handle']} icin {platform} musteri bildirimi kapatildi."

    await store.update_state(order["id"], **{field: channel_id})
    return (
        f"#{order['handle']} ({order['riot_id']}) icin musteri bildirimleri bu sohbete gonderilecek.\n\n"
        f"Not: bu kanalda operator uyarilari gorunmez, sadece ilerleme mesajlari gider."
    )


async def cmd_pause(store: Store, raw: str) -> str:
    order, error = await _require(store, raw)
    if error:
        return error
    assert order is not None
    if not order["tracked"]:
        return f"#{order['handle']} zaten takip edilmiyor."
    if order["paused"]:
        return f"#{order['handle']} zaten duraklatilmis."
    await store.update_state(order["id"], paused=True)
    return f"#{order['handle']} duraklatildi. Devam icin: /devam {order['handle']}"


async def cmd_resume(store: Store, raw: str) -> str:
    order, error = await _require(store, raw)
    if error:
        return error
    assert order is not None
    if not order["tracked"]:
        return f"#{order['handle']} takip edilmiyor. Once /bagla ile hesap bagla."
    await store.update_state(order["id"], paused=False, stall_alerted=False, loss_alerted=False)
    return f"#{order['handle']} takibi tekrar basladi."


async def cmd_unlink(store: Store, raw: str) -> str:
    order, error = await _require(store, raw)
    if error:
        return error
    assert order is not None
    if not order["tracked"]:
        return f"#{order['handle']} zaten takip edilmiyor."

    stats = await store.match_stats(order["id"])
    await store.unlink(order["id"])
    return (
        f"#{order['handle']} takipten cikarildi ({stats['total']} mac kaydi silindi).\n"
        f"Paneldeki siparise dokunulmadi; riot_id alani duruyor."
    )


def cmd_help() -> str:
    return messages.HELP
