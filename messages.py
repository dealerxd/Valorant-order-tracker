"""Bildirim metinleri.

Iki hedef kitle var:
  - musteri: sadece kendi siparisinin ilerlemesi, sade dil, boostcu kimligi yok
  - operator: musteriye gitmeyen uyarilar (takilma, maglubiyet serisi, act degisimi)

Siparisler Supabase'den duz sozluk olarak geliyor (bkz. store.Store._shape).
"""

from __future__ import annotations

import ranks

PANEL_STATUS = {
    "yeni": "Yeni", "atandi": "Atandi", "devam": "Devam",
    "tamam": "Tamam", "odendi": "Odendi",
}


def _title(order: dict) -> str:
    who = order.get("riot_id") or f"{order.get('baslangic')} -> {order.get('hedef')}"
    return f"#{order['handle']} {who}"


def _progress_line(order: dict) -> str:
    start, target = order.get("start_elo"), order.get("target_elo")
    if start is None or target is None:
        return "(takip baglanmadi)"
    current = order.get("current_elo")
    current = start if current is None else current

    ratio = ranks.progress_ratio(start, current, target)
    line = f"{ranks.progress_bar(ratio)} %{ratio * 100:.0f}  (hedefe {ranks.rr_needed(current, target)} RR)"
    if ranks.tier_from_elo(current)[0] > ranks.PROGRESS_UNRELIABLE_ABOVE:
        line += "\n(Radiant bolgesinde ilerleme leaderboard sirasina bagli, oran yaklasiktir.)"
    return line


def _wl(stats: dict[str, int]) -> str:
    parts = [f"{stats['wins']}G", f"{stats['losses']}M"]
    if stats["draws"]:
        parts.append(f"{stats['draws']}B")
    return " ".join(parts)


def _signed(value: int) -> str:
    return f"+{value}" if value > 0 else str(value)


def _rr(match: dict) -> int:
    return int(match.get("rr_change") or 0)


# --- Musteriye giden mesajlar -------------------------------------------------

def order_started(order: dict) -> str:
    return (
        f"Siparisin baslatildi.\n\n"
        f"Hesap: {order['riot_id']}\n"
        f"Baslangic: {ranks.format_elo(order['start_elo'])}\n"
        f"Hedef: {ranks.format_target(order['target_elo'])}\n\n"
        f"Her oyun seansi bittiginde buradan ozet gonderecegiz."
    )


def session_summary(order: dict, matches: list[dict], stats: dict[str, int]) -> str:
    wins = sum(1 for m in matches if _rr(m) > 0)
    losses = sum(1 for m in matches if _rr(m) < 0)
    session_rr = sum(_rr(m) for m in matches)

    first_elo = matches[0].get("elo")
    start_elo = first_elo - _rr(matches[0]) if first_elo is not None else None
    end_elo = matches[-1].get("elo")

    lines = [
        f"Seans ozeti - {order['riot_id']}",
        "",
        f"Oynanan mac: {len(matches)}  ({wins}G {losses}M)",
        f"Bu seansta RR: {_signed(session_rr)}",
    ]
    if start_elo is not None and end_elo is not None and start_elo != end_elo:
        lines.append(f"Rank: {ranks.format_elo(start_elo)} -> {ranks.format_elo(end_elo)}")
    elif end_elo is not None:
        lines.append(f"Guncel rank: {ranks.format_elo(end_elo)}")

    protected = sum(1 for m in matches if m.get("derank_protected"))
    refunded = sum(int(m.get("refunded_rr") or 0) for m in matches)
    if protected:
        lines.append(f"Derank korumasi devreye girdi: {protected} mac")
    if refunded:
        lines.append(f"Iade edilen RR: {refunded}")

    lines += [
        "",
        "Toplam ilerleme:",
        _progress_line(order),
        f"Siparis genelinde: {stats['total']} mac, {_wl(stats)}, {_signed(stats['rr'])} RR",
    ]
    return "\n".join(lines)


