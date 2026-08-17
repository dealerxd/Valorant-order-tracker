/* ============ ÖDEMELER ============

   İki ayrı borç, tek ekran: kendi boostçularına olan ve dışarıdaki satıcılara
   olan. Tanımlar ui-common.js'teki paraOzeti()'nden geliyor — Genel Bakış ve
   Siparişler ile aynı sayı.

   "Borç" = işi bitmiş ama ödenmemiş. Devam eden işin ücreti henüz borç değil;
   iş yarım kalırsa ödenmeyebilir.

   Dış satıcı maliyeti kendi kolonlarında (shared/migrations/002), `note`
   alanında değil — bir siparişin notunu düzenlemek borcu silmesin.
*/

function odemeBoosterGruplari(){
  const gruplar = {};
  activeRecs()
    .filter(r => !isOpen(r) && !r.paid && r.payout > 0 && r.boosterId && !isDis(r))
    .forEach(r => {
      (gruplar[r.boosterId] ||= { id:r.boosterId, ad:nameOf(r.boosterId), isler:[], toplam:0 });
      gruplar[r.boosterId].isler.push(r);
      gruplar[r.boosterId].toplam += r.payout;
    });
  return Object.values(gruplar).sort((a,b) => b.toplam - a.toplam);
}

function odemeSaticiGruplari(){
  const gruplar = {};
  activeRecs()
    .filter(r => isDis(r) && !r.vendorPaid && r.vendorCost > 0)
    .forEach(r => {
      const ad = r.vendor.trim();
      (gruplar[ad] ||= { ad, isler:[], tl:0, dovizler:{} });
      gruplar[ad].isler.push(r);
      gruplar[ad].tl += disMaliyetTL(r);
      // Satıcıya kendi para biriminde ödüyorsun; TL karşılığı sadece kâr hesabı için.
      gruplar[ad].dovizler[r.vendorCur] = (gruplar[ad].dovizler[r.vendorCur] || 0) + r.vendorCost;
    });
  return Object.values(gruplar).sort((a,b) => b.tl - a.tl);
}

/* Bir boostçunun tüm bekleyen işlerini ödendi işaretler. */
async function odeBooster(boosterId){
  const isler = odemeBoosterGruplari().find(g => g.id === boosterId);
  if(!isler) return;
  if(!confirm(`${isler.ad} · ${fmt(isler.toplam,'TRY')} — ${isler.isler.length} iş ödendi işaretlenecek. Devam?`)) return;
  await bulkPatch(isler.isler.map(r => r.id), { paid:true }, 'Ödeme işaretleme');
}

async function odeSatici(ad){
  const g = odemeSaticiGruplari().find(x => x.ad === ad);
  if(!g) return;
  const tutar = Object.entries(g.dovizler).map(([k,v]) => fmt(v,k)).join(' + ');
  if(!confirm(`${ad} · ${tutar} — ${g.isler.length} iş ödendi işaretlenecek. Devam?`)) return;
  await bulkPatch(g.isler.map(r => r.id), { vendor_paid:true }, 'Satıcı ödemesi');
}

function renderPayments(){
  const box = document.getElementById('odemeBody'); if(!box) return;
  if(!isAdmin()){ box.innerHTML = '<div class="ov-empty">Bu ekran yalnızca admin içindir.</div>'; return; }

  // Borç oyun şeridinden etkilenmemeli: "Valorant"a bakarken Rocket League
  // borcunun kaybolması ödemeyi unutturur.
  const P = paraOzeti(activeRecs());
  const bst = odemeBoosterGruplari();
  const sat = odemeSaticiGruplari();

  const kart = (etiket, deger, renk, ipucu) => `
    <div class="ov-kpi ${renk}"><div class="ov-kpi-bar"></div>
      <div class="ov-kpi-l">${esc(etiket)}</div>
      <div class="ov-kpi-v">${esc(deger)}</div>
      <div class="ov-kpi-h">${esc(ipucu)}</div></div>`;

  const kpi = `<div class="ov-kpis">
    ${kart('Booster borcu', fmt(P.borc,'TRY'), 'red', `${bst.length} kişi`)}
    ${kart('Satıcı borcu',  fmt(P.disBorc,'TRY'), 'amber', `${sat.length} satıcı`)}
    ${kart('Toplam borç',   fmt(P.borc + P.disBorc,'TRY'), 'gold', 'biten ama ödenmemiş')}
    ${kart('Dış kaynak gideri', fmt(P.disGider,'TRY'), 'blue', 'kârdan düşülen')}
  </div>`;

  const uyari = P.kurYok
    ? `<div class="ov-card"><div class="ov-note" style="opacity:1;color:var(--amber)">
        ${P.kurYok} dış kaynak işinin kuru girilmemiş — TL karşılığı hesaplanamadığı için
        yukarıdaki toplamlara dahil değil. Siparişi düzenleyip kuru girin.</div></div>`
    : '';

  const grupKart = (baslik, satirlar, bosMetin) => `
    <div class="ov-card"><div class="ov-h">${esc(baslik)}</div>
      ${satirlar || `<div class="ov-empty">${esc(bosMetin)}</div>`}</div>`;

  const boosterHTML = grupKart('Boosterlara', bst.map(g => `
    <div class="pay-row">
      <div class="pay-who">
        <div class="pay-name">${esc(g.ad)}</div>
        <div class="pay-sub">${g.isler.length} iş</div>
      </div>
      <div class="pay-amt">${fmt(g.toplam,'TRY')}</div>
      <button class="icon-btn go" onclick="odeBooster('${esc(g.id)}')">💰 Ödendi</button>
    </div>
    <div class="pay-jobs">${g.isler.map(r =>
      `<button class="pay-job" onclick="openDetail('${esc(r.id)}')">
         <span class="pay-job-r">${routeHTML(r)}</span>
         <span class="pay-job-a">${fmt(r.payout,'TRY')}</span></button>`).join('')}</div>`).join(''),
    'Bekleyen booster ödemesi yok.');

  const saticiHTML = grupKart('Dış satıcılara', sat.map(g => `
    <div class="pay-row">
      <div class="pay-who">
        <div class="pay-name">🏷 ${esc(g.ad)}</div>
        <div class="pay-sub">${g.isler.length} iş</div>
      </div>
      <div class="pay-amt">${Object.entries(g.dovizler).map(([k,v]) => fmt(v,k)).join(' + ')}
        ${g.tl ? `<span class="pay-tl">≈ ${fmt(g.tl,'TRY')}</span>` : ''}</div>
      <button class="icon-btn go" onclick="odeSatici('${esc(g.ad)}')">💰 Ödendi</button>
    </div>
    <div class="pay-jobs">${g.isler.map(r =>
      `<button class="pay-job" onclick="openDetail('${esc(r.id)}')">
         <span class="pay-job-r">${routeHTML(r)}</span>
         <span class="pay-job-a">${fmt(r.vendorCost, r.vendorCur)}</span></button>`).join('')}</div>`).join(''),
    'Bekleyen satıcı ödemesi yok.');

  box.innerHTML = kpi + uyari + `<div class="ov-grid">${boosterHTML}${saticiHTML}</div>`;
}
