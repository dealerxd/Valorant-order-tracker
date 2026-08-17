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
  const kapsam = scopeRecs();
  const acik = kapsam.filter(isOpen);

  if(!admin){
    // Booster'da finance{} boş — brüt gelir/kâr HİÇ YOK, gösterirsek hepsi 0 çıkar.
    const benim = kapsam.filter(r => r.boosterId === me.id);
    const bitti = benim.filter(r => !isOpen(r));
    return [
      { etiket:'Açık işim',      deger:String(acik.filter(r => r.boosterId === me.id).length), renk:'gold',  ipucu:'devam eden' },
      { etiket:'Tamamladığım',   deger:String(bitti.length),                                    renk:'green', ipucu:'toplam' },
      { etiket:'Kazancım',       deger:fmt(benim.filter(r => r.paid).reduce((a,r)=>a+r.payout,0),'TRY'), renk:'gold', ipucu:'ödenmiş' },
      { etiket:'Bekleyen ödeme', deger:fmt(benim.filter(r => !r.paid && !isOpen(r)).reduce((a,r)=>a+r.payout,0),'TRY'), renk:'red', ipucu:'ödenmemiş' },
    ];
  }

  const P = paraOzeti();
  const dis = kapsam.filter(isDis).length;
  return [
    { etiket:'Açık sipariş', deger:String(acik.length), renk:'gold',
      ipucu:`${kapsam.length} aktif kayıt`, git:{ durum:'acik', archive:'active' } },
    { etiket:'Brüt gelir',   deger:fmt(P.brut,'TRY'),  renk:'blue',
      ipucu:`${kapsam.length - P.finanssiz} işin finansı girili` },
    // Zarar yeşil gösterilmemeli — kâr gibi okunur.
    { etiket:'Net kâr',      deger:fmt(P.kar,'TRY'),   renk:P.kar < 0 ? 'red' : 'green',
      ipucu: P.finanssiz
        ? `${P.finanssiz} işin boost fiyatı girilmemiş — ücreti düşülüyor, geliri sayılmıyor`
        : 'komisyon, booster ve dış kaynak düşülmüş' },
    { etiket:'Booster borcu',deger:fmt(P.borc,'TRY'),  renk:'red',
      ipucu:'biten ama ödenmemiş' },
    // Dış kaynak gideri kârdan düşülüyor; nereye gittiği görünmezse "kâr niye
    // düşük" sorusunun cevabı hiçbir ekranda yok.
    { etiket:'Dış kaynak gideri', deger:fmt(P.disGider,'TRY'), renk:'amber',
      ipucu: P.kurYok ? `${P.kurYok} işin kuru girilmemiş — dahil değil`
                      : `${dis} iş dışarıda` },
  ];
}

function ovFunnel(){
  const list = scopeRecs();
  return FORM_STATUSES.filter(k => k !== 'odendi').map(k => ({
    key: k, etiket: STATUS_LABEL[k], adet: list.filter(r => r.durum === k).length,
  }));
}

/* Açık işlerin ortalama yaşı. Mockup'ta "ortalama teslim süresi" yazıyordu ama
   veritabanında bir tamamlanma zamanı YOK — uydurmak yerine gerçekten
   hesaplanabilen şeyi yazıyoruz: bu işler kaç gündür açık. */
function ovAcikYas(){
  const acik = scopeRecs().filter(isOpen).map(r => tsMs(r.created)).filter(Boolean);
  if(!acik.length) return null;
  const gun = acik.reduce((a,t) => a + (Date.now()-t)/86400000, 0) / acik.length;
  return gun < 1 ? 'bugün' : `${gun.toFixed(1)} gün`;
}

/* Oyun kırılımı şeritten BAĞIMSIZ: kırılımın kendisi oyunları karşılaştırmak
   için var, tek oyuna daraltılınca anlamı kalmaz. */
function ovGames(){
  const list = activeRecs();
  return GAMES.map(g => {
    const kendi = list.filter(r => r.game === g.id);
    const net = kendi.filter(r => hasFin(r.id)).reduce((a,r) => a + netGelirTLof(r.id), 0);
    const kar = net - kendi.reduce((a,r) => a + r.payout + disMaliyetTL(r), 0);
    return { id:g.id, etiket:g.label, kisa:g.short, tracked:g.tracked,
             adet:kendi.length, acik:kendi.filter(isOpen).length, net, kar };
  }).filter(x => x.adet > 0);
}

/* Uyarılar türe göre gruplanıyor. Tek tek listelendiğinde aynı cümle beş kez
   alt alta yazılıyordu ("boost fiyatı girilmemiş" ×5) ve kart uzayıp asıl
   kritik uyarıyı ekrandan itiyordu. Grup açılabilir: sayıya tıklayınca
   içindekiler çıkıyor. */