def rank_up(order: dict, old_elo: int, new_elo: int) -> str:
    return (
        f"Rank atlandi!\n\n"
        f"{order['riot_id']}\n"
        f"{ranks.format_elo(old_elo)} -> {ranks.format_elo(new_elo)}\n\n"
        f"{_progress_line(order)}"
    )


def rank_down(order: dict, old_elo: int, new_elo: int) -> str:
    return (
        f"Rank dususu oldu.\n\n"
        f"{order['riot_id']}\n"
        f"{ranks.format_elo(old_elo)} -> {ranks.format_elo(new_elo)}\n\n"
        f"Calisma devam ediyor, hedef degismedi.\n"
        f"{_progress_line(order)}"
    )


def order_completed(order: dict, stats: dict[str, int]) -> str:
    current = order.get("current_elo") or order["target_elo"]
    return (
        f"Siparis tamamlandi.\n\n"
        f"Hesap: {order['riot_id']}\n"
        f"{ranks.format_elo(order['start_elo'])} -> {ranks.format_elo(current)}\n"
        f"Hedef: {ranks.format_target(order['target_elo'])}\n\n"
        f"Toplam {stats['total']} mac, {_wl(stats)}, {_signed(stats['rr'])} RR.\n"
        f"Tesekkurler!"
    )


# --- Operatore giden mesajlar -------------------------------------------------

def ops_order_linked(order: dict, *, auto: bool = False) -> str:
    kaynak = "panelden otomatik" if auto else "/bagla ile"
    lines = [
        f"[TAKIBE ALINDI] {_title(order)}  ({kaynak})",
        f"{ranks.format_elo(order['start_elo'])} -> {ranks.format_target(order['target_elo'])}",
        f"Bolge: {order['region']}/{order['platform']}  (panel: {order['panel_region']})",
    ]
    if auto and not order.get("customer_tg_chat") and not order.get("customer_dc_channel"):
        lines.append(
            f"\nMusteri kanali yok. Ilerleme raporu gitmesi icin musterinin "
            f"sohbetinde: /musteri {order['handle']}"
        )
    return "\n".join(lines)


def ops_link_failed(order: dict, reason: str) -> str:
    return (
        f"[BAGLANAMADI] {_title(order)}\n"
        f"Panelde girilen Riot ID: {order.get('riot_id') or '(bos)'}\n\n"
        f"{reason}\n\n"
        f"Riot ID alani temizlendi ki her turda tekrar denenmesin. "
        f"Duzeltip panele yeniden gir ya da /bagla {order['handle']} <isim#tag> kullan."
    )


def ops_stall(order: dict, hours: float) -> str:
    return (
        f"[TAKILMA] {_title(order)}\n"
        f"{hours:.0f} saattir yeni mac yok. Boostcuyla iletisime gec.\n"
        f"Son durum: {ranks.format_elo(order.get('current_elo'))}"
    )


def ops_loss_streak(order: dict, streak: int) -> str:
    return (
        f"[MAGLUBIYET SERISI] {_title(order)}\n"
        f"Ust uste {streak} maglubiyet.\n"
        f"Son durum: {ranks.format_elo(order.get('current_elo'))}\n"
        f"Musteri sormadan once kontrol et."
    )


def ops_season_change(order: dict, old_season: str, new_season: str) -> str:
    return (
        f"[ACT DEGISTI] {_title(order)}\n"
        f"{old_season} -> {new_season}\n\n"
        f"Rank sifirlandigi icin baslangic elo'su ({ranks.format_elo(order['start_elo'])}) "
        f"artik gecersiz. Takip DURAKLATILDI, musteriye yanlis mesaj gitmedi.\n\n"
        f"Yapman gereken: /kaldir {order['handle']} sonra /bagla {order['handle']} {order['riot_id']}"
    )


def ops_completed(order: dict) -> str:
    return (
        f"[TAMAMLANDI] {_title(order)}\n"
        f"-> {ranks.format_elo(order.get('current_elo'))}\n"
        f"Takip durdu. Panelde siparisi 'Tamam'a almayi unutma."
    )


def ops_error(order: dict | None, error: str) -> str:
    return f"[HATA] {_title(order) if order else 'genel'}\n{error}"


