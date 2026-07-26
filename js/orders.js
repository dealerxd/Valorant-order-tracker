/* ============ SİPARİŞ FORMU ============ */
function fillRankSelects(){
  const b=document.getElementById('baslangic'),h=document.getElementById('hedef'),u=document.getElementById('unitRank');
  if(!b) return; b.innerHTML='';h.innerHTML='';u.innerHTML='';
  RANK_ORDER.forEach(r=>{b.add(new Option(r,r));h.add(new Option(r,r));u.add(new Option(r,r));});
  b.value='Gold 1';h.value='Diamond 1';u.value='Gold 1';
}
function fillBoosterSelects(){
  const sel=document.getElementById('boosterSel'),flt=document.getElementById('filterBooster');
  const list=people.filter(p=>p.active&&p.role==='booster');
  const cur=sel.value,curF=flt.value;
  sel.innerHTML='<option value="">— atanmadı —</option>'+list.map(p=>`<option value="${p.id}">${esc(p.display_name)}</option>`).join('');
  flt.innerHTML='<option value="">Tüm Boosterlar</option>'+list.map(p=>`<option value="${p.id}">${esc(p.display_name)}</option>`).join('');
  sel.value=cur;flt.value=curF;
}
function nameOf(id){const p=people.find(x=>x.id===id);return p?p.display_name:'—';}

function currentType(){ return document.getElementById('orderType').value; }
function onTypeChange(){
  const t=currentType();
  document.getElementById('grpRank').classList.toggle('hidden',t!=='rank');
  document.getElementById('grpUnit').classList.toggle('hidden',!(t==='netwin'||t==='placement'));
  document.getElementById('grpCustom').classList.toggle('hidden',t!=='custom');
  document.getElementById('grpExtras').classList.toggle('hidden',t==='custom');
  document.getElementById('unitCountLabel').textContent = t==='placement' ? 'Maç Sayısı' : 'Galibiyet Sayısı';
  onRankChange();
}

/* Extra pill'leri (çarpanlar SETTINGS.extras'tan) */
function renderFormExtras(){
  const box=document.getElementById('extrasBox'); if(!box) return;
  const checked=formSelectedExtras();
  box.innerHTML=EXTRA_DEF.map(e=>`<label class="pill"><input type="checkbox" id="fx-${e.key}" ${checked.includes(e.key)?'checked':''} onchange="onRankChange()">${e.label} <b>×${extraMultOf(e.key).toLocaleString('tr-TR')}</b></label>`).join('');
}
function formSelectedExtras(){ return EXTRA_DEF.filter(e=>{const c=document.getElementById('fx-'+e.key);return c&&c.checked;}).map(e=>e.key); }

function onPlatformChange(){
  const p = document.getElementById('platform').value;
  const cfg = PLATFORMS[p];
  if(cfg){
    document.getElementById('currency').value = cfg.cur;
    // komisyon seçeneklerini panele göre kısıtla
    const fs = document.getElementById('feePct');
    fs.innerHTML = '<option value="0">%0</option>' + cfg.fees.map(f=>`<option value="${f}">%${f}</option>`).join('');
    fs.value = cfg.fees[0];
  }
  onMoneyChange();
}

/* Türüne göre önerilen booster ücreti (fiyat listesinden, extra çarpanları dahil) */
function onRankChange(){
  const t=currentType();
  const s=document.getElementById('suggest');
  const pe=document.getElementById('payout');
  const ex=formSelectedExtras();
  let total=null, label='';
  if(t==='rank'){
    const o=calcOffer(document.getElementById('baslangic').value,document.getElementById('hedef').value,{
      startRR:document.getElementById('startRR').value,region:document.getElementById('region').value,extras:ex});
    if(o){ total=o.total; label='Fiyat listesine göre booster ücreti'; }
  } else if(t==='netwin'||t==='placement'){
    const rank=document.getElementById('unitRank').value;
    const n=Math.max(1,Number(document.getElementById('unitCount').value)||1);
    const unit=t==='netwin'?(NET_WIN_PRICE[rank]||0):placementPrice(rank);
    if(unit>0){ total=Math.round(unit*n*extrasMult(ex)); label=`${ORDER_TYPES[t]} · ${n} × ${unit.toLocaleString('tr-TR')} ₺${ex.length?` × extras`:''}`; }
  }
  if(total!=null){
    if(!pe.dataset.manual) pe.value=total;
    s.innerHTML=`${label}: <b>${total.toLocaleString('tr-TR')} ₺</b>
      <span class="use" onclick="document.getElementById('payout').value=${total};document.getElementById('payout').dataset.manual='';onMoneyChange()">kullan</span>`;
  } else s.innerHTML='';
  onMoneyChange();
}

