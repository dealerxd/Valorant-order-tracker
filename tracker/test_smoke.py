"""Aga cikmadan calisan duman testi.

    python test_smoke.py

Hem HenrikDev istemcisi hem Supabase deposu sahte nesnelerle degistiriliyor;
geri kalan her sey (olay tespiti, mesaj uretimi, rank aritmetigi) gercek kodla
calisiyor. Ne API anahtari ne veritabani gerekiyor.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import henrik
import messages
import ranks
import store as store_mod
from config import Config
from notify import Dispatcher
from tracker import Tracker

PASSED: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"{label} BASARISIZ {detail}")
    PASSED.append(label)
    print(f"  ok  {label}")


def iso(minutes_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()


# --- Sahte depo ----------------------------------------------------------------

class FakeStore:
    """Store'un bellek ici karsiligi. Ayni async arayuzu sunar."""

    def __init__(self) -> None:
        self.orders: dict[str, dict] = {}
        self.matches: dict[str, list[dict]] = {}

    def add_order(self, order_id: str, **fields) -> dict:
        base = {
            "id": order_id, "handle": store_mod.handle_of(order_id),
            "riot_id": "Boost#TR1", "name": "Boost", "tag": "TR1",
            "panel_region": "TR", "durum": "devam", "order_type": "rank",
            "baslangic": "Gold 1", "hedef": "Gold 3", "note": None,
            "booster_id": None, "archived": False, "created_at": iso(600),
            "tracked": True, "puuid": f"puuid-{order_id}", "region": "eu",
            "platform": "pc", "start_elo": 900, "target_elo": 1100,
            "current_elo": 900, "last_match_id": None, "last_match_at": None,
            "season": None, "session_open": False, "stall_alerted": False,
            "loss_streak": 0, "loss_alerted": False, "paused": False,
            "customer_tg_chat": None, "customer_dc_channel": None,
        }
        base.update(fields)
        self.orders[order_id] = base
        self.matches.setdefault(order_id, [])
        return base

    async def list_pending_links(self) -> list[dict]:
        return [dict(o) for o in self.orders.values()
                if not o["tracked"] and o["riot_id"]
                and o["durum"] in store_mod.ACTIVE_STATUSES and not o["archived"]]

    async def set_riot_id(self, order_id: str, riot_id) -> None:
        self.orders[order_id]["riot_id"] = riot_id or ""

    async def list_trackable(self) -> list[dict]:
        return [dict(o) for o in self.orders.values()
                if o["tracked"] and not o["paused"] and o["durum"] in store_mod.ACTIVE_STATUSES]

    async def list_orders(self, *, only_tracked: bool = False) -> list[dict]:
        rows = [dict(o) for o in self.orders.values()
                if o["durum"] in store_mod.LISTABLE_STATUSES]
        return [o for o in rows if o["tracked"]] if only_tracked else rows

    async def get_order(self, handle: str) -> dict | None:
        handle = handle.strip().lstrip("#").lower()
        hits = [o for o in self.orders.values() if o["handle"].startswith(handle)]
        return dict(hits[0]) if len(hits) == 1 else None

    async def update_state(self, order_id: str, **fields) -> None:
        allowed = {
            "puuid", "region", "platform", "start_elo", "target_elo", "current_elo",
            "last_match_id", "last_match_at", "last_poll_at", "season", "session_open",
            "stall_alerted", "loss_streak", "loss_alerted", "paused",
            "customer_tg_chat", "customer_dc_channel",
        }
        unknown = set(fields) - allowed
        if unknown:
            raise ValueError(f"Bilinmeyen alan(lar): {', '.join(sorted(unknown))}")
        self.orders[order_id].update(fields)

    async def known_match_ids(self, order_id: str) -> set[str]:
        return {m["match_id"] for m in self.matches.get(order_id, [])}

    async def insert_matches(self, order_id: str, rows: list[dict]) -> int:
        known = await self.known_match_ids(order_id)
        fresh = [r for r in rows if r["match_id"] not in known]
        for row in fresh:
            self.matches[order_id].append({"reported": False, **row})
        return len(fresh)

    async def unreported_matches(self, order_id: str) -> list[dict]:
        rows = [m for m in self.matches.get(order_id, []) if not m["reported"]]
        return sorted(rows, key=lambda m: m["played_at"] or "")

    async def mark_reported(self, order_id: str) -> None:
        for m in self.matches.get(order_id, []):
            m["reported"] = True

    async def recent_matches(self, order_id: str, limit: int = 10) -> list[dict]:
        rows = sorted(self.matches.get(order_id, []),
                      key=lambda m: m["played_at"] or "", reverse=True)
        return rows[:limit]

    async def match_stats(self, order_id: str) -> dict[str, int]:
        changes = [int(m.get("rr_change") or 0) for m in self.matches.get(order_id, [])]
        return {
            "total": len(changes),
            "wins": sum(1 for c in changes if c > 0),
            "losses": sum(1 for c in changes if c < 0),
            "draws": sum(1 for c in changes if c == 0),
            "rr": sum(changes),
        }


