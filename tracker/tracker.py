"""Poll dongusu ve olay tespiti.

Her turda panelde 'atandi'/'devam' durumundaki, bir hesaba baglanmis ve
duraklatilmamis siparisler icin mmr-history cekilir. Uretilen olaylar:

  musteriye  -> rank atlama / dusme, seans ozeti, siparis tamamlandi
  operatore  -> takilma, maglubiyet serisi, act degisimi, API hatasi

Mac basina mesaj ATILMAZ. Maclar birikir, seans bittiginde (son mactan
SESSION_GAP_MINUTES gecince) tek ozet halinde gonderilir. Tek istisna rank
degisimi: o aninda gider.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

import commands
import henrik
import messages
import ranks
from config import Config
from notify import Dispatcher
from store import Store, StoreError

log = logging.getLogger(__name__)


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _entry_elo(entry: henrik.HistoryEntry) -> int | None:
    if entry.elo is not None:
        return int(entry.elo)
    if entry.tier_id is not None:
        return ranks.elo_from(entry.tier_id, entry.rr)
    return None


def _sorted_oldest_first(entries: list[henrik.HistoryEntry]) -> list[henrik.HistoryEntry]:
    """API yeniden eskiye donuyor. Tarih varsa ona gore, yoksa ters cevirerek sirala."""
    if all(entry.played_at for entry in entries):
        floor = datetime.min.replace(tzinfo=timezone.utc)
        return sorted(entries, key=lambda e: _parse_iso(e.played_at) or floor)
    return list(reversed(entries))


class Tracker:
    def __init__(self, config: Config, client: henrik.HenrikClient,
                 store: Store, dispatcher: Dispatcher):
        self.config = config
        self.client = client
        self.store = store
        self.dispatcher = dispatcher
        self._stop = asyncio.Event()

    def stop(self) -> None:
        self._stop.set()

    async def run(self) -> None:
        log.info("Takipci basladi (poll araligi: %s sn)", self.config.poll_interval_seconds)
        while not self._stop.is_set():
            try:
                await self.poll_once()
            except Exception:  # noqa: BLE001 - dongu hicbir sekilde olmemeli
                log.exception("Poll turunda beklenmeyen hata")
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.config.poll_interval_seconds)
            except asyncio.TimeoutError:
                pass
        log.info("Takipci durdu")

    async def poll_once(self) -> None:
        await self._auto_link()

        try:
            orders = await self.store.list_trackable()
        except StoreError as exc:
            log.error("Siparisler cekilemedi: %s", exc)
            await self.dispatcher.to_ops(messages.ops_error(None, str(exc)))
            return

        if not orders:
            return
        log.debug("%d siparis yoklaniyor", len(orders))

        for order in orders:
            try:
                await self._poll_order(order)
            except henrik.RateLimited as exc:
                log.warning("Rate limit, tur yarida kesildi: %s", exc)
                return
            except (henrik.HenrikError, StoreError) as exc:
                log.error("#%s sorgulanamadi: %s", order["handle"], exc)
                await self.dispatcher.to_ops(messages.ops_error(order, str(exc)))

    async def _auto_link(self) -> None:
        """Panelde riot_id girilmis ama takibe alinmamis siparisleri baglar.

        Boylece panele nick yazmak yeterli oluyor; /bagla komutu zorunlu degil.
        Basarisiz denemeler operatore bildirilir, aksi halde sessizce yok sayilir
        ve her turda tekrar denenip gurultu yapar.
        """
        try:
            pending = await self.store.list_pending_links()
        except StoreError as exc:
            log.error("Baglanacak siparisler cekilemedi: %s", exc)
            return

        for order in pending:
            try:
                ok, detail = await commands.resolve_and_link(
                    self.store, self.client, order, order["riot_id"]
                )
            except (henrik.HenrikError, StoreError) as exc:
                ok, detail = False, str(exc)

            if ok:
                linked = await self.store.get_order(order["handle"])
                if linked is not None:
                    await self.dispatcher.to_ops(messages.ops_order_linked(linked, auto=True))
                log.info("#%s otomatik baglandi (%s)", order["handle"], order["riot_id"])
            else:
                await self.dispatcher.to_ops(
                    messages.ops_link_failed(order, detail)
                )
                # riot_id'yi temizle ki her turda tekrar denenip spam yapmasin
                await self.store.set_riot_id(order["id"], None)
                log.warning("#%s baglanamadi, riot_id temizlendi: %s",
                            order["handle"], detail.replace("\n", " "))

    async def _poll_order(self, order: dict) -> None:
        entries = await self.client.get_mmr_history(
            order["region"], order["platform"], order["puuid"]
        )
        await self.store.update_state(order["id"], last_poll_at=datetime.now(timezone.utc).isoformat())

        known = await self.store.known_match_ids(order["id"])
        new_entries = [e for e in _sorted_oldest_first(entries) if e.match_id not in known]

        if new_entries:
            await self._handle_new_matches(order, new_entries)
        else:
            await self._handle_idle(order)

    async def _handle_new_matches(self, order: dict, entries: list[henrik.HistoryEntry]) -> None:
        order_id = order["id"]
        previous_elo = order["current_elo"] if order["current_elo"] is not None else order["start_elo"]

        # Siparis yeni baglandiysa API'nin dondugu gecmis, siparisten ONCE oynanmis
        # maclardir. Bunlari raporlanmis sayip sessizce kaydediyoruz: musteriye
        # "20 mac oynandi" diye kendi siparisi olmayan bir ozet gitmesin.
        is_baseline = order["last_match_id"] is None

        rows = []
        latest_elo = previous_elo
        latest_at = order["last_match_at"]
        for entry in entries:
            elo = _entry_elo(entry)
            rows.append({
                "match_id": entry.match_id,
                "played_at": entry.played_at,
                "rr_change": entry.rr_change,
                "elo": elo,
                "tier_id": entry.tier_id,
                "map_name": entry.map_name,
                "season": entry.season,
                "refunded_rr": entry.refunded_rr,
                "derank_protected": entry.derank_protected,
                "reported": is_baseline,
            })
            if elo is not None:
                latest_elo = elo
            if entry.played_at:
                latest_at = entry.played_at

        inserted = await self.store.insert_matches(order_id, rows)
        if not inserted:
            return

        newest_season = next((e.season for e in reversed(entries) if e.season), None)

        if is_baseline:
            # Baslangic cizgisi: durumu kaydet, hicbir bildirim gonderme.
            await self.store.update_state(
                order_id,
                current_elo=latest_elo,
                last_match_id=entries[-1].match_id,
                last_match_at=latest_at or datetime.now(timezone.utc).isoformat(),
                season=newest_season,
                session_open=False,
                stall_alerted=False,
            )
            log.info("#%s: baslangic cizgisi kuruldu (%d gecmis mac, %s)",
                     order["handle"], inserted, ranks.format_elo(latest_elo))
            return

        await self.store.update_state(
            order_id,
            current_elo=latest_elo,
            last_match_id=entries[-1].match_id,
            last_match_at=latest_at or datetime.now(timezone.utc).isoformat(),
            session_open=True,
            stall_alerted=False,
        )
        order = {**order, "current_elo": latest_elo, "last_match_at": latest_at, "session_open": True}

        log.info("#%s: %d yeni mac, %s -> %s", order["handle"], inserted,
                 ranks.format_elo(previous_elo), ranks.format_elo(latest_elo))

        # Act degisimi rank'i sifirlar; baslangic elo'su gecersiz kalir. Musteriye
        # "rank dustu" diye yanlis mesaj gitmesin diye takibi duraklatiyoruz.
        if await self._check_season_change(order, entries):
            return

        await self._check_rank_change(order, previous_elo, latest_elo)
        await self._check_loss_streak(order)
        await self._check_completion(order)

    async def _check_season_change(self, order: dict, entries: list[henrik.HistoryEntry]) -> bool:
        newest = next((e.season for e in reversed(entries) if e.season), None)
        if newest is None:
            return False

        known = order.get("season")
        if not known:
            await self.store.update_state(order["id"], season=newest)
            return False
        if newest == known:
            return False

        await self.store.update_state(order["id"], season=newest, paused=True)
        await self.dispatcher.to_ops(messages.ops_season_change(order, known, newest))
        log.warning("#%s: act degisti (%s -> %s), duraklatildi", order["handle"], known, newest)
        return True

    async def _check_rank_change(self, order: dict, old_elo: int, new_elo: int) -> None:
        old_tier, _ = ranks.tier_from_elo(old_elo)
        new_tier, _ = ranks.tier_from_elo(new_elo)
        if new_tier == old_tier:
            return
        if new_tier > old_tier:
            await self.dispatcher.to_customer(order, messages.rank_up(order, old_elo, new_elo))
        else:
            await self.dispatcher.to_customer(order, messages.rank_down(order, old_elo, new_elo))

    async def _check_loss_streak(self, order: dict) -> None:
        recent = await self.store.recent_matches(order["id"], limit=20)
        streak = 0
        for match in recent:
            if int(match.get("rr_change") or 0) < 0:
                streak += 1
            else:
                break

        threshold = self.config.loss_streak_alert
        if streak >= threshold and not order["loss_alerted"]:
            await self.dispatcher.to_ops(messages.ops_loss_streak(order, streak))
            await self.store.update_state(order["id"], loss_streak=streak, loss_alerted=True)
        elif streak < threshold:
            await self.store.update_state(order["id"], loss_streak=streak, loss_alerted=False)
        else:
            await self.store.update_state(order["id"], loss_streak=streak)

    async def _check_completion(self, order: dict) -> None:
        current = order.get("current_elo")
        if current is None or current < order["target_elo"]:
            return

        # Bekleyen seans ozetini once gonder ki son maclar rapordan dusmesin
        await self._flush_session(order, force=True)
        await self.store.update_state(order["id"], paused=True, session_open=False)

        stats = await self.store.match_stats(order["id"])
        await self.dispatcher.to_customer(order, messages.order_completed(order, stats))
        await self.dispatcher.to_ops(messages.ops_completed(order))
        log.info("#%s tamamlandi", order["handle"])

    async def _handle_idle(self, order: dict) -> None:
        """Yeni mac yok: seans kapanmis ya da siparis takilmis olabilir."""
        last_at = _parse_iso(order.get("last_match_at")) or _parse_iso(order.get("created_at"))
        if last_at is None:
            return
        idle_minutes = (datetime.now(timezone.utc) - last_at).total_seconds() / 60.0

        if order["session_open"] and idle_minutes >= self.config.session_gap_minutes:
            await self._flush_session(order)

        idle_hours = idle_minutes / 60.0
        if idle_hours >= self.config.stall_alert_hours and not order["stall_alerted"]:
            await self.dispatcher.to_ops(messages.ops_stall(order, idle_hours))
            await self.store.update_state(order["id"], stall_alerted=True)

    async def _flush_session(self, order: dict, *, force: bool = False) -> None:
        """Raporlanmamis maclari tek ozet halinde musteriye gonderir."""
        pending = await self.store.unreported_matches(order["id"])
        if not pending:
            if order["session_open"]:
                await self.store.update_state(order["id"], session_open=False)
            return

        stats = await self.store.match_stats(order["id"])
        sent = await self.dispatcher.to_customer(
            order, messages.session_summary(order, pending, stats)
        )
        if not sent and not force:
            # Musteri kanali henuz ayarlanmadi; maclari raporlanmamis birak ki
            # /musteri ile kanal baglaninca ilk ozette hepsi gitsin.
            log.info("#%s icin musteri kanali yok, ozet bekletiliyor", order["handle"])
            await self.store.update_state(order["id"], session_open=False)
            return

        await self.store.mark_reported(order["id"])
        await self.store.update_state(order["id"], session_open=False)
        log.info("#%s seans ozeti gonderildi (%d mac)", order["handle"], len(pending))