function onMoneyChange(){
  const cost=Number(document.getElementById('cost').value)||0;        // boost fiyatı = GELİR
  const cur=document.getElementById('currency').value;
  const feePct=Number(document.getElementById('feePct').value)||0;
  const rate=Number(document.getElementById('rate').value)||0;
  const pay=Number(document.getElementById('payout').value)||0;       // TL booster

  const isTL = cur==='TRY';
  document.getElementById('rateField').style.display = isTL ? 'none' : '';

  const feeAmt = cost*feePct/100;
  const netGelir = cost - feeAmt;
  const netGelirTL = isTL ? Math.round(netGelir) : Math.round(netGelir*rate);
  const kar = netGelirTL - pay;

  const rateLine = !isTL ? `<div class="row"><span>Kur (1 ${cur})</span><b style="color:var(--muted)">${rate?rate.toLocaleString('tr-TR'):'—'} ₺</b></div>` : '';
  const warn = (!isTL && !rate) ? `<div class="row"><span style="color:var(--amber)">⚠ Kuru gir</span><b></b></div>` : '';
  document.getElementById('moneyBox').innerHTML=`
    <div class="row"><span>Boost fiyatı (gelir)</span><b>${fmt(cost,cur)}</b></div>
    ${feePct>0?`<div class="row"><span>Komisyon (%${feePct})</span><b style="color:var(--amber)">−${fmt(Math.round(feeAmt*100)/100,cur)}</b></div>`:''}
    <div class="row"><span>Net gelir (${cur})</span><b>${fmt(Math.round(netGelir*100)/100,cur)}</b></div>
    ${rateLine}${warn}
    <div class="row"><span>Net gelir (TL)</span><b style="color:var(--blue)">${fmt(netGelirTL,'TRY')}</b></div>
    <div class="row"><span>Booster'a</span><b style="color:var(--blue)">−${fmt(pay,'TRY')}</b></div>
    <div class="row ${kar<0?'neg':'kar'}"><span>Sana kalan kâr</span><b>${fmt(kar,'TRY')}</b></div>`;
}
document.addEventListener('input',e=>{ if(e.target&&e.target.id==='payout') e.target.dataset.manual='1'; });
function toggleImageField(){const d=document.getElementById('durum').value;document.getElementById('imageField').classList.toggle('hidden',!(d==='tamam'||d==='odendi'));}