class FakeSender:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    async def send(self, target: str, text: str) -> None:
        self.sent.append((target, text))

    def to(self, target: str) -> list[str]:
        return [t for tgt, t in self.sent if tgt == target]


class FakeHenrik:
    def __init__(self) -> None:
        self.entries: list[henrik.HistoryEntry] = []

    async def get_mmr_history(self, region: str, platform: str, puuid: str):
        return list(reversed(self.entries))  # gercek API yeniden eskiye doner


def make_entry(match_id: str, rr_change: int, elo: int, minutes_ago: float,
               map_name: str = "Ascent", season: str = "e12a1"):
    tier_id, rr = ranks.tier_from_elo(elo)
    return henrik.HistoryEntry(
        match_id=match_id, played_at=iso(minutes_ago), tier_id=tier_id,
        tier_name=ranks.tier_name(tier_id), rr=rr, rr_change=rr_change, elo=elo,
        map_name=map_name, refunded_rr=0, derank_protected=False, season=season,
    )


def make_config() -> Config:
    return Config(
        supabase_url="https://x.supabase.co", supabase_service_key="service-key",
        henrik_api_key="test", henrik_rate_limit_per_min=30, poll_interval_seconds=1,
        session_gap_minutes=20, stall_alert_hours=24, loss_streak_alert=3,
        telegram_bot_token="x", telegram_ops_chat_id="OPS", telegram_admin_ids=frozenset(),
        discord_bot_token=None, discord_ops_channel_id=None, discord_guild_id=None,
        discord_admin_ids=frozenset(), discord_webhook_url=None, mirror_to_ops=False,
    )


# --- ranks ---------------------------------------------------------------------

def test_ranks() -> None:
    print("\n[ranks]")
    check("elo formulu dokuman ornegiyle uyusuyor", ranks.elo_from(18, 38) == 1538)
    check("elo -> tier geri donusumu", ranks.tier_from_elo(1538) == (18, 38))
    check("Iron 1 sifir elo", ranks.elo_from(3, 0) == 0)

    # Frqst#lFojo hesabinin canli yanitindan alinan degerler
    check("Immortal 2 / 191 RR -> elo 2291", ranks.elo_from(25, 191) == 2291)
    check("elo 2291 -> Immortal 2 / 191 RR", ranks.tier_from_elo(2291) == (25, 191))
    check("elo 2306 Immortal 3'e dusuyor", ranks.tier_from_elo(2306)[0] == 26)
    check("Immortal alti gidis-donus bozulmadi", ranks.tier_from_elo(947) == (12, 47))

    check("Immortal 2 esigi 2200", ranks.tier_threshold_elo(25) == 2200)
    check("Radiant esigi 2400", ranks.tier_threshold_elo(27) == 2400)
    check("hedef esigi elo_from ile karismiyor",
          ranks.tier_threshold_elo(25) != ranks.elo_from(25, 0))

    check("turkce rank cozumu", ranks.parse_rank("Elmas 2") == 19)
    check("kisaltma cozumu", ranks.parse_rank("g3") == 14)
    check("noktali i cozumu", ranks.parse_rank("altın 1") == 12)
    check("gecersiz girdi None", ranks.parse_rank("zurna 9") is None)
    check("hedef formatinda RR gosterilmiyor", ranks.format_target(1200) == "Platinum 1")

    # Panelin RANK_ORDER etiketleri
    panel = ["Bronze 1", "Silver 3", "Gold 2", "Plat 1", "Plat 3", "Diamond 2",
             "Ascendant 1", "Immortal 3"]
    check("panel rank etiketleri cozuluyor",
          all(ranks.parse_rank(r) is not None for r in panel))
    check("panelin 'Plat 1' etiketi Platinum 1'e esleniyor", ranks.parse_rank("Plat 1") == 15)


