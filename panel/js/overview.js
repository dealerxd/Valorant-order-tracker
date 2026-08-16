/* ============ GENEL BAKIŞ ============

   Bu sayfa yeni bir model ÜRETMİYOR: uyarılar ui-common.js'teki alertModel()'den,
   filtreleme setOrdersFilter()'dan geliyor. Kendi hesabını yapsaydı zil
   "7 uyarı" derken bu sayfa "4" derdi.

   Takip botu durumu bilinçli olarak burada YOK — sidebar'da zaten her sayfada
   görünüyor, iki yerde göstermek aynı bilgiyi iki kez tutmak olurdu.

   Her sayı tıklanabilir: sipariş listesine aynı filtreyle götürüyor. Bir sayıyı
   görüp "bunlar hangileri?" diye sormak zorunda kalmayasın diye.
*/

const OV_TUR_ETIKET = {
  atanmadi:     'Atanmadı',
  finansyok:    'Boost fiyatı yok',
  odenmedi:     'Ödenmedi',
  baglanmadi:   'Bağlanmadı',
  duraklatildi: 'Duraklatıldı',
  takildi:      'Takıldı',
  kayip:        'Kayıp serisi',
};

function ovKpis(){
  const admin = isAdmin();
  const acik = activeRecs().filter(isOpen);

  if(!admin){
    // Booster'da finance{} boş — brüt gelir/kâr HİÇ YOK, gösterirsek hepsi 0 çıkar.
    const benim = records.filter(r => r.boosterId === me.id);
    const bitti = benim.filter(r => !isOpen(r) && !r.archived);
    return [
      { etiket:'Açık işim',      deger:String(acik.filter(r => r.boosterId === me.id).length), renk:'gold',  ipucu:'devam eden' },
      { etiket:'Tamamladığım',   deger:String(bitti.length),                                    renk:'green', ipucu:'toplam' },
      { etiket:'Kazancım',       deger:fmt(benim.filter(r => r.paid).reduce((a,r)=>a+r.payout,0),'TRY'), renk:'gold', ipucu:'ödenmiş' },
      { etiket:'Bekleyen ödeme', deger:fmt(benim.filter(r => !r.paid && !isOpen(r)).reduce((a,r)=>a+r.payout,0),'TRY'), renk:'red', ipucu:'ödenmemiş' },
    ];
  }

  const P = paraOzeti();
  return [
    { etiket:'Açık sipariş', deger:String(acik.length), renk:'gold',
      ipucu:`${activeRecs().length} aktif kayıt`, git:{ durum:'acik', archive:'active' } },
    { etiket:'Brüt gelir',   deger:fmt(P.brut,'TRY'),  renk:'blue',
      ipucu:`${activeRecs().length - P.finanssiz} işin finansı girili` },
    // Zarar yeşil gösterilmemeli — kâr gibi okunur.
    { etiket:'Net kâr',      deger:fmt(P.kar,'TRY'),   renk:P.kar < 0 ? 'red' : 'green',
      ipucu: P.finanssiz
        ? `${P.finanssiz} işin boost fiyatı girilmemiş — ücreti düşülüyor, geliri sayılmıyor`
        : 'komisyon ve booster ücreti düşülmüş' },
    { etiket:'Booster borcu',deger:fmt(P.borc,'TRY'),  renk:'red',
      ipucu:'biten ama ödenmemiş' },
  ];
}

function ovFunnel(){
  const list = activeRecs();
  return FORM_STATUSES.filter(k => k !== 'odendi').map(k => ({
    key: k, etiket: STATUS_LABEL[k], adet: list.filter(r => r.durum === k).length,
  }));
}

function ovGames(){
  const list = activeRecs();
  return GAMES.map(g => {
    const kendi = list.filter(r => r.game === g.id);
    return { id:g.id, etiket:g.label, tracked:g.tracked, adet:kendi.length,
             acik:kendi.filter(isOpen).length };
  }).filter(x => x.adet > 0);
}

/* Gerçek bir olay tablosu yok. En yakın dürüst karşılık: son dokunulan işler.
   `created` sipariş oluşturma anı, tracker.last_match_at son maç — ikisinin
   en yenisini "hareket" sayıyoruz. Bu bir denetim kaydı DEĞİL, sadece "en son
   ne oldu" hissi; başlıkta da öyle yazıyor. */
