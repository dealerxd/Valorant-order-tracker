/* ============ FİYAT MOTORU (booster ödemesi — DB'den yüklenir) ============ */
const placementPrice = r => Math.round((NET_WIN_PRICE[r]||0)*SETTINGS.placement_factor);

function calcOffer(from,to,opts){
  opts=opts||{};
  const fi=RANK_ORDER.indexOf(from), ti=RANK_ORDER.indexOf(to);
  if(fi<0||ti<0||ti<=fi) return null;
  const base=Math.round((RANK_VALUE[to]-RANK_VALUE[from])*SETTINGS.price_mult);
  const startRR=Math.max(0,Math.min(99,Number(opts.startRR)||0));
  const firstDiv=(RANK_VALUE[RANK_ORDER[fi+1]]-RANK_VALUE[from])*SETTINGS.price_mult;
  const rrDisc=Math.round(firstDiv*(startRR/100));
  let total=base-rrDisc;
  const rm=REGION_MULT[opts.region||'TR']!=null?REGION_MULT[opts.region||'TR']:1;
  total*=rm; if(opts.duo)total*=SETTINGS.duo_mult; if(opts.express)total*=SETTINGS.express_mult;
  return {base,rrDisc,startRR,region:opts.region||'TR',regionMult:rm,duo:!!opts.duo,express:!!opts.express,total:Math.round(total)};
}
const suggestedPrice=(f,t)=>{const o=calcOffer(f,t);return o?o.base:null;};

async function loadPricing(){
  const { data }=await sb.from('pricing').select('*');
  (data||[]).forEach(p=>{
    if(p.id==='rank_values') RANK_VALUE=p.data;
    if(p.id==='net_win') NET_WIN_PRICE=p.data;
    if(p.id==='settings') SETTINGS=Object.assign(SETTINGS,p.data);
  });
  fillRankSelects(); fillCalcSelects();
}
async function savePricing(id,data){
  const { error }=await sb.from('pricing').upsert({id,data,updated_at:new Date().toISOString()});
  if(error){ alert('Fiyat kaydedilemedi: '+error.message); return false; }
  return true;
}

/* ============ HESAPLAYICI SEKMESİ ============ */
function fillCalcSelects(){const f=document.getElementById('cFrom'),t=document.getElementById('cTo');if(!f)return;f.innerHTML='';t.innerHTML='';
  RANK_ORDER.forEach(r=>{f.add(new Option(r,r));t.add(new Option(r,r));});f.value='Diamond 1';t.value='Ascendant 1';}
function calcRender(){
  const o=calcOffer(document.getElementById('cFrom').value,document.getElementById('cTo').value,{
    startRR:document.getElementById('cRR').value,region:document.getElementById('cRegion').value,
    duo:document.getElementById('cDuo').checked,express:document.getElementById('cExpress').checked});
  const box=document.getElementById('offerBox');
  if(!o){box.innerHTML=`<div class="money"><div class="row"><span>Geçersiz</span></div></div>`;return;}
  box.innerHTML=`<div class="money" style="border-color:rgba(212,175,55,.35)">
    <div class="row"><span>base</span><b>${o.base.toLocaleString('tr-TR')}</b></div>
    ${o.rrDisc>0?`<div class="row"><span>RR indirimi</span><b style="color:var(--green)">−${o.rrDisc}</b></div>`:''}
    ${o.regionMult!==1?`<div class="row"><span>bölge</span><b style="color:var(--blue)">×${o.regionMult}</b></div>`:''}
    ${o.duo?`<div class="row"><span>duo</span><b style="color:var(--blue)">×${SETTINGS.duo_mult}</b></div>`:''}
    ${o.express?`<div class="row"><span>express</span><b style="color:var(--blue)">×${SETTINGS.express_mult}</b></div>`:''}
    <div class="row kar"><span>Toplam</span><b style="font-size:22px;color:var(--gold)">${o.total.toLocaleString('tr-TR')}</b></div></div>`;
}

