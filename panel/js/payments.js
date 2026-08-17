/* ============ ÖDEMELER ============

   İki ayrı borç, tek ekran: kendi boostçularına olan ve dışarıdaki satıcılara
   olan. Tanımlar ui-common.js'teki paraOzeti()'nden geliyor — Genel Bakış ve
   Siparişler ile aynı sayı.

   "Borç" = işi bitmiş ama ödenmemiş. Devam eden işin ücreti henüz borç değil;
   iş yarım kalırsa ödenmeyebilir.

   Dış satıcı maliyeti kendi kolonlarında (shared/migrations/002), `note`
   alanında değil — bir siparişin notunu düzenlemek borcu silmesin.
*/

/* --- Ödeme dönemi ---------------------------------------------------------

   "Borç takibi dağınık" şikayetinin cevabı: ödeme genelde bir DÖNEM sonunda
   toptan yapılıyor ("bu ayın hakedişleri"), tek tek iş bazında değil. Dönem
   siparişin TARİHİNE göre süzüyor — ödemenin kendisinin tarihi tutulmuyor,
   olmayan bir alana dayanmaktansa var olanı kullanıyoruz.

   Varsayılan "tümü": bir borcu dönem filtresi yüzünden görmemek, filtrenin
   sağladığı düzenden pahalı. */
const DONEMLER = [
  ['hepsi',  'Tümü',        () => null],
  ['ay',     'Bu ay',       () => { const d = new Date(); return [yeniAy(d, 0), yeniAy(d, 1)]; }],
  ['gecenay','Geçen ay',    () => { const d = new Date(); return [yeniAy(d, -1), yeniAy(d, 0)]; }],
  ['hafta',  'Son 7 gün',   () => [Date.now() - 7*86400000, Infinity]],
];
const yeniAy = (d, k) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1);

let odemeDonem = lsGet('odemeDonem', 'hepsi');

function setOdemeDonem(k){
  odemeDonem = k; lsSet('odemeDonem', k);
  odemeSecim.clear();
  renderPayments();
}

function donemAralik(){
  const d = DONEMLER.find(x => x[0] === odemeDonem);
  return d ? d[2]() : null;
}

/* Döneme düşüyor mu? Aralık yoksa hepsi düşer. */
function donemde(r){
  const a = donemAralik();
  if(!a) return true;
  const t = tsMs(r.tarih);
  if(t == null) return false;
  return t >= a[0] && t < a[1];
}

