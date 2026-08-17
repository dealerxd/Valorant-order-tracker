/* ============ YAPIŞTIR-ÇÖZÜMLE ============

   Sipariş pazaryerlerinden ve Discord'dan gelen metni okuyup formu dolduruyor.
   Elle girilen her alan bir hata ihtimali; "Gold 1 → Diamond 1, 120$, Sylas#TR1"
   yazan mesajı yapıştırmak on iki tıklamayı bir tıklamaya indiriyor.

   Bulduğu hiçbir şeyi SESSİZCE yazmıyor: ne çıkardıysa çip olarak gösteriyor,
   forma yazması için ayrıca onay istiyor. Yanlış çözümlemenin bedeli (yanlış
   rank aralığı → yanlış fiyat → yanlış booster ücreti) yazmayı geri almanın
   maliyetinden yüksek.

   Rank isimleri oyunlar arası çakışıyor ("Gold 1" hem Valorant hem OW2'de,
   "Platinum II" hem Rivals hem Rocket League'de var). Bu yüzden ÖNCE oyun
   tespit ediliyor, rank taraması yalnızca o oyunun merdiveninde yapılıyor;
   yoksa Rocket League siparişi Valorant rankına eşlenirdi.
*/

/* Oyun ipuçları. Sıra önemli: 'rl' kısaltması 'rivals' içinde geçmesin diye
   kelime sınırı kullanıyoruz. */
const PASTE_GAME = [
  ['rivals',   /marvel|rivals/i],
  ['rl',       /rocket\s?league|\brl\b/i],
  ['ow2',      /overwatch|\bow2?\b/i],
  ['wildrift', /wild\s?rift|\bwr\b|vainglory/i],
  ['valorant', /valorant|\bval\b/i],
];

const PASTE_PLATFORM = [
  ['Eldorado',  /eldorado/i],
  ['GameBoost', /game\s?boost/i],
];

/* Metinde geçen rank adları. En uzun eşleşme kazanıyor: "Grand Champion III"
   içinde "Champion III" de var, kısası seçilirse iş bir kademe aşağı iner. */
function pasteRanks(metin, oyun){
  const low = metin.toLowerCase();
  const bulunan = {};
  ranksOfGame(oyun).forEach(r => {
    let i = -1;
    while((i = low.indexOf(r.toLowerCase(), i + 1)) >= 0)
      if(!bulunan[i] || bulunan[i].length < r.length) bulunan[i] = r;
  });
  return Object.keys(bulunan).map(Number).sort((a,b) => a-b).map(i => bulunan[i]);
}

const PASTE_CUR = { '$':'USD', 'usd':'USD', 'dolar':'USD',
                    '€':'EUR', 'eur':'EUR', 'euro':'EUR',
                    '₺':'TRY', 'try':'TRY', 'tl':'TRY', 'lira':'TRY' };