# --- store yardimcilari --------------------------------------------------------

async def test_webhook_mode() -> None:
    """Webhook modunda musteri bildirimleri Discord'a GITMEMELI (tek kanal)."""
    print("\n[webhook modu]")
    sender = FakeSender()
    dispatcher = Dispatcher()
    dispatcher.register_discord(sender, "webhook", ops_only=True)

    order = {"customer_tg_chat": None, "customer_dc_channel": "123456"}
    sent = await dispatcher.to_customer(order, "musteri mesaji")
    check("webhook modunda musteriye gonderilmedi", sent is False)
    check("webhook kanalina musteri mesaji sizmadi", len(sender.sent) == 0, str(sender.sent))

    await dispatcher.to_ops("operator uyarisi")
    check("operator mesaji webhook'a gitti", len(sender.sent) == 1)

    # Bot modunda (ops_only=False) musteri kanali normal calismali
    sender2 = FakeSender()
    d2 = Dispatcher()
    d2.register_discord(sender2, 999)
    check("bot modunda musteriye gonderiliyor",
          await d2.to_customer(order, "musteri mesaji") is True)


def test_store_helpers() -> None:
    print("\n[store yardimcilari]")
    check("TR bolgesi eu'ya esleniyor", store_mod.panel_region_to_api("TR") == "eu")
    check("NA bolgesi na'ya esleniyor", store_mod.panel_region_to_api("NA") == "na")
    check("Diger bolgesi eu'ya dusuyor", store_mod.panel_region_to_api("Diğer") == "eu")
    check("bos bolge eu'ya dusuyor", store_mod.panel_region_to_api(None) == "eu")
    check("handle UUID'nin ilk 8 karakteri",
          store_mod.handle_of("a1b2c3d4-e5f6-7890-abcd-ef1234567890") == "a1b2c3d4")


# --- takipci ------------------------------------------------------------------

async def test_tracker() -> None:
    print("\n[takipci]")
    sender = FakeSender()
    dispatcher = Dispatcher()
    dispatcher.register_telegram(sender, "OPS")

    store = FakeStore()
    fake = FakeHenrik()
    tracker = Tracker(make_config(), fake, store, dispatcher)  # type: ignore[arg-type]

    oid = "aaaaaaaa-0000-0000-0000-000000000001"
    # last_match_id dolu = baslangic cizgisi zaten kurulmus (bkz. test_baseline)
    store.add_order(oid, customer_tg_chat="CUSTOMER", last_match_id="onceki", current_elo=900)

    # 1. tur: iki galibiyet az once oynandi, rank degismiyor
    fake.entries = [make_entry("a1", 25, 925, 10), make_entry("a2", 22, 947, 5)]
    await tracker.poll_once()
    check("maclar kaydedildi", (await store.match_stats(oid))["total"] == 2)
    check("guncel elo guncellendi", store.orders[oid]["current_elo"] == 947)
    check("seans acik", store.orders[oid]["session_open"] is True)
    check("rank degismedi, musteriye mesaj yok", len(sender.to("CUSTOMER")) == 0)

    # 2. tur: ayni veri tekrar geldi
    await tracker.poll_once()
    check("tekrar eden maclar yok sayildi", (await store.match_stats(oid))["total"] == 2)
    check("seans acikken erken ozet yok", len(sender.to("CUSTOMER")) == 0)

    # 3. tur: Gold 2'ye gecis -> aninda rank bildirimi
    fake.entries.append(make_entry("a3", 30, 1005, 2))
    await tracker.poll_once()
    msgs = sender.to("CUSTOMER")
    check("rank atlama bildirimi gitti", len(msgs) == 1, str(msgs))
    check("rank atlama metni dogru", "Rank atlandi" in msgs[0])
    check("ozet henuz gitmedi", len(await store.unreported_matches(oid)) == 3)

    # 4. tur: son mac 30 dk once kaldi -> seans ozeti
    store.orders[oid]["last_match_at"] = iso(30)
    await tracker.poll_once()
    msgs = sender.to("CUSTOMER")
    check("seans ozeti gitti", len(msgs) == 2)
    check("ozet 3 maci birlikte raporladi", "Oynanan mac: 3" in msgs[1])
    check("maclar raporlandi", len(await store.unreported_matches(oid)) == 0)
    check("seans kapandi", store.orders[oid]["session_open"] is False)

    # 5. tur: ust uste 3 maglubiyet -> operatore uyari
    before = len(sender.to("CUSTOMER"))
    fake.entries += [make_entry("b1", -20, 985, 1.5), make_entry("b2", -19, 966, 1.0),
                     make_entry("b3", -21, 945, 0.5)]
    await tracker.poll_once()
    check("maglubiyet serisi uyarisi gitti",
          any("MAGLUBIYET SERISI" in m for m in sender.to("OPS")))
    check("rank dususu musteriye bildirildi",
          any("Rank dususu" in m for m in sender.to("CUSTOMER")[before:]))

    # 6. tur: hedefe ulasma
    fake.entries.append(make_entry("c1", 160, 1105, 0.2))
    await tracker.poll_once()
    check("takip duraklatildi", store.orders[oid]["paused"] is True)
    check("tamamlanma mesaji gitti",
          any("Siparis tamamlandi" in m for m in sender.to("CUSTOMER")))
    check("operatore panel hatirlatmasi gitti",
          any("Panelde siparisi 'Tamam'a almayi unutma" in m for m in sender.to("OPS")))
    check("son seans ozeti de gonderildi", len(await store.unreported_matches(oid)) == 0)

    # 7. tur: duraklatilan siparis yoklanmiyor
    total = (await store.match_stats(oid))["total"]
    fake.entries.append(make_entry("c2", 20, 1125, 0.1))
    await tracker.poll_once()
    check("duraklatilan siparis yoklanmiyor", (await store.match_stats(oid))["total"] == total)