async function saveRecord(){
  const type=currentType();
  const cost=Number(document.getElementById('cost').value)||0;   // boost fiyatı = GELİR
  if(cost<=0){ alert('Boost fiyatını gir (panelden aldığın tutar).'); return; }
  const cur=document.getElementById('currency').value;
  const feePct=Number(document.getElementById('feePct').value)||0;
  const rate=Number(document.getElementById('rate').value)||0;
  if(cur!=='TRY' && !rate){ alert('Kuru gir (1 '+cur+' kaç TL).'); return; }
  const costTL = cur==='TRY' ? Math.round(cost) : Math.round(cost*rate);   // brüt gelir TL, elle girilen kurla sabitlenir
  const netGelirTL = Math.round(costTL*(1-feePct/100));

  const row={
    order_type:type,
    baslangic:null, hedef:null, start_rr:0, region:'TR',
    extras:type==='custom'?[]:formSelectedExtras(),
    win_count:null, job_desc:null,
    durum:document.getElementById('durum').value,tarih:document.getElementById('tarih').value||new Date().toISOString().slice(0,10),
    note:document.getElementById('not').value.trim(),image:formImage||null,
    booster_id:document.getElementById('boosterSel').value||null,
    booster_payout:Number(document.getElementById('payout').value)||0
  };
  if(type==='rank'){
    row.baslangic=document.getElementById('baslangic').value;
    row.hedef=document.getElementById('hedef').value;
    row.start_rr=Number(document.getElementById('startRR').value)||0;
    row.region=document.getElementById('region').value;
  } else if(type==='netwin'||type==='placement'){
    row.baslangic=document.getElementById('unitRank').value;
    row.win_count=Math.max(1,Number(document.getElementById('unitCount').value)||1);
  } else if(type==='custom'){
    row.job_desc=document.getElementById('jobDesc').value.trim();
    if(!row.job_desc){ alert('İş açıklamasını yaz (ne yapılacak?).'); return; }
  }

  const fin={
    sale_price:netGelirTL, currency:'TRY',   // sale_price = otomatik hesaplanan net gelir TL
    platform:document.getElementById('platform').value||null,
    platform_ref:document.getElementById('platformRef').value.trim()||null,
    cost:cost, cost_currency:cur, fee_pct:feePct, cost_tl:costTL, rate:rate
  };
  const btn=document.getElementById('saveBtn');btn.disabled=true;
  try{
    let id=editId;
    if(editId){ const {error}=await sb.from('resells').update(row).eq('id',editId); if(error)throw error; }
    else { const {data,error}=await sb.from('resells').insert(row).select('id').single(); if(error)throw error; id=data.id; }
    const {error:fe}=await sb.from('order_finance').upsert(Object.assign({order_id:id},fin));
    if(fe)throw fe;
    resetForm(); await loadAll();
  }catch(e){ alert('Kaydedilemedi: '+e.message); }
  finally{ btn.disabled=false; }
}
function editRecord(id){
  const r=records.find(x=>x.id===id); if(!r)return; editId=id; const f=F(id);
  document.getElementById('orderType').value=r.orderType||'rank';
  document.getElementById('boosterSel').value=r.boosterId||'';
  if(r.orderType==='netwin'||r.orderType==='placement'){
    document.getElementById('unitRank').value=r.baslangic||'Gold 1';
    document.getElementById('unitCount').value=r.winCount||1;
  } else if(r.orderType==='custom'){
    document.getElementById('jobDesc').value=r.jobDesc||'';
  } else {
    document.getElementById('baslangic').value=r.baslangic;document.getElementById('hedef').value=r.hedef;
    document.getElementById('startRR').value=r.startRR;document.getElementById('region').value=r.region;
  }
  renderFormExtras();
  EXTRA_DEF.forEach(e=>{const c=document.getElementById('fx-'+e.key);if(c)c.checked=(r.extras||[]).includes(e.key);});
  document.getElementById('platform').value=f.platform||''; onPlatformChange();
  document.getElementById('platformRef').value=f.platformRef||'';
  document.getElementById('cost').value=f.cost||'';document.getElementById('currency').value=f.costCur||'USD';
  document.getElementById('feePct').value=f.feePct||0;
  document.getElementById('rate').value=f.rate||'';
  const pe=document.getElementById('payout');pe.value=r.payout||'';pe.dataset.manual='1';
  document.getElementById('durum').value=r.durum;document.getElementById('tarih').value=r.tarih;
  document.getElementById('not').value=r.not;formImage=r.image;
  toggleImageField();showFormImage();onTypeChange();
  document.getElementById('formTitle').textContent='Siparişi Düzenle';
  document.getElementById('saveBtn').textContent='Güncelle';
  document.getElementById('cancelBtn').classList.remove('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
}
function resetForm(){
  editId=null;formImage=null;
  ['payout','not','cost','platformRef','rate','jobDesc'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('orderType').value='rank';
  document.getElementById('unitCount').value='1';
  document.getElementById('platform').value='';document.getElementById('feePct').value='0';
  document.getElementById('currency').value='USD';document.getElementById('payout').dataset.manual='';
  document.getElementById('boosterSel').value='';document.getElementById('durum').value='yeni';
  document.getElementById('startRR').value='0';document.getElementById('region').value='TR';
  document.getElementById('extrasBox').innerHTML='';renderFormExtras();
  document.getElementById('tarih').value=new Date().toISOString().slice(0,10);
  fillRankSelects();onTypeChange();showFormImage();toggleImageField();
  document.getElementById('formTitle').textContent='Yeni Sipariş';
  document.getElementById('saveBtn').textContent='Kaydet';
  document.getElementById('cancelBtn').classList.add('hidden');
}

/* ============ GÖRSEL ============ */
function compressImage(file){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=e=>{const img=new Image();
  img.onload=()=>{const M=1280;let w=img.width,h=img.height;if(w>h&&w>M){h=Math.round(h*M/w);w=M;}else if(h>=w&&h>M){w=Math.round(w*M/h);h=M;}
  const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);res(c.toDataURL('image/jpeg',0.7));};
  img.onerror=rej;img.src=e.target.result;};fr.onerror=rej;fr.readAsDataURL(file);});}