function pasteParse(metin){
  const t = String(metin || '');
  if(!t.trim()) return null;
  const out = {};

  const oyun = (PASTE_GAME.find(([, rx]) => rx.test(t)) || [])[0];
  out.game = oyun || DEFAULT_GAME;

  const rs = pasteRanks(t, out.game);
  if(rs.length){ out.baslangic = rs[0]; if(rs[1]) out.hedef = rs[1]; }

  // Fiyat: "120$" ve "$120" ikisi de geçerli. Binlik ayracı olarak nokta
  // kullanan metinler var ("1.250 TL"); ondalık ayracı virgül varsayıyoruz.
  // \b yalnizca harfli birimlere: '$' kelime karakteri degil, "120$," dizisinde
  // sinir olusmuyor ve tum eslesme dusuyordu.
  const BIRIM = '(?:[$€₺]|(?:usd|eur|try|tl)\\b)';
  const para = t.match(new RegExp(
    `(${BIRIM})\\s*([0-9][0-9.,]*)|([0-9][0-9.,]*)\\s*(${BIRIM})`, 'i'));
  if(para){
    const birim = (para[1] || para[4] || '').toLowerCase();
    const ham = (para[2] || para[3] || '');
    const sayi = Number(ham.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    if(isFinite(sayi) && sayi > 0){
      out.cost = sayi;
      out.currency = PASTE_CUR[birim] || 'USD';
    }
  }

  // Riot ID: isim#tag. Takip edilmeyen oyunlarda anlamsız, o yüzden yazmıyoruz.
  if(isTrackedGame(out.game)){
    const rid = t.match(/([A-Za-z0-9 ._-]{3,16})#([A-Za-z0-9]{2,5})/);
    if(rid) out.riotId = rid[1].trim() + '#' + rid[2];
  }

  const bolge = t.match(/\b(TR|EUW?|NA|AP|KR|BR|LATAM)\b/);
  if(bolge){
    const b = bolge[1].toUpperCase();
    out.region = b === 'TR' ? 'TR' : b.startsWith('EU') ? 'EU' : b === 'NA' ? 'NA' : 'Diğer';
  }

  const rr = t.match(/(\d{1,2})\s*rr\b/i);
  if(rr) out.startRR = Number(rr[1]);

  const pf = PASTE_PLATFORM.find(([, rx]) => rx.test(t));
  if(pf) out.platform = pf[0];

  if(/net\s?win/i.test(t))        out.orderType = 'netwin';
  else if(/placement|yerleş/i.test(t)) out.orderType = 'placement';
  const adet = t.match(/(\d{1,2})\s*(?:x|adet)?\s*(?:net\s?win|win|galibiyet|ma[çc]|game)/i);
  if(adet && out.orderType) out.unitCount = Number(adet[1]);

  const ekstra = EXTRA_DEF.filter(e => new RegExp('\\b' + e.label.split(' ')[0], 'i').test(t))
                          .map(e => e.key);
  if(/duo/i.test(t) && !ekstra.includes('duo')) ekstra.push('duo');
  if(ekstra.length) out.extras = ekstra;

  if(/extra\s?win/i.test(t)) out.extraWin = true;

  return Object.keys(out).length > 1 ? out : null;   // game hep var, tek başına sayılmaz
}

/* Çıkarılan alanların okunur adları — çiplerde bunlar görünüyor. */
const PASTE_ETIKET = {
  game:'oyun', baslangic:'başlangıç', hedef:'hedef', cost:'fiyat', currency:'birim',
  riotId:'hesap', region:'bölge', startRR:'RR', platform:'pazaryeri',
  orderType:'tür', unitCount:'adet', extras:'extra', extraWin:'extra win',
};

function pasteDeger(k, v){
  if(k === 'game')      return gameOf(v).label;
  if(k === 'orderType') return ORDER_TYPES[v] || v;
  if(k === 'extras')    return v.map(extraLabel).join(', ');
  if(k === 'extraWin')  return 'var';
  return String(v);
}

let pasteSonuc = null;

function onPasteChange(){
  const kutu = document.getElementById('pasteBox');
  const cikti = document.getElementById('pasteOut');
  if(!kutu || !cikti) return;
  pasteSonuc = pasteParse(kutu.value);
  cikti.classList.toggle('hidden', !pasteSonuc);
  if(!pasteSonuc) return;
  const cipler = Object.keys(pasteSonuc)
    .map(k => `<span class="chip ok">${esc(PASTE_ETIKET[k] || k)}: ${esc(pasteDeger(k, pasteSonuc[k]))}</span>`)
    .join('');
  cikti.innerHTML = `<div class="paste-chips">${cipler}</div>
    <div class="paste-act">
      <button class="icon-btn go" onclick="pasteUygula()">↧ Alanları doldur</button>
      <span class="paste-note">bulduklarını forma yazar, kalanını sen tamamlarsın</span>
    </div>`;
}

/* Yalnızca çözümlenen alanları yazıyor; formda elle doldurduğun bir alan
   çözümlemede yoksa olduğu gibi kalıyor. */
function pasteUygula(){
  if(!pasteSonuc) return;
  const p = pasteSonuc;
  const set = (id, v) => { const el = document.getElementById(id); if(el != null && v != null) el.value = v; };

  if(p.game){ set('gameSel', p.game); onGameChange(); }
  if(p.orderType){ set('orderType', p.orderType); onTypeChange(); }

  if(p.orderType === 'netwin' || p.orderType === 'placement'){
    if(p.baslangic) set('unitRank', p.baslangic);
    if(p.unitCount) set('unitCount', p.unitCount);
  } else {
    if(p.baslangic) set('baslangic', p.baslangic);
    if(p.hedef)     set('hedef', p.hedef);
  }

  if(p.startRR  != null) set('startRR', p.startRR);
  if(p.region)  set('region', p.region);
  if(p.riotId)  set('riotId', p.riotId);
  if(p.platform){ set('platform', p.platform); onPlatformChange(); }
  if(p.cost     != null) set('cost', p.cost);
  if(p.currency) set('currency', p.currency);
  if(p.extraWin){ const e = document.getElementById('extraWin'); if(e) e.checked = true; }
  if(p.extras)  p.extras.forEach(k => {
    const c = document.getElementById('fx-' + k);
    if(c) c.checked = true;
  });

  onRankChange();
  onMoneyChange();
  toast(`${Object.keys(p).length} alan dolduruldu — kontrol edip kaydet.`);
}