async def test_mirror_to_ops() -> None:
    """Musteriye giden mesajin kopyasi operatore de dusmeli."""
    print("\n[operatore kopyalama]")
    sender = FakeSender()
    dispatcher = Dispatcher()
    dispatcher.register_telegram(sender, "OPS")
    dispatcher.set_mirror_to_ops(True)

    order = {"handle": "abc12345", "riot_id": "Player#TR1",
             "customer_tg_chat": "CUSTOMER", "customer_dc_channel": None}
    await dispatcher.to_customer(order, "Rank atlandi!")

    check("musteriye gitti", len(sender.to("CUSTOMER")) == 1)
    ops = sender.to("OPS")
    check("operatore kopya dustu", len(ops) == 1, str(ops))
    check("kopyada siparis kodu var", "abc12345" in ops[0])
    check("kopyada asil metin var", "Rank atlandi!" in ops[0])

    # Musteri kanali yoksa kopya yine gelmeli, ama uyari etiketiyle
    sender2 = FakeSender()
    d2 = Dispatcher()
    d2.register_telegram(sender2, "OPS")
    d2.set_mirror_to_ops(True)
    kanalsiz = {"handle": "def67890", "riot_id": "X#Y",
                "customer_tg_chat": None, "customer_dc_channel": None}
    await d2.to_customer(kanalsiz, "Seans ozeti")
    check("kanalsizda da operatore dustu", len(sender2.to("OPS")) == 1)
    check("kanal yok uyarisi var", "MUSTERI KANALI YOK" in sender2.to("OPS")[0])

    # Musteri kanali = operator kanali ise cift gonderim olmamali
    sender3 = FakeSender()
    d3 = Dispatcher()
    d3.register_telegram(sender3, "OPS")
    d3.set_mirror_to_ops(True)
    ayni = {"handle": "aaa", "riot_id": "Z#W",
            "customer_tg_chat": "OPS", "customer_dc_channel": None}
    await d3.to_customer(ayni, "tek mesaj")
    check("ayni kanalda cift gonderim yok", len(sender3.to("OPS")) == 1,
          str(sender3.to("OPS")))