const OV_TUR_ALT = {
  atanmadi:     'booster bekliyor',
  finansyok:    'kâra dahil edilmiyor',
  odenmedi:     'işi bitti, ödeme bekliyor',
  baglanmadi:   'Riot ID var, takip başlamadı',
  duraklatildi: 'takip duraklatıldı',
  takildi:      `${UI.STALL_H} saattir maç yok`,
  kayip:        'üst üste mağlubiyet',
};
const ovAcikGrup = new Set();

function ovToggleGrup(tur){
  if(ovAcikGrup.has(tur)) ovAcikGrup.delete(tur); else ovAcikGrup.add(tur);
  renderOverview();
}

function ovAlertGruplari(){
  const gruplar = {};
  alertModel().forEach(a => {
    (gruplar[a.tur] ||= { tur:a.tur, agirlik:a.agirlik, uyarilar:[] });
    gruplar[a.tur].uyarilar.push(a);
  });
  return Object.values(gruplar).sort((a,b) => b.agirlik - a.agirlik
                                           || b.uyarilar.length - a.uyarilar.length);
}

/* Gerçek bir olay tablosu yok. En yakın dürüst karşılık: son dokunulan işler.
   `created` sipariş oluşturma anı, tracker.last_match_at son maç — ikisinin
   en yenisini "hareket" sayıyoruz. Bu bir denetim kaydı DEĞİL, sadece "en son
   ne oldu" hissi; başlıkta da öyle yazıyor. */
function ovFeed(n = 8){
  return scopeRecs().map(r => {
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
  const yas = ovAcikYas();
  const huniHTML = `<div class="ov-card"><div class="ov-h">Durum dağılımı</div>
    ${huni.map(f => `
      <button class="ov-fun" onclick="setOrdersFilter({durum:'${f.key}',archive:'active'})">
        <span class="ov-fun-top"><span class="ov-fun-l">${esc(STATUS_LABEL[f.key])}</span>
          <span class="ov-fun-n">${f.adet}</span></span>
        <span class="ov-fun-bar ${esc(f.key)}"><span style="width:${(f.adet/enCok*100).toFixed(1)}%"></span></span>
      </button>`).join('')}
    ${yas ? `<div class="ov-foot"><span>açık işlerin ortalama yaşı</span><b>${esc(yas)}</b></div>` : ''}</div>`;

  const gruplar = ovAlertGruplari();
  const uyariHTML = `<div class="ov-card"><div class="ov-h">Dikkat isteyenler
      <span class="ov-n">${uyarilar.length}</span></div>
    ${gruplar.length
      ? `<div class="ov-alerts">${gruplar.map(g => {
          const acik = ovAcikGrup.has(g.tur);
          return `<button class="ov-alert ${esc(g.tur)}${acik?' open':''}" onclick="ovToggleGrup('${esc(g.tur)}')">
            <span class="ov-alert-txt">
              <span class="ov-alert-t">${esc(OV_TUR_ETIKET[g.tur] || g.tur)}</span>
              <span class="ov-alert-m">${esc(OV_TUR_ALT[g.tur] || '')}</span></span>
            <span class="ov-alert-n">${g.uyarilar.length}</span></button>
          ${acik ? `<div class="ov-alert-list">${g.uyarilar.map(a =>
              `<button class="ov-alert-i" ${a.id?`onclick="openDetail('${esc(a.id)}')"`:''}>${esc(a.metin)}</button>`
            ).join('')}</div>` : ''}`;
        }).join('')}</div>`
      : `<div class="ov-empty">Her şey yolunda.</div>`}</div>`;

  const oyunlar = ovGames();
  const oyunHTML = `<div class="ov-card"><div class="ov-h">Oyunlar</div>
    ${oyunlar.length ? oyunlar.map(g => `
      <button class="ov-game" onclick="setOrdersFilter({game:'${g.id}',durum:'',archive:'active'})">
        <span class="ov-game-top">
          <span class="chip game">${esc(g.kisa)}</span>
          <span class="ov-game-l">${esc(g.etiket)}
            ${g.tracked ? '' : '<span class="ov-notrack" title="Takip botu yok">◌</span>'}</span>
          <span class="ov-game-n">${g.acik} açık<span class="dim"> / ${g.adet}</span></span>
        </span>
        <span class="ov-game-money"><span class="dim">net ${fmt(g.net,'TRY')}</span>
          <b class="${g.kar < 0 ? 'neg' : 'pos'}">${fmt(g.kar,'TRY')}</b></span>
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