async function handleImagePick(e){const f=e.target.files[0];if(!f)return;formImage=await compressImage(f);showFormImage();e.target.value='';}
function showFormImage(){const p=document.getElementById('imgPreview'),t=document.getElementById('imgDropText'),r=document.getElementById('imgRemove');
  if(formImage){p.src=formImage;p.classList.remove('hidden');t.classList.add('hidden');r.classList.remove('hidden');}
  else{p.classList.add('hidden');p.removeAttribute('src');t.classList.remove('hidden');r.classList.add('hidden');}}
function clearFormImage(){formImage=null;showFormImage();}
document.addEventListener('paste',async e=>{const f=document.getElementById('imageField');if(!f||f.classList.contains('hidden'))return;
  const it=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));if(it){formImage=await compressImage(it.getAsFile());showFormImage();}});
function openLightbox(id){const r=records.find(x=>x.id===id);if(!r||!r.image)return;document.getElementById('lightboxImg').src=r.image;document.getElementById('lightbox').classList.remove('hidden');}
function closeLightbox(){document.getElementById('lightbox').classList.add('hidden');}

/* ============ SİPARİŞ İŞLEMLERİ ============ */
async function setStatus(id,durum){const {error}=await sb.from('resells').update({durum}).eq('id',id);if(error){alert(error.message);return;}await loadAll();}
async function togglePaid(id,val){const {error}=await sb.from('resells').update({paid:val}).eq('id',id);if(error){alert(error.message);return;}await loadAll();}
async function toggleArchive(id,val){const {error}=await sb.from('resells').update({archived:val}).eq('id',id);if(error){alert(error.message);return;}await loadAll();}
async function deleteRecord(id){
  if(!confirm('Bu sipariş KALICI olarak silinecek (finans kaydıyla birlikte). Geri alınamaz. Emin misin?')) return;
  const {error}=await sb.from('resells').delete().eq('id',id);
  if(error){alert('Silinemedi: '+error.message);return;}
  if(editId===id) resetForm();
  await loadAll();
}
async function addShot(id,input){const f=input.files[0];if(!f)return;input.value='';const d=await compressImage(f);
  const {error}=await sb.from('resells').update({image:d}).eq('id',id);if(error){alert(error.message);return;}await loadAll();}