function odemeBoosterGruplari(){
  const gruplar = {};
  activeRecs()
    .filter(donemde)
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
    .filter(donemde)
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

/* Ödeme kanalı: kime, nereden ödeyeceksin. Profilden geliyor (boosters.js
   ile aynı alanlar) — iki yerde ayrı ayrı tutulsaydı biri güncellenip diğeri
   eski kalırdı. IBAN'ı yoksa bunu ekranda söylüyoruz; ödeme günü "IBAN neydi"
   diye Discord'da aramak bu ekranın var oluş sebebine aykırı. */
function odemeKanali(boosterId){
  const p = people.find(x => x.id === boosterId) || {};
  if(p.iban)        return { etiket:'IBAN',   deger:p.iban };
  if(p.crypto_addr) return { etiket:'Kripto', deger:p.crypto_addr };
  return { etiket:'', deger:'', eksik:true };
}

/* Seçilen satırlar. Ödeme günü genelde birkaç kişiye birden yapılıyor;
   "bu turda ne kadar çıkacak" sorusunun cevabı seçim toplamı. */
const odemeSecim = new Set();

function odemeSec(anahtar, on){
  if(on) odemeSecim.add(anahtar); else odemeSecim.delete(anahtar);
  renderPayments();
}
function odemeSecTemizle(){ odemeSecim.clear(); renderPayments(); }

/* Seçilenlerin tamamını tek turda ödendi işaretler. Ödeme günü sırayla
   dört kişiye tıklamak yerine seç-öde. Booster ve satıcı ayrı alanlara
   yazıldığı için iki ayrı yazma; ikisi de kısa dönerse ayrı ayrı uyarılır. */
async function odeSecilenler(){
  const bst = odemeBoosterGruplari().filter(g => odemeSecim.has('b:' + g.id));
  const sat = odemeSaticiGruplari().filter(g => odemeSecim.has('v:' + g.ad));
  if(!bst.length && !sat.length) return;
  const tutar = bst.reduce((a,g) => a + g.toplam, 0) + sat.reduce((a,g) => a + g.tl, 0);
  const kisi = bst.length + sat.length;
  const isSayisi = bst.reduce((a,g) => a + g.isler.length, 0) + sat.reduce((a,g) => a + g.isler.length, 0);
  if(!confirm(`${kisi} alacaklı · ${isSayisi} iş · ${fmt(tutar,'TRY')} ödendi işaretlenecek. Devam?`)) return;
  const bIds = bst.flatMap(g => g.isler.map(r => r.id));
  const vIds = sat.flatMap(g => g.isler.map(r => r.id));
  odemeSecim.clear();
  if(bIds.length) await bulkPatch(bIds, { paid:true }, 'Ödeme işaretleme');
  if(vIds.length) await bulkPatch(vIds, { vendor_paid:true }, 'Satıcı ödemesi');
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
  const P = paraOzeti(activeRecs().filter(donemde));
  const bst = odemeBoosterGruplari();
  const sat = odemeSaticiGruplari();

  const kart = (etiket, deger, renk, ipucu) => `
    <div class="ov-kpi ${renk}"><div class="ov-kpi-bar"></div>
      <div class="ov-kpi-l">${esc(etiket)}</div>
      <div class="ov-kpi-v">${esc(deger)}</div>
      <div class="ov-kpi-h">${esc(ipucu)}</div></div>`;

  const donemSecici = `<div class="gstrip pay-donem">${DONEMLER.map(([k, l]) =>
    `<button class="gs${k === odemeDonem ? ' active' : ''}" onclick="setOdemeDonem('${esc(k)}')">${esc(l)}</button>`
  ).join('')}</div>`;

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

  const boosterHTML = grupKart('Boosterlara', bst.map(g => {
    const k = odemeKanali(g.id), an = 'b:' + g.id, sec = odemeSecim.has(an);
    return `
    <div class="pay-row${sec ? ' sel' : ''}">
      <label class="pay-chk"><input type="checkbox" ${sec?'checked':''}
        onchange="odemeSec('${esc(an)}',this.checked)"></label>
      <div class="pay-who">
        <div class="pay-name">${esc(g.ad)}</div>
        <div class="pay-sub">${g.isler.length} iş · ${k.eksik
          ? '<span class="warn">ödeme bilgisi girilmemiş</span>'
          : `${esc(k.etiket)} <span class="mono">${esc(k.deger)}</span>
             <button class="copy" data-v="${esc(k.deger)}" onclick="copyText(this)" title="Kopyala">📋</button>`}</div>
      </div>
      <div class="pay-amt">${fmt(g.toplam,'TRY')}</div>
      <button class="icon-btn go" onclick="odeBooster('${esc(g.id)}')">💰 Ödendi</button>
    </div>
    <div class="pay-jobs">${g.isler.map(r =>
      `<button class="pay-job" onclick="openDetail('${esc(r.id)}')">
         <span class="pay-job-r">${routeHTML(r)}</span>
         <span class="pay-job-a">${fmt(r.payout,'TRY')}</span></button>`).join('')}</div>`;
  }).join(''), 'Bekleyen booster ödemesi yok.');

  const saticiHTML = grupKart('Dış satıcılara', sat.map(g => {
    const an = 'v:' + g.ad, sec = odemeSecim.has(an);
    return `
    <div class="pay-row${sec ? ' sel' : ''}">
      <label class="pay-chk"><input type="checkbox" ${sec?'checked':''}
        onchange="odemeSec('${esc(an)}',this.checked)"></label>
      <div class="pay-who">
        <div class="pay-name">🏷 ${esc(g.ad)}</div>
        <div class="pay-sub">${g.isler.length} iş · satıcının kendi kanalı</div>
      </div>
      <div class="pay-amt">${Object.entries(g.dovizler).map(([k,v]) => fmt(v,k)).join(' + ')}
        ${g.tl ? `<span class="pay-tl">≈ ${fmt(g.tl,'TRY')}</span>` : ''}</div>
      <button class="icon-btn go" onclick="odeSatici('${esc(g.ad)}')">💰 Ödendi</button>
    </div>
    <div class="pay-jobs">${g.isler.map(r =>
      `<button class="pay-job" onclick="openDetail('${esc(r.id)}')">
         <span class="pay-job-r">${routeHTML(r)}</span>
         <span class="pay-job-a">${fmt(r.vendorCost, r.vendorCur)}</span></button>`).join('')}</div>`;
  }).join(''), 'Bekleyen satıcı ödemesi yok.');

  // Seçim çubuğu: bu turda ne kadar çıkacak. Kaybolmuş bir seçim (ödeme
  // işaretlendi, satır listeden düştü) toplamı şişirmesin diye her çizimde
  // hâlâ var olan anahtarlara kırpıyoruz.
  const gecerli = new Set(bst.map(g => 'b:' + g.id).concat(sat.map(g => 'v:' + g.ad)));
  [...odemeSecim].forEach(a => { if(!gecerli.has(a)) odemeSecim.delete(a); });
  const secTutar = bst.filter(g => odemeSecim.has('b:' + g.id)).reduce((a,g) => a + g.toplam, 0)
                 + sat.filter(g => odemeSecim.has('v:' + g.ad)).reduce((a,g) => a + g.tl, 0);
  const secBar = odemeSecim.size
    ? `<div class="pay-bar"><span class="bulk-n">${odemeSecim.size} seçili</span>
        <span class="pay-bar-t">${fmt(secTutar,'TRY')}</span>
        <button class="icon-btn go" onclick="odeSecilenler()">💰 Seçilenleri ödendi işaretle</button>
        <button class="icon-btn" onclick="odemeSecTemizle()">temizle</button></div>`
    : '';

  box.innerHTML = donemSecici + kpi + uyari + secBar + `<div class="ov-grid">${boosterHTML}${saticiHTML}</div>`;
}