async def test_auto_link() -> None:
    """Panele nick girmek tek basina takibi baslatmali."""
    print("\n[otomatik baglama]")
    sender = FakeSender()
    dispatcher = Dispatcher()
    dispatcher.register_telegram(sender, "OPS")

    store = FakeStore()
    fake = FakeHenrik()
    tracker = Tracker(make_config(), fake, store, dispatcher)  # type: ignore[arg-type]

    # Panelde riot_id var ama tracker_state yok
    oid = "11111111-0000-0000-0000-000000000007"
    store.add_order(oid, tracked=False, riot_id="Panelden#TR1", hedef="Gold 3")
    check("baslangicta takipte degil", len(await store.list_pending_links()) == 1)

    # resolve_and_link'i sahte bir hesapla degistir (aga cikmayalim)
    import commands as cmd_mod
    gercek = cmd_mod.resolve_and_link

    async def sahte_ok(store_, client_, order_, riot_id_):
        await store_.set_riot_id(order_["id"], riot_id_)
        store_.orders[order_["id"]].update(
            tracked=True, puuid="p-auto", start_elo=900, target_elo=1100, current_elo=900,
        )
        return True, "baglandi"

    cmd_mod.resolve_and_link = sahte_ok
    try:
        await tracker.poll_once()
    finally:
        cmd_mod.resolve_and_link = gercek

    check("otomatik baglandi", store.orders[oid]["tracked"] is True)
    check("bekleyen kalmadi", len(await store.list_pending_links()) == 0)
    ops = sender.to("OPS")
    check("operatore bildirildi", any("TAKIBE ALINDI" in m for m in ops), str(ops))
    check("otomatik oldugu belirtildi", any("panelden otomatik" in m for m in ops))
    check("musteri kanali uyarisi var", any("/musteri" in m for m in ops))


async def test_auto_link_failure() -> None:
    """Hatali nick sonsuz tekrar etmemeli."""
    print("\n[otomatik baglama - hata]")
    sender = FakeSender()
    dispatcher = Dispatcher()
    dispatcher.register_telegram(sender, "OPS")

    store = FakeStore()
    tracker = Tracker(make_config(), FakeHenrik(), store, dispatcher)  # type: ignore[arg-type]

    oid = "22222222-0000-0000-0000-000000000008"
    store.add_order(oid, tracked=False, riot_id="BozukNick")

    import commands as cmd_mod
    gercek = cmd_mod.resolve_and_link

    async def sahte_hata(store_, client_, order_, riot_id_):
        return False, "Riot ID 'isim#tag' formatinda olmali"

    cmd_mod.resolve_and_link = sahte_hata
    try:
        await tracker.poll_once()
    finally:
        cmd_mod.resolve_and_link = gercek

    check("operatore hata bildirildi",
          any("BAGLANAMADI" in m for m in sender.to("OPS")), str(sender.to("OPS")))
    check("riot_id temizlendi", store.orders[oid]["riot_id"] == "")
    check("tekrar denenmeyecek", len(await store.list_pending_links()) == 0)


async def test_baseline() -> None:
    """Siparis yeni baglandiginda API'nin dondugu gecmis rapor edilmemeli."""
    print("\n[baslangic cizgisi]")
    sender = FakeSender()
    dispatcher = Dispatcher()
    dispatcher.register_telegram(sender, "OPS")

    store = FakeStore()
    fake = FakeHenrik()
    tracker = Tracker(make_config(), fake, store, dispatcher)  # type: ignore[arg-type]

    oid = "ffffffff-0000-0000-0000-000000000006"
    store.add_order(oid, customer_tg_chat="CUSTOMER")  # last_match_id = None
    check("baglanti sonrasi last_match_id bos", store.orders[oid]["last_match_id"] is None)

    # Siparisten ONCE oynanmis 20 mac; sonuncusu saatler once
    fake.entries = [make_entry(f"eski{i}", 15 if i % 2 else -12, 900 + i * 3, 600 - i * 30)
                    for i in range(20)]
    await tracker.poll_once()

    check("gecmis maclar kaydedildi", (await store.match_stats(oid))["total"] == 20)
    check("gecmis raporlanmis sayildi", len(await store.unreported_matches(oid)) == 0)
    check("musteriye gecmis ozeti GITMEDI", len(sender.to("CUSTOMER")) == 0,
          str(sender.to("CUSTOMER")))
    check("seans acilmadi", store.orders[oid]["session_open"] is False)
    check("sezon baseline'da kaydedildi", store.orders[oid]["season"] == "e12a1")
    check("elo baseline'da guncellendi", store.orders[oid]["current_elo"] is not None)

    # Baseline sonrasi gelen ilk gercek mac normal islenmeli
    fake.entries.append(make_entry("yeni1", 20, 1005, 2))
    await tracker.poll_once()
    check("baseline sonrasi yeni mac raporlanacak",
          len(await store.unreported_matches(oid)) == 1)
    check("baseline sonrasi seans acildi", store.orders[oid]["session_open"] is True)