/* ============ FİYAT LİSTESİ SEKMESİ (düzenlenebilir) ============ */
const RANK_SHORT={};RANK_ORDER.forEach(r=>{const p=r.split(' ');RANK_SHORT[r]=p[0][0]+p[1];});
function renderPriceTables(){
  const bar=`<span style="width:4px;height:16px;background:var(--gold);border-radius:2px;display:inline-block"></span>`;
  const editable=isAdmin();
  document.getElementById('fiyatHint').textContent=editable?'Bu liste booster ödemesidir. Değerleri değiştirip "Kaydet"e bas — herkeste güncellenir.':'Bu, işlerin karşılığında hak ettiğin tutarlardır.';
  let head=`<th class="rk">Baş. \\ Hedef</th>`+RANK_ORDER.map(r=>`<th class="r" title="${r}">${RANK_SHORT[r]}</th>`).join('');
  let body=RANK_ORDER.map((from,i)=>{const cells=RANK_ORDER.map((to,j)=>j>i?`<td class="r fiyat">${suggestedPrice(from,to).toLocaleString('tr-TR')}</td>`:`<td class="dim">·</td>`).join('');
    return `<tr><th class="rk">${from}</th>${cells}</tr>`;}).join('');
  let html=`<div class="price-block"><h3>${bar}Rank Boost Fiyat Tablosu</h3>
    <p style="font-size:12px;color:var(--muted);margin:-4px 0 10px">Satır=başlangıç, sütun=hedef. B=Bronze S=Silver G=Gold P=Plat D=Diamond A=Ascendant I=Immortal.</p>
    <div class="matrix-wrap"><table class="matrix"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></div>`;

  // Rank değerleri (düzenlenebilir) — admin
  if(editable){
    html+=`<div class="price-block"><h3>${bar}Rank Değerleri <span style="color:var(--muted);font-size:12px">(matrisi besler)</span></h3>
      <table><thead><tr><th>Rank</th><th class="r">Değer</th></tr></thead><tbody>${
        RANK_ORDER.map(r=>`<tr><td>${r}</td><td class="r"><input class="pedit" type="number" id="rv-${RANK_SHORT[r]}" value="${RANK_VALUE[r]}"></td></tr>`).join('')
      }</tbody></table><button class="btn btn-gold btn-sm" style="width:auto;margin-top:10px" onclick="saveRankValues()">Rank Değerlerini Kaydet</button></div>`;
  }
  // Net win (düzenlenebilir)
  html+=`<div class="price-block"><h3>${bar}Net Win Boost <span style="color:var(--muted);font-size:12px">· galibiyet başına</span></h3>
    <table><thead><tr><th>Rank</th><th class="r">Fiyat</th></tr></thead><tbody>${
      RANK_ORDER.map(r=> editable
        ? `<tr><td>${r}</td><td class="r"><input class="pedit" type="number" id="nw-${RANK_SHORT[r]}" value="${NET_WIN_PRICE[r]}"></td></tr>`
        : `<tr><td>${r}</td><td class="r fiyat">${NET_WIN_PRICE[r].toLocaleString('tr-TR')}</td></tr>`).join('')
    }</tbody></table>${editable?`<button class="btn btn-gold btn-sm" style="width:auto;margin-top:10px" onclick="saveNetWin()">Net Win Kaydet</button>`:''}</div>`;
  // Placement (otomatik)
  html+=`<div class="price-block"><h3>${bar}Placement <span style="color:var(--muted);font-size:12px">· net win'in yarısı</span></h3>
    <table><thead><tr><th>Rank</th><th class="r">Fiyat</th></tr></thead><tbody>${
      RANK_ORDER.map(r=>`<tr><td>${r}</td><td class="r fiyat">${placementPrice(r).toLocaleString('tr-TR')}</td></tr>`).join('')
    }</tbody></table></div>`;
  document.getElementById('priceTables').innerHTML=html;
}
async function saveRankValues(){
  const nv={}; RANK_ORDER.forEach(r=>{ nv[r]=Number(document.getElementById('rv-'+RANK_SHORT[r]).value)||0; });
  if(await savePricing('rank_values',nv)){ RANK_VALUE=nv; renderPriceTables(); onRankChange&&onRankChange(); }
}
async function saveNetWin(){
  const nv={}; RANK_ORDER.forEach(r=>{ nv[r]=Number(document.getElementById('nw-'+RANK_SHORT[r]).value)||0; });
  if(await savePricing('net_win',nv)){ NET_WIN_PRICE=nv; renderPriceTables(); }
}
