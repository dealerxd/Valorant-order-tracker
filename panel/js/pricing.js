/* ============ FİYAT MOTORU (booster ödemesi — DB'den yüklenir) ============ */

/* Fiyat verisi oyun bazlı: STEP_PRICE = { valorant:{rank:fiyat}, ow2:{...} }.
   Eski kayıtlar düz (rank:fiyat) — unnest onları valorant'a taşıyor, böylece
   mevcut fiyat listesi migration'sız çalışmaya devam ediyor. */
function unnest(data){
  const vals = Object.values(data||{});
  const nested = vals.length && vals.every(v => v && typeof v === 'object' && !Array.isArray(v));
  return nested ? data : { [DEFAULT_GAME]: data||{} };
}
const stepOf = g => STEP_PRICE[g] || (STEP_PRICE[g] = {});
const netWinOf = g => NET_WIN_PRICE[g] || (NET_WIN_PRICE[g] = {});

const placementPrice = (r,g) => Math.round((netWinOf(g)[r]||0)*SETTINGS.placement_factor);

function calcOffer(from,to,opts){
  opts=opts||{};
  const game=opts.game||currentGame;
  const ORDER=ranksOfGame(game), STEP=stepOf(game);
  const fi=ORDER.indexOf(from), ti=ORDER.indexOf(to);
  if(fi<0||ti<0||ti<=fi) return null;
  let base=0; for(let i=fi;i<ti;i++) base+=Number(STEP[ORDER[i]])||0;   // bölüm fiyatları toplamı
  const startRR=Math.max(0,Math.min(99,Number(opts.startRR)||0));
  const firstDiv=Number(STEP[from])||0;
  const rrDisc=Math.round(firstDiv*(startRR/100));
  let total=base-rrDisc;
  const rm=REGION_MULT[opts.region||'TR']!=null?REGION_MULT[opts.region||'TR']:1;
  total*=rm;
  const ex=opts.extras||[];
  total*=extrasMult(ex);
  return {base,rrDisc,startRR,game,region:opts.region||'TR',regionMult:rm,extras:ex,total:Math.round(total)};
}
const suggestedPrice=(f,t,g)=>{const o=calcOffer(f,t,{game:g});return o?o.base:null;};

async function loadPricing(){
  const { data }=await sb.from('pricing').select('*');
  const defExtras=Object.assign({},SETTINGS.extras);
  (data||[]).forEach(p=>{
    if(p.id==='step_prices') STEP_PRICE=unnest(p.data);
    if(p.id==='rank_values') RANK_VALUE=unnest(p.data);
    if(p.id==='net_win') NET_WIN_PRICE=unnest(p.data);
    if(p.id==='settings') SETTINGS=Object.assign(SETTINGS,p.data);
  });
  SETTINGS.extras=Object.assign(defExtras,SETTINGS.extras||{});
  // geriye dönük: step_prices yoksa eski rank_values × çarpandan türet
  const vStep=stepOf(DEFAULT_GAME), vVal=(RANK_VALUE[DEFAULT_GAME]||{});
  if(!Object.keys(vStep).length && Object.keys(vVal).length){
    const ORDER=ranksOfGame(DEFAULT_GAME);
    for(let i=0;i<ORDER.length-1;i++){
      vStep[ORDER[i]]=Math.round((vVal[ORDER[i+1]]-vVal[ORDER[i]])*SETTINGS.price_mult);
    }
  }
  fillRankSelects(); fillCalcSelects(); renderFormExtras(); renderCalcExtras();
}
async function savePricing(id,data){
  const { error }=await sb.from('pricing').upsert({id,data,updated_at:new Date().toISOString()});
  if(error){ alert('Fiyat kaydedilemedi: '+error.message); return false; }
  return true;
}