/* ============ LİSTE RENDER ============ */
function routeHTML(r){
  if(r.orderType==='netwin')    return `${esc(r.baslangic)}<span class="arrow">·</span>${r.winCount} Net Win`;
  if(r.orderType==='placement') return `${esc(r.baslangic)}<span class="arrow">·</span>${r.winCount} Placement`;
  if(r.orderType==='custom')    return `Özel İş`;
  return `${esc(r.baslangic)}<span class="arrow">→</span>${esc(r.hedef)}`;
}
function routeText(r){
  if(r.orderType==='netwin')    return `${r.baslangic} · ${r.winCount} Net Win`;
  if(r.orderType==='placement') return `${r.baslangic} · ${r.winCount} Placement`;
  if(r.orderType==='custom')    return (r.jobDesc||'Özel iş').slice(0,40);
  return `${r.baslangic} → ${r.hedef}`;
}
/* Link ise tıklanabilir yap, değilse #ref olarak göster */
function refHTML(ref){
  if(!ref) return '';
  if(/^https?:\/\//i.test(ref)) return ` <a href="${esc(ref)}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none">↗ link</a>`;
  return ' #'+esc(ref);
}

function renderStats(){
  const el=document.getElementById('statsRow');
  const active=records.filter(r=>!r.archived);
  if(isAdmin()){
    const ciro=active.reduce((s,r)=>s+brutTLof(r.id),0);
    const kar=active.reduce((s,r)=>s+netGelirTLof(r.id)-r.payout,0);
    const borc=active.filter(r=>!r.paid&&r.boosterId).reduce((s,r)=>s+r.payout,0);
    const acik=active.filter(r=>!['tamam','odendi'].includes(r.durum)).length;
    el.style.gridTemplateColumns='repeat(4,1fr)';
    el.innerHTML=`
      <div class="stat"><div class="label">Aktif Sipariş</div><div class="value">${active.length} <small>(${acik} açık)</small></div></div>
      <div class="stat gold"><div class="label">Brüt Gelir (TL)</div><div class="value" style="font-size:20px">${fmt(ciro,'TRY')}</div></div>
      <div class="stat green"><div class="label">Net Kâr</div><div class="value" style="font-size:20px">${fmt(kar,'TRY')}</div></div>
      <div class="stat red"><div class="label">Booster Borcu</div><div class="value">${fmt(borc,'TRY')}</div></div>`;
  } else {
    const kazanc=active.reduce((s,r)=>s+r.payout,0);
    const bekle=active.filter(r=>!r.paid).reduce((s,r)=>s+r.payout,0);
    const acik=active.filter(r=>!['tamam','odendi'].includes(r.durum)).length;
    const bitti=active.filter(r=>['tamam','odendi'].includes(r.durum)).length;
    el.style.gridTemplateColumns='repeat(4,1fr)';
    el.innerHTML=`
      <div class="stat"><div class="label">Aktif İşim</div><div class="value">${acik}</div></div>
      <div class="stat green"><div class="label">Tamamladığım</div><div class="value">${bitti}</div></div>
      <div class="stat gold"><div class="label">Toplam Kazanç</div><div class="value">${fmt(kazanc,'TRY')}</div></div>
      <div class="stat red"><div class="label">Bekleyen Ödeme</div><div class="value">${fmt(bekle,'TRY')}</div></div>`;
  }
}
function render(){
  renderStats();
  const q=(document.getElementById('search').value||'').toLowerCase();
  const fd=document.getElementById('filterDurum').value;
  const fb=document.getElementById('filterBooster').value;
  const fa=document.getElementById('filterArchive').value;
  let list=records.filter(r=>{
    if(fa==='active'&&r.archived) return false;
    if(fa==='arch'&&!r.archived) return false;
    if(fd&&r.durum!==fd) return false;
    if(fb&&r.boosterId!==fb) return false;
    if(!q) return true;
    return [r.baslangic,r.hedef,r.jobDesc,ORDER_TYPES[r.orderType],r.not,nameOf(r.boosterId)].join(' ').toLowerCase().includes(q);
  });
  const el=document.getElementById('recordList');
  if(!list.length){ el.innerHTML=`<div class="empty"><div class="big">${records.length?'Sonuç yok':'Henüz sipariş yok'}</div>
    <div>${isAdmin()?'Soldaki formdan ekle.':'Sana iş atandığında görünecek.'}</div></div>`; return; }
  el.innerHTML=list.map(r=>{
    const f=F(r.id); const netTL=netGelirTLof(r.id), kar=netTL-r.payout;
    const priceBlock=isAdmin()
      ? `<div class="rec-price">${fmt(netTL,'TRY')}</div><div class="rec-sub">boost ${fmt(f.cost,f.costCur)}${f.feePct?` · kom %${f.feePct}`:''} · booster ${r.payout.toLocaleString('tr-TR')} · <span class="kar">kâr ${fmt(kar,'TRY')}</span></div>`
      : `<div class="rec-price">${r.payout.toLocaleString('tr-TR')} ₺</div><div class="rec-sub">kazancın</div>`;
    const shot=r.image?`<div class="rec-shot"><img src="${r.image}" onclick="openLightbox('${r.id}')"></div>`:'';
    return `<div class="rec ${r.archived?'arch':''}">
      <div class="rec-top"><div>
        <div class="rec-route">${routeHTML(r)}</div>
        <div class="rec-meta" style="margin-top:7px">
          ${r.orderType!=='rank'?`<span class="chip" style="border-color:rgba(90,157,237,.35);color:var(--blue)">🎯 ${ORDER_TYPES[r.orderType]}</span>`:''}
          ${r.archived?`<span class="chip" style="color:var(--amber)">🗄 arşiv</span>`:''}
          ${isAdmin()&&f.platform?`<span class="chip" style="border-color:rgba(212,175,55,.3);color:var(--gold)">🛒 ${esc(f.platform)}${refHTML(f.platformRef)}</span>`:''}
          ${isAdmin()&&r.boosterId?`<span class="chip booster">👤 ${esc(nameOf(r.boosterId))}</span>`:''}
          ${isAdmin()&&!r.boosterId?`<span class="chip" style="color:var(--amber)">⚠ atanmadı</span>`:''}
          <span class="chip">🗓 ${r.tarih}</span>
          ${r.orderType==='rank'&&r.startRR?`<span class="chip">RR ${r.startRR}</span>`:''}
          ${r.orderType==='rank'&&r.region!=='TR'?`<span class="chip">🌍 ${esc(r.region)}</span>`:''}
          ${(r.extras||[]).map(k=>`<span class="chip">✚ ${esc(extraLabel(k))}</span>`).join('')}
          ${r.payout>0?`<span class="chip ${r.paid?'paid':'unpaid'}">${r.paid?'✓ ödendi':'● ödenmedi'}</span>`:''}
        </div>
      </div><div style="text-align:right">${priceBlock}
        <span class="status ${r.durum}" style="margin-top:6px;display:inline-block">${STATUS_LABEL[r.durum]}</span></div></div>
      ${r.jobDesc?`<div class="rec-note">📋 ${esc(r.jobDesc)}</div>`:''}
      ${r.not?`<div class="rec-note">${esc(r.not)}</div>`:''}${shot}
      <div class="rec-actions">
        <button class="icon-btn go" onclick="setStatus('${r.id}','${NEXT_STATUS[r.durum]}')">→ ${STATUS_LABEL[NEXT_STATUS[r.durum]]}</button>
        <button class="icon-btn" onclick="document.getElementById('shot-${r.id}').click()">📷 ${r.image?'Değiştir':'Görsel'}</button>
        ${isAdmin()?`<button class="icon-btn" onclick="editRecord('${r.id}')">✎ Düzenle</button>`:''}
        ${isAdmin()&&r.payout>0?`<button class="icon-btn" onclick="togglePaid('${r.id}',${!r.paid})">${r.paid?'↺ Ödeme geri':'💰 Ödendi'}</button>`:''}
        ${isAdmin()?`<button class="icon-btn" onclick="toggleArchive('${r.id}',${!r.archived})">${r.archived?'↩ Arşivden çıkar':'🗄 Arşivle'}</button>`:''}
        ${isAdmin()?`<button class="icon-btn del" onclick="deleteRecord('${r.id}')">🗑 Sil</button>`:''}
        <input type="file" id="shot-${r.id}" accept="image/*" class="hidden" onchange="addShot('${r.id}',this)">
      </div></div>`;
  }).join('');
}