# --- Komut ciktilari ----------------------------------------------------------

def order_list(orders: list[dict]) -> str:
    if not orders:
        return "Panelde aktif siparis yok (durum 'atandi' veya 'devam' olanlar listelenir)."

    tracked = [o for o in orders if o["tracked"]]
    untracked = [o for o in orders if not o["tracked"]]
    lines: list[str] = []

    if tracked:
        lines += ["Takip edilen siparisler:", ""]
        for o in tracked:
            current = o["current_elo"] if o["current_elo"] is not None else o["start_elo"]
            ratio = ranks.progress_ratio(o["start_elo"], current, o["target_elo"])
            flag = "  [DURAKLATILDI]" if o["paused"] else ""
            lines.append(
                f"#{o['handle']}  {o['riot_id']}{flag}\n"
                f"   {ranks.format_elo(current)} -> {ranks.format_target(o['target_elo'])}"
                f"  (%{ratio * 100:.0f})"
            )
        lines.append("")

    if untracked:
        lines += ["Hesaba baglanmamis siparisler:", ""]
        for o in untracked:
            hedef = o["hedef"] or o["order_type"]
            note = "" if o["durum"] != "yeni" else "  (atanmadi, baglayabilirsin)"
            lines.append(
                f"#{o['handle']}  {o['baslangic'] or '?'} -> {hedef}"
                f"  [{PANEL_STATUS.get(o['durum'], o['durum'])}]{note}"
            )
        lines += ["", "Baglamak icin: /bagla <kod> <isim#tag>"]

    lines.append("Detay: /durum <kod>")
    return "\n".join(lines)


def order_detail(order: dict, stats: dict[str, int], last: list[dict]) -> str:
    current = order["current_elo"] if order["current_elo"] is not None else order["start_elo"]
    durum = PANEL_STATUS.get(order["durum"], order["durum"])
    if order["paused"]:
        durum += " / takip duraklatildi"

    lines = [
        f"{_title(order)}  [{durum}]",
        "",
        f"Bolge: {order['region']}/{order['platform']}",
        f"Baslangic: {ranks.format_elo(order['start_elo'])}",
        f"Guncel:    {ranks.format_elo(current)}",
        f"Hedef:     {ranks.format_target(order['target_elo'])}  (panel: {order['hedef']})",
        "",
        _progress_line(order),
        "",
        f"Toplam: {stats['total']} mac, {_wl(stats)}, {_signed(stats['rr'])} RR",
    ]

    if order.get("note"):
        lines += ["", f"Panel notu: {order['note']}"]

    targets = []
    if order.get("customer_tg_chat"):
        targets.append("Telegram")
    if order.get("customer_dc_channel"):
        targets.append("Discord")
    lines.append(f"Musteri bildirimi: {', '.join(targets) if targets else 'ayarlanmadi'}")

    if last:
        lines += ["", "Son maclar:"]
        for match in last:
            flag = " [derank korumali]" if match.get("derank_protected") else ""
            lines.append(f"  {_signed(_rr(match)):>4} RR  {match.get('map_name') or '?'}{flag}")

    return "\n".join(lines)


HELP = """Valorant Siparis Takip Botu

Siparisler PANELDE acilir. Bot siparis olusturmaz, mevcut siparisi
bir Valorant hesabina baglar. Hedef rank ve bolge panelden okunur.

/liste              Paneldeki aktif siparisler + takip durumlari
/bagla <kod> <isim#tag>
                    Siparisi bir hesaba baglar, takibi baslatir
/durum <kod>        Detay, ilerleme cubugu, son maclar
/musteri <kod>      Bu sohbeti siparisin musteri kanali yapar
/musteri <kod> kapat    Musteri bildirimini kapatir
/duraklat <kod>     Takibi gecici durdurur
/devam <kod>        Takibi tekrar baslatir
/kaldir <kod>       Takibi ve mac kayitlarini siler (panele dokunmaz)
/yardim             Bu mesaj

<kod> siparis ID'sinin ilk 8 karakteri. /liste ile gorursun.
"""