/* ============ HESAPLAYICI SEKMESİ ============ */
function fillCalcSelects(){
  const f=document.getElementById('cFrom'),t=document.getElementById('cTo');if(!f)return;
  const ORDER=ranksOfGame(currentGame);
  f.innerHTML='';t.innerHTML='';
  ORDER.forEach(r=>{f.add(new Option(r,r));t.add(new Option(r,r));});
  // Ortalarda bir yerden basla; oyunlarin merdiven uzunlugu farkli.
  f.value=ORDER[Math.floor(ORDER.length*0.55)]; t.value=ORDER[Math.floor(ORDER.length*0.75)];
}
function renderCalcExtras(){
  const box=document.getElementById('calcExtras'); if(!box) return;
  const checked=EXTRA_DEF.filter(e=>{const c=document.getElementById('ce-'+e.key);return c&&c.checked;}).map(e=>e.key);
  box.innerHTML=EXTRA_DEF.map(e=>`<label class="pill"><input type="checkbox" id="ce-${e.key}" ${checked.includes(e.key)?'checked':''} onchange="calcRender()">${e.label} <b>×${extraMultOf(e.key).toLocaleString('tr-TR')}</b></label>`).join('');
}
function calcSelectedExtras(){ return EXTRA_DEF.filter(e=>{const c=document.getElementById('ce-'+e.key);return c&&c.checked;}).map(e=>e.key); }
function calcRender(){
  const ex=calcSelectedExtras();
  const cTo=document.getElementById('cTo').value;
  const o=calcOffer(document.getElementById('cFrom').value,cTo,{
    startRR:document.getElementById('cRR').value,region:document.getElementById('cRegion').value,extras:ex});
  const box=document.getElementById('offerBox');
  if(!o){box.innerHTML=`<div class="money"><div class="row"><span>Geçersiz</span></div></div>`;return;}
  const ew=document.getElementById('cExtraWin').checked?Math.round((netWinOf(currentGame)[cTo]||0)*extrasMult(ex)):0;
  box.innerHTML=`<div class="money" style="border-color:rgba(212,175,55,.35)">
    <div class="row"><span>base</span><b>${o.base.toLocaleString('tr-TR')}</b></div>
    ${o.rrDisc>0?`<div class="row"><span>RR indirimi</span><b style="color:var(--green)">−${o.rrDisc}</b></div>`:''}
    ${o.regionMult!==1?`<div class="row"><span>bölge</span><b style="color:var(--blue)">×${o.regionMult}</b></div>`:''}
    ${o.extras.map(k=>`<div class="row"><span>${extraLabel(k)}</span><b style="color:var(--blue)">×${extraMultOf(k).toLocaleString('tr-TR')}</b></div>`).join('')}
    ${ew?`<div class="row"><span>Extra Win (+1 win, ${esc(cTo)})</span><b style="color:var(--blue)">+${ew.toLocaleString('tr-TR')}</b></div>`:''}
    <div class="row kar"><span>Toplam</span><b style="font-size:22px;color:var(--gold)">${(o.total+ew).toLocaleString('tr-TR')}</b></div></div>`;
}

/* ============ FİYAT LİSTESİ SEKMESİ (düzenlenebilir) ============ */
/* Matris başlığındaki kısaltma. Yalnızca görsel — DOM id'si olarak
   KULLANILMAZ: id'ler indeks tabanlı (sp-0, nw-3…), tanım gereği çakışmaz.

   Kısaltma oyuna göre hesaplanıyor çünkü tek harf her oyunda yetmiyor:
   OW2'de Gold ve Grandmaster ikisi de "G" — "Gold 5" ile "Grandmaster 5"
   aynı görünürdü. Kademe adlarını benzersiz kılan en kısa ön ek seçiliyor,
   yani Valorant'ta tek harf (B/S/G/P/D/A/I), OW2'de iki (Go/Gr). */