async def test_season_change() -> None:
    print("\n[act degisimi]")
    sender = FakeSender()
    dispatcher = Dispatcher()
    dispatcher.register_telegram(sender, "OPS")

    store = FakeStore()
    fake = FakeHenrik()
    tracker = Tracker(make_config(), fake, store, dispatcher)  # type: ignore[arg-type]

    oid = "bbbbbbbb-0000-0000-0000-000000000002"
    store.add_order(oid, customer_tg_chat="CUSTOMER", start_elo=1800,
                    target_elo=2000, current_elo=1800)

    fake.entries = [make_entry("s1", 20, 1820, 5, season="e12a1")]
    await tracker.poll_once()
    check("ilk sezon kaydedildi", store.orders[oid]["season"] == "e12a1")
    check("ilk turda act uyarisi yok", not any("ACT DEGISTI" in m for m in sender.to("OPS")))

    before = len(sender.to("CUSTOMER"))
    fake.entries.append(make_entry("s2", 15, 900, 1, season="e12a2"))
    await tracker.poll_once()

    check("act degisimi operatore bildirildi",
          any("ACT DEGISTI" in m for m in sender.to("OPS")))
    check("takip duraklatildi", store.orders[oid]["paused"] is True)
    check("yeni sezon kaydedildi", store.orders[oid]["season"] == "e12a2")
    check("musteriye yanlis rank dususu gitmedi",
          len(sender.to("CUSTOMER")) == before)


# --- mesajlar -----------------------------------------------------------------

async def test_messages() -> None:
    print("\n[mesajlar]")
    store = FakeStore()
    oid = "cccccccc-0000-0000-0000-000000000003"
    order = store.add_order(oid, current_elo=1000, note="ornek not",
                            customer_tg_chat="CUSTOMER")
    await store.insert_matches(oid, [{
        "match_id": "x1", "played_at": iso(60), "rr_change": 25, "elo": 925,
        "tier_id": 12, "map_name": "Split", "season": "e12a1",
        "refunded_rr": 0, "derank_protected": False,
    }])
    stats = await store.match_stats(oid)

    detail = messages.order_detail(order, stats, await store.recent_matches(oid))
    check("detay ilerleme yuzdesi iceriyor", "%50" in detail, detail)
    check("detay panel hedefini de yaziyor", "panel: Gold 3" in detail)
    check("detay musteri kanalini yaziyor", "Telegram" in detail)

    # Baglanmamis 'yeni' siparis de listede gorunmeli (atanmadan once baglanabilsin)
    store.add_order("dddddddd-0000-0000-0000-000000000004", tracked=False, durum="yeni",
                    riot_id="", baslangic="Silver 2", hedef="Gold 1")
    # 'tamam' olan siparis listede gorunmemeli
    store.add_order("eeeeeeee-0000-0000-0000-000000000005", tracked=False, durum="tamam",
                    riot_id="", baslangic="Gold 1", hedef="Plat 1")

    listing = messages.order_list(await store.list_orders())
    check("liste bagli siparisi gosteriyor", "Takip edilen siparisler" in listing)
    check("liste baglanmamis siparisi ayiriyor", "Hesaba baglanmamis" in listing)
    check("liste 'yeni' siparisi de gosteriyor", "dddddddd" in listing)
    check("'yeni' siparise baglanabilir notu var", "atanmadi, baglayabilirsin" in listing)
    check("liste 'tamam' siparisi gizliyor", "eeeeeeee" not in listing, listing)
    check("liste bagla ipucu veriyor", "/bagla" in listing)
    check("bos liste anlamli mesaj veriyor", "aktif siparis yok" in messages.order_list([]))

    # Yoklama 'yeni'yi almamali - kimse oynamiyorken bos takilma uyarisi uretmesin
    trackable = await store.list_trackable()
    check("yoklama 'yeni' siparisi almiyor",
          all(o["durum"] in store_mod.ACTIVE_STATUSES for o in trackable))

    summary = messages.session_summary(order, await store.unreported_matches(oid), stats)
    check("ozet mac sayisi iceriyor", "Oynanan mac: 1" in summary)


def main() -> int:
    test_ranks()
    test_store_helpers()
    asyncio.run(test_webhook_mode())
    asyncio.run(test_mirror_to_ops())
    asyncio.run(test_auto_link())
    asyncio.run(test_auto_link_failure())
    asyncio.run(test_baseline())
    asyncio.run(test_tracker())
    asyncio.run(test_season_change())
    asyncio.run(test_messages())
    print(f"\n{len(PASSED)} kontrol gecti.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