function ovFeed(n = 8){
  return activeRecs().map(r => {
    const t = tracker[r.id];
    const mac = t && t.last_match_at ? tsMs(t.last_match_at) : null;
    const oluş = tsMs(r.created);
    const son = Math.max(mac || 0, oluş || 0) || null;
    return { r, son, mac: mac && (!oluş || mac > oluş) };
  }).filter(x => x.son).sort((a,b) => b.son - a.son).slice(0, n);
}

function renderOverview(){
  const box = document.getElementById('overviewBody'); if(!box) return;
  const admin = isAdmin();
  const uyarilar = alertModel();

  const kpi = `<div class="ov-kpis">${ovKpis().map(k => `
    <div class="ov-kpi ${k.renk}"${k.git?` onclick='setOrdersFilter(${JSON.stringify(k.git)})' role="button"`:''}>
      <div class="ov-kpi-bar"></div>
      <div class="ov-kpi-l">${esc(k.etiket)}</div>
      <div class="ov-kpi-v">${esc(k.deger)}</div>
      <div class="ov-kpi-h">${esc(k.ipucu)}</div>
    </div>`).join('')}</div>`;

  const huni = ovFunnel();
  const enCok = Math.max(1, ...huni.map(f => f.adet));
  const huniHTML = `<div class="ov-card"><div class="ov-h">Durum dağılımı</div>
    ${huni.map(f => `
      <button class="ov-fun" onclick="setOrdersFilter({durum:'${f.key}',archive:'active'})">
        <span class="ov-fun-l"><span class="status ${f.key}">${STATUS_LABEL[f.key]}</span></span>
        <span class="ov-fun-bar"><span style="width:${(f.adet/enCok*100).toFixed(1)}%"></span></span>
        <span class="ov-fun-n">${f.adet}</span>
      </button>`).join('')}</div>`;

  const uyariHTML = `<div class="ov-card"><div class="ov-h">Dikkat isteyenler
      <span class="ov-n">${uyarilar.length}</span></div>
    ${uyarilar.length
      ? `<div class="ov-alerts">${uyarilar.slice(0,8).map(a => `
          <button class="ov-alert ${esc(a.tur)}" ${a.id?`onclick="openDetail('${a.id}')"`:''}>
            <span class="ov-alert-t">${esc(OV_TUR_ETIKET[a.tur] || a.tur)}</span>
            <span class="ov-alert-m">${esc(a.metin)}</span>
          </button>`).join('')}
          ${uyarilar.length > 8 ? `<div class="ov-more">+${uyarilar.length-8} tane daha</div>` : ''}
        </div>`
      : `<div class="ov-empty">Her şey yolunda.</div>`}</div>`;

  const oyunlar = ovGames();
  const oyunHTML = `<div class="ov-card"><div class="ov-h">Oyunlar</div>
    ${oyunlar.length ? oyunlar.map(g => `
      <button class="ov-game" onclick="setOrdersFilter({game:'${g.id}',durum:'',archive:'active'})">
        <span class="ov-game-l">${esc(g.etiket)}
          ${g.tracked ? '' : '<span class="ov-notrack" title="Takip botu yok">◌</span>'}</span>
        <span class="ov-game-n">${g.acik} açık<span class="dim"> / ${g.adet}</span></span>
      </button>`).join('') : `<div class="ov-empty">Aktif sipariş yok.</div>`}</div>`;

  const feed = ovFeed();
  const feedHTML = `<div class="ov-card"><div class="ov-h">Son hareketler</div>
    ${feed.length ? `<div class="ov-feed">${feed.map(f => `
      <button class="ov-feed-row" onclick="openDetail('${f.r.id}')">
        <span class="ov-feed-i">${f.mac ? '🎮' : '＋'}</span>
        <span class="ov-feed-t">${routeHTML(f.r)}
          <span class="ov-feed-s">${f.mac ? 'maç oynandı' : 'sipariş açıldı'}</span></span>
        <span class="ov-feed-a">${esc(agoText(new Date(f.son).toISOString()))}</span>
      </button>`).join('')}</div>`
      : `<div class="ov-empty">Hareket yok.</div>`}
    <div class="ov-note">Olay kaydı tutulmuyor; bu liste sipariş tarihinden ve son maç
      zamanından türetiliyor.</div></div>`;

  box.innerHTML = kpi + `<div class="ov-grid">
    ${uyariHTML}${huniHTML}${admin ? oyunHTML : ''}${feedHTML}</div>`;
}
