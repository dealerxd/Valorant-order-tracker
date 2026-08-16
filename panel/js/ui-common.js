/* ============ ORTAK ARAYÜZ MODELİ ============

   Sidebar zili, Genel Bakış kartı ve sipariş görünümleri aynı soruları soruyor:
   "bu iş ne kadar zaman önce oldu?", "hangi siparişler dikkat istiyor?".
   Bunlar üç ayrı yerde hesaplanırsa aynı ekranda farklı sayılar görünür —
   zil "7 uyarı" derken kart "4" der. O yüzden tek kaynak burası.

   Eşikler de burada: bot 300 saniyede bir yokluyor (tracker/config.py
   POLL_INTERVAL_SECONDS), takılma uyarısı 24 saat, kayıp serisi 3.
   Bot tarafındaki değerler değişirse buradaki de değişmeli.
*/

const UI = {
  POLL_SEC: 300,      // tracker POLL_INTERVAL_SECONDS varsayılanı
  STALL_H: 24,        // STALL_ALERT_HOURS
  LOSS_N: 3,          // LOSS_STREAK_ALERT
  LS: 'rb.',          // localStorage önek — tek konvansiyon
};

/* --- Zaman ----------------------------------------------------------------

   Supabase bazı sütunları saat dilimi eki olmadan döndürüyor. Ham
   `new Date(x)` bunları YEREL saat sayar ve UTC+3'te 3 saatlik kayma
   üretir — "3 saat önce" ile "az önce" farkı. Tek çevirici kullanıyoruz. */
function tsMs(iso){
  if(!iso) return null;
  const s = String(iso);
  // 'Z' ya da ±HH:MM yoksa UTC kabul et.
  const norm = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(' ', 'T') + 'Z';
  const t = new Date(norm).getTime();
  return isFinite(t) ? t : null;
}
function agoText(iso){
  const t = tsMs(iso); if(t == null) return '—';
  const d = (Date.now() - t) / 1000;
  if(d < 0)     return 'az önce';
  if(d < 60)    return 'az önce';
  if(d < 3600)  return Math.round(d/60) + ' dk önce';
  if(d < 86400) return Math.round(d/3600) + ' sa önce';
  return Math.round(d/86400) + ' gün önce';
}
const hoursSince = iso => { const t = tsMs(iso); return t == null ? Infinity : (Date.now()-t)/3600000; };

/* --- Kapsam ---------------------------------------------------------------

   "Açık iş" tanımı da tek yerde: arşivlenmemiş ve akışı bitmemiş.
   NEXT_STATUS'ü olan bir durum akışın sonunda değil demektir. */
const isOpen     = r => !r.archived && !!NEXT_STATUS[r.durum];
const isActive   = r => !r.archived && (r.durum === 'atandi' || r.durum === 'devam');
const activeRecs = () => records.filter(r => !r.archived);

/* --- Takip durumu ---------------------------------------------------------

   Panel üç durumu ayırt edemiyordu: bot kapalı, RLS okutmuyor, hiç takipli iş
   yok. Üçü de boş tracker{} veriyor. En azından "hiç kayıt yok" ile "kayıt var
   ama eski" ayrımını yapıyoruz; ötesini panel bilemez. */
function botStatus(){
  const rows = Object.values(tracker).filter(t => {
    const r = records.find(x => x.id === t.order_id);
    return r && !r.archived;
  });
  if(!rows.length) return { hal:'yok', metin:'takipli iş yok', hesap:0, duraklatilan:0, son:null };

  const canli = rows.filter(t => !t.paused);
  const duraklatilan = rows.length - canli.length;
  const hesap = new Set(canli.map(t => t.puuid).filter(Boolean)).size;
  const son = canli.map(t => t.last_poll_at).filter(Boolean).sort().pop() || null;

  if(!son) return { hal:'bilinmiyor', metin:'yoklama kaydı yok', hesap, duraklatilan, son:null };
  const dk = (Date.now() - tsMs(son)) / 60000;
  // Üç tur kaçırmak anlamlı bir sinyal; 60 dk'yı geçince artık gecikme değil.
  const hal = dk <= UI.POLL_SEC * 3 / 60 ? 'calisiyor' : dk <= 60 ? 'gecikmeli' : 'durmus';
  const metin = { calisiyor:'çalışıyor', gecikmeli:'gecikmeli', durmus:'durmuş olabilir' }[hal];
  return { hal, metin, hesap, duraklatilan, son };
}

/* --- Uyarılar -------------------------------------------------------------

   Zil de Genel Bakış kartı da BUNU tüketiyor, kendi listesini kurmuyor.
   Finans uyarıları yalnızca admin'e: booster'da finance{} zaten boş, ona
   "boost fiyatı girilmemiş" demek her iş için yanlış alarm olurdu. */