function shortMapOf(order){
  const tierOf = r => { const p=r.trim().split(/\s+/); return p.length===1?r.trim():p.slice(0,-1).join(' '); };
  const divOf  = r => { const p=r.trim().split(/\s+/); return p.length===1?'':p[p.length-1]; };
  const tiers=[...new Set(order.map(tierOf))];
  let n=1;
  while(n<12){
    const pref=tiers.map(t=>t.split(/\s+/).map(w=>w.slice(0,n)).join(''));
    if(new Set(pref).size===tiers.length) break;
    n++;
  }
  const abbr={};
  tiers.forEach(t=>{ abbr[t]=t.split(/\s+/).map(w=>w.slice(0,n)).join(''); });
  const map={};
  order.forEach(r=>{ map[r]=abbr[tierOf(r)]+divOf(r); });
  return map;
}
function setPricingGame(g){ currentGame=g; fillCalcSelects(); calcRender&&calcRender(); renderPriceTables(); }

function renderPriceTables(){
  const bar=`<span style="width:4px;height:16px;background:var(--gold);border-radius:2px;display:inline-block"></span>`;
  const editable=isAdmin();
  const g=currentGame, ORDER=ranksOfGame(g), STEP=stepOf(g), NW=netWinOf(g);
  const SHORT=shortMapOf(ORDER);
  const gameTabs=`<div class="game-tabs">`+GAMES.map(x=>
    `<button class="game-tab ${x.id===g?'active':''}" onclick="setPricingGame('${x.id}')">${esc(x.label)}${
      x.tracked?'':' <span class="no-track" title="Takip botu yok">◌</span>'}</button>`).join('')+`</div>`;
  document.getElementById('fiyatHint').textContent=editable?'Bu liste booster ödemesidir. Değerleri değiştirip "Kaydet"e bas — herkeste güncellenir.':'Bu, işlerin karşılığında hak ettiğin tutarlardır.';
  let head=`<th class="rk">Baş. \\ Hedef</th>`+ORDER.map(r=>`<th class="r" title="${esc(r)}">${esc(SHORT[r])}</th>`).join('');
  let body=ORDER.map((from,i)=>{const cells=ORDER.map((to,j)=>j>i?`<td class="r fiyat">${(suggestedPrice(from,to,g)||0).toLocaleString('tr-TR')}</td>`:`<td class="dim">·</td>`).join('');
    return `<tr><th class="rk">${esc(from)}</th>${cells}</tr>`;}).join('');
  let html=gameTabs+`<div class="price-block"><h3>${bar}Rank Boost Fiyat Tablosu — ${esc(gameOf(g).label)}</h3>
    <p style="font-size:12px;color:var(--muted);margin:-4px 0 10px">Satır=başlangıç, sütun=hedef. ${
      [...new Set(ORDER.map(r=>{const p=r.trim().split(/\s+/);return p.length===1?r.trim():p.slice(0,-1).join(' ');}))]
        .map(t=>{const any=ORDER.find(r=>r.startsWith(t));return esc(SHORT[any].replace(/[0-9IVX]+$/,''))+'='+esc(t);}).join(' ')
    }</p>
    <div class="matrix-wrap"><table class="matrix"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></div>`;

  // Bölüm fiyatları (düzenlenebilir) — admin. "Bu ranktan bir sonrakine çıkmak kaç TL?"
  if(editable){
    html+=`<div class="price-block"><h3>${bar}Bölüm Fiyatları <span style="color:var(--muted);font-size:12px">· bir sonraki ranka çıkma ücreti — matrisi bu besler</span></h3>
      <p style="font-size:12px;color:var(--muted);margin:-4px 0 10px">Örn. Plat 1 satırına 100 yazarsan Plat 1 → Plat 2 = 100 ₺ olur. Toplam boost fiyatı = aradaki bölümlerin toplamı.</p>
      <table><thead><tr><th>Bölüm</th><th class="r">Fiyat (₺)</th></tr></thead><tbody>${
        ORDER.slice(0,-1).map((r,i)=>`<tr><td>${esc(r)} <span style="color:var(--gold)">→</span> ${esc(ORDER[i+1])}</td><td class="r"><input class="pedit" type="number" id="sp-${i}" value="${Number(STEP[r])||0}"></td></tr>`).join('')
      }</tbody></table><button class="btn btn-gold btn-sm" style="width:auto;margin-top:10px" onclick="saveStepPrices()">Bölüm Fiyatlarını Kaydet</button></div>`;
  }
  // Net win (düzenlenebilir)
  html+=`<div class="price-block"><h3>${bar}Net Win Boost <span style="color:var(--muted);font-size:12px">· galibiyet başına</span></h3>
    <table><thead><tr><th>Rank</th><th class="r">Fiyat</th></tr></thead><tbody>${
      ORDER.map((r,i)=> editable
        ? `<tr><td>${esc(r)}</td><td class="r"><input class="pedit" type="number" id="nw-${i}" value="${Number(NW[r])||0}"></td></tr>`
        : `<tr><td>${esc(r)}</td><td class="r fiyat">${(Number(NW[r])||0).toLocaleString('tr-TR')}</td></tr>`).join('')
    }</tbody></table>${editable?`<button class="btn btn-gold btn-sm" style="width:auto;margin-top:10px" onclick="saveNetWin()">Net Win Kaydet</button>`:''}</div>`;
  // Placement (otomatik)
  html+=`<div class="price-block"><h3>${bar}Placement <span style="color:var(--muted);font-size:12px">· net win'in yarısı</span></h3>
    <table><thead><tr><th>Rank</th><th class="r">Fiyat</th></tr></thead><tbody>${
      ORDER.map(r=>`<tr><td>${esc(r)}</td><td class="r fiyat">${placementPrice(r,g).toLocaleString('tr-TR')}</td></tr>`).join('')
    }</tbody></table></div>`;
  // Extra çarpanları (düzenlenebilir)
  html+=`<div class="price-block"><h3>${bar}Extra Çarpanları <span style="color:var(--muted);font-size:12px">· ×1,00 = etkisiz</span></h3>
    <table><thead><tr><th>Extra</th><th class="r">Çarpan (×)</th></tr></thead><tbody>${
      EXTRA_DEF.map(e=> editable
        ? `<tr><td>${e.label}</td><td class="r"><input class="pedit" type="number" step="0.05" min="0" id="ex-${e.key}" value="${extraMultOf(e.key)}"></td></tr>`
        : `<tr><td>${e.label}</td><td class="r fiyat">×${extraMultOf(e.key).toLocaleString('tr-TR')}</td></tr>`).join('')
    }</tbody></table>${editable?`<button class="btn btn-gold btn-sm" style="width:auto;margin-top:10px" onclick="saveExtras()">Extra Çarpanlarını Kaydet</button>`:''}</div>`;
  document.getElementById('priceTables').innerHTML=html;
}
async function saveExtras(){
  const ex={}; EXTRA_DEF.forEach(e=>{ ex[e.key]=Number(document.getElementById('ex-'+e.key).value)||1; });
  const merged=Object.assign({},SETTINGS,{extras:ex});
  if(await savePricing('settings',merged)){ SETTINGS=merged; renderPriceTables(); renderFormExtras(); renderCalcExtras(); onRankChange&&onRankChange(); }
}
/* Kaydederken TÜM oyunların verisi yazılıyor, sadece açık olan sekme değil —
   yoksa diğer oyunların fiyatları her kayıtta silinirdi. */
async function saveStepPrices(){
  const g=currentGame, ORDER=ranksOfGame(g), nv={};
  ORDER.slice(0,-1).forEach((r,i)=>{ nv[r]=Number(document.getElementById('sp-'+i).value)||0; });
  const merged=Object.assign({},STEP_PRICE,{[g]:nv});
  if(await savePricing('step_prices',merged)){ STEP_PRICE=merged; renderPriceTables(); onRankChange&&onRankChange(); }
}
async function saveNetWin(){
  const g=currentGame, ORDER=ranksOfGame(g), nv={};
  ORDER.forEach((r,i)=>{ nv[r]=Number(document.getElementById('nw-'+i).value)||0; });
  const merged=Object.assign({},NET_WIN_PRICE,{[g]:nv});
  if(await savePricing('net_win',merged)){ NET_WIN_PRICE=merged; renderPriceTables(); }
}