function alertModel(){
  const out = [];
  const push = (tur, agirlik, metin, kayit) =>
    out.push({ tur, agirlik, metin, id: kayit ? kayit.id : null });

  for(const r of activeRecs()){
    const t = tracker[r.id];

    if(isActive(r) && !r.boosterId)
      push('atanmadi', 2, `#${r.id.slice(0,8)} atanmadı`, r);

    // 'yeni' hariç: sipariş daha yeni açılmışken fiyatın girilmemiş olması
    // normal. İş boostçuya geçtikten sonra hâlâ eksikse gerçek bir boşluk.
    if(isAdmin() && r.durum !== 'yeni' && !hasFin(r.id))
      push('finansyok', 1, `#${r.id.slice(0,8)} boost fiyatı girilmemiş`, r);

    if(isAdmin() && !isOpen(r) && r.payout > 0 && !r.paid && r.boosterId)
      push('odenmedi', 1, `${nameOf(r.boosterId)} · ${fmt(r.payout,'TRY')} ödenmedi`, r);

    // Takip uyarıları yalnızca botun yokladığı oyunlarda anlamlı.
    if(isTrackedGame(r.game) && isActive(r)){
      if(r.riotId && !t)
        push('baglanmadi', 2, `#${r.id.slice(0,8)} Riot ID girildi, bağlanmadı`, r);
      if(t && t.paused)
        push('duraklatildi', 2, `#${r.id.slice(0,8)} takip duraklatıldı`, r);
      // last_match_at bos = henuz hic mac cekilmemis (yeni baglandi).
      // hoursSince(null) Infinity donuyor; bot da bu durumda uyarmiyor
      // (tracker.py _handle_idle son mac yoksa baslangic zamanina bakiyor).
      if(t && !t.paused && t.last_match_at && hoursSince(t.last_match_at) > UI.STALL_H)
        push('takildi', 3, `#${r.id.slice(0,8)} ${UI.STALL_H} saattir maç yok`, r);
      if(t && (t.loss_streak || 0) >= UI.LOSS_N)
        push('kayip', 3, `#${r.id.slice(0,8)} üst üste ${t.loss_streak} mağlubiyet`, r);
    }
  }
  return out.sort((a,b) => b.agirlik - a.agirlik);
}

/* --- Para tanimlari -------------------------------------------------------

   Ayni etiket ("Net Kar", "Booster Borcu") uc ekranda uc farkli hesap
   uretiyordu. Rapor ve Genel Bakis ayni konvansiyonu kullaniyordu, Siparisler
   satiri ayrikti - ayni veriden 900 TL ve 1700 TL cikiyordu. Tanim artik burada.

   Konvansiyon (report.js'ten): GELIR yalnizca finans kaydi olan islerden,
   BOOSTER UCRETI tum aktif islerden. Finans kaydi girilmemis bir isin ucreti
   odenecek ama geliri henuz bilinmiyor - onu kardan dusmemek kari sisirirdi.
   Bu yuzden ekranlarda "N isin finansi girilmemis" uyarisi da veriliyor. */
function paraOzeti(){
  const aktif = activeRecs();
  const finansli = aktif.filter(r => hasFin(r.id));
  const brut = finansli.reduce((a,r) => a + brutTLof(r.id), 0);
  const netGelir = finansli.reduce((a,r) => a + netGelirTLof(r.id), 0);
  const ucret = aktif.reduce((a,r) => a + r.payout, 0);
  return {
    brut, netGelir, ucret,
    kar: netGelir - ucret,
    finanssiz: aktif.filter(r => r.durum !== 'yeni' && !hasFin(r.id)).length,
    // Borc = isi biten ama odenmemis ucretler. Devam eden isin ucreti henuz
    // borc degil; is yarim kalirsa odenmeyebilir.
    borc: aktif.filter(r => !isOpen(r) && !r.paid && r.payout > 0)
               .reduce((a,r) => a + r.payout, 0),
  };
}

/* Nav rozetleri. Boş/0 dönerse rozet çizilmez. */
function navBadge(tab){
  switch(tab){
    case 'genel':      return alertModel().length;
    case 'siparis':    return activeRecs().filter(isOpen).length;
    case 'arsiv':      return records.filter(r => r.archived).length;
    case 'boosterlar': return people.filter(p => p.active && p.role === 'booster').length;
    default:           return 0;
  }
}

/* --- localStorage ---------------------------------------------------------
   Kullanıcı tercihleri; okunamazsa (gizli sekme, kota) sessizce varsayılana
   düşüyoruz — tercih kaydı yüzünden panel açılmamalı. */
function lsGet(k, def){
  try { const v = localStorage.getItem(UI.LS + k); return v === null ? def : v; }
  catch(e){ return def; }
}
function lsSet(k, v){
  try { localStorage.setItem(UI.LS + k, v); } catch(e){}
}
