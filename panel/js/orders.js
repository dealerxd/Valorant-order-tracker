/* ============ SİPARİŞ FORMU ============ */
/* Oyun <select>'i: rank listeleri ve Riot ID alanı buna bağlı. */
function fillGameSelects(){
  const f=document.getElementById('gameSel');
  if(f && !f.options.length) GAMES.forEach(g=>f.add(new Option(g.label,g.id)));
}

/* Oyun değişince rank listeleri yenilenir ve takip alanı gizlenir/görünür.
   Riot ID yalnızca takip edilen oyunlarda anlamlı — Rocket League siparişine
   nick girmek boşuna, bot o siparişi yoklamıyor. */
function onGameChange(){
  const sel=document.getElementById('gameSel');
  currentGame = sel ? sel.value : DEFAULT_GAME;
  fillRankSelects();
  const tracked=isTrackedGame(currentGame);
  const rf=document.getElementById('riotIdField');
  if(rf) rf.classList.toggle('hidden',!tracked);
  if(!tracked){ const ri=document.getElementById('riotId'); if(ri) ri.value=''; }
  onRankChange();
}

function fillRankSelects(){
  const b=document.getElementById('baslangic'),h=document.getElementById('hedef'),u=document.getElementById('unitRank');
  if(!b) return;
  const ORDER=ranksOfGame(currentGame);
  const keep={b:b.value,h:h.value,u:u.value};
  b.innerHTML='';h.innerHTML='';u.innerHTML='';
  ORDER.forEach(r=>{b.add(new Option(r,r));h.add(new Option(r,r));u.add(new Option(r,r));});
  // Oyun değişince eski seçim listede olmayabilir; oranla makul bir yere düş.
  const at=f=>ORDER[Math.min(ORDER.length-1,Math.floor(ORDER.length*f))];
  b.value=ORDER.includes(keep.b)?keep.b:at(0.3);
  h.value=ORDER.includes(keep.h)?keep.h:at(0.6);
  u.value=ORDER.includes(keep.u)?keep.u:at(0.3);
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

/* --- Otomatik kur ---------------------------------------------------------

   Kur elle giriliyordu; unutuldugunda kar hesabi sessizce bozuluyor (dis
   kaynak maliyeti 0 sayiliyor, brut gelir TL'ye cevrilemiyor), yanlis
   girildiginde de fark aylar sonra ortaya cikiyor.

   Otomatik doldurulan kur SABIT DEGIL: alan hala duzenlenebilir, cunku
   pazaryeri kendi kurunu uygulayabiliyor. Elle degistirildiginde bir daha
   ustune yazmiyoruz - `data-auto` bayragi bunu isaretliyor. */
function kurBilgisi(cur){
  const x = fx[cur];
  if(!x || !x.rate) return null;
  const gun = Math.floor(Date.now()/86400000) - Math.floor(tsMs(x.as_of)/86400000);
  return { ...x, gun, bayat: gun > 3 };
}

function kurUygula(){
  const el = document.getElementById('rate'), not = document.getElementById('rateNote');
  if(!el) return;
  const cur = document.getElementById('currency').value;
  if(cur === 'TRY'){ if(not) not.textContent = ''; return; }
  const k = kurBilgisi(cur);
  if(!k){
    if(not) not.innerHTML = '<span class="warn">güncel kur yok — elle gir</span>';
    return;
  }
  // Kullanici elle yazdiysa dokunma.
  if(el.value && el.dataset.auto !== '1'){
    if(not) not.innerHTML = `bugünkü ${esc(cur)}: <b>${k.rate}</b>
      <button type="button" class="lnk" onclick="kurAl()">kullan</button>`;
    return;
  }
  el.value = k.rate; el.dataset.auto = '1';
  if(not) not.innerHTML = k.bayat
    ? `<span class="warn">kur ${k.gun} günlük — ${esc(k.as_of)}</span>`
    : `otomatik · ${esc(k.as_of)}${k.source ? ' · ' + esc(k.source) : ''}`;
}
function kurAl(){
  const el = document.getElementById('rate');
  el.dataset.auto = '1'; kurUygula(); onMoneyChange();
}
/* Alana elle dokunuldu: bundan sonra otomatik yazma. */
function onRateInput(){
  document.getElementById('rate').dataset.auto = '';
  onMoneyChange();
}

function onPlatformChange(){
  const p = document.getElementById('platform').value;
  const cfg = PLATFORMS[p];
  const fs = document.getElementById('feePct');
  if(cfg){
    document.getElementById('currency').value = cfg.cur;
    kurUygula();
    // komisyon seçeneklerini panele göre kısıtla
    fs.innerHTML = '<option value="0">%0</option>' + cfg.fees.map(f=>`<option value="${f}">%${f}</option>`).join('');
    fs.value = cfg.fees[0];
  } else {
    fs.innerHTML = '<option value="0">%0</option><option value="10">%10</option><option value="45">%45</option>';
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
    const hedef=document.getElementById('hedef').value;
    const o=calcOffer(document.getElementById('baslangic').value,hedef,{
      startRR:document.getElementById('startRR').value,region:document.getElementById('region').value,extras:ex});
    if(o){
      total=o.total; label='Fiyat listesine göre booster ücreti';
      if(document.getElementById('extraWin').checked){
        const ew=Math.round((NET_WIN_PRICE[hedef]||0)*extrasMult(ex));   // extra win = hedef rankta 1 net win
        total+=ew; label+=` (+${ew.toLocaleString('tr-TR')} extra win)`;
      }
    }
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
  kurUygula();
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
  const isAd=isAdmin();
  const cost=Number(document.getElementById('cost').value)||0;   // boost fiyatı = GELİR (opsiyonel: 0 = finanssız kayıt)
  const cur=document.getElementById('currency').value;
  const feePct=Number(document.getElementById('feePct').value)||0;
  const rate=Number(document.getElementById('rate').value)||0;
  if(isAd && cost>0 && cur!=='TRY' && !rate){ alert('Kuru gir (1 '+cur+' kaç TL).'); return; }
  const costTL = cur==='TRY' ? Math.round(cost) : Math.round(cost*rate);   // brüt gelir TL, elle girilen kurla sabitlenir
  const netGelirTL = Math.round(costTL*(1-feePct/100));

  const row={
    game:document.getElementById('gameSel').value||DEFAULT_GAME,
    order_type:type,
    baslangic:null, hedef:null, start_rr:0, region:'TR', riot_id:null,
    extras:type==='custom'?[]:formSelectedExtras(),
    extra_win:type==='rank'&&document.getElementById('extraWin').checked,
    win_count:null, job_desc:null,
    durum:document.getElementById('durum').value,tarih:document.getElementById('tarih').value||new Date().toISOString().slice(0,10),
    note:document.getElementById('not').value.trim(),image:formImage||null,
    booster_id:document.getElementById('boosterSel').value||null,
    booster_payout:Number(document.getElementById('payout').value)||0,
    // Bos birakilirsa NULL: uydurma bir son tarih koymuyoruz, is suresiz sayiliyor.
    due_at:(isAdmin() && document.getElementById('dueAt').value) || null,
    ...disAlanlari()
  };
  if(type==='rank'){
    row.baslangic=document.getElementById('baslangic').value;
    row.hedef=document.getElementById('hedef').value;
    row.start_rr=Number(document.getElementById('startRR').value)||0;
    row.region=document.getElementById('region').value;
    const rid=isTrackedGame(row.game) ? document.getElementById('riotId').value.trim() : '';
    if(rid && !/^[^#]+#[^#]+$/.test(rid)){ alert('Riot ID "isim#tag" formatında olmalı. Örnek: Player#TR1'); return; }
    row.riot_id=rid||null;
  } else if(type==='netwin'||type==='placement'){
    row.baslangic=document.getElementById('unitRank').value;
    row.win_count=Math.max(1,Number(document.getElementById('unitCount').value)||1);
  } else if(type==='custom'){
    row.job_desc=document.getElementById('jobDesc').value.trim();
    if(!row.job_desc){ alert('İş açıklamasını yaz (ne yapılacak?).'); return; }
  }

  if(!isAd){
    // Booster kendi işini kendine ekler; finansa dokunmaz (RLS zaten engeller)
    row.booster_id=me.id;
    if(row.booster_payout<=0){ alert('Ücretini (TL) gir.'); return; }
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
    if(editId){ const {error}=await sb.from(TABLES.orders).update(row).eq('id',editId); if(error)throw error; }
    else { const {data,error}=await sb.from(TABLES.orders).insert(row).select('id').single(); if(error)throw error; id=data.id; }
    if(isAd){
      if(cost>0){ const {error:fe}=await sb.from('order_finance').upsert(Object.assign({order_id:id},fin)); if(fe)throw fe; }
      else { await sb.from('order_finance').delete().eq('order_id',id); }   // boost fiyatı 0 = finanssız kayıt
    }
    resetForm(); await loadAll();
  }catch(e){ alert('Kaydedilemedi: '+e.message); }
  finally{ btn.disabled=false; }
}
function editRecord(id){
  const r=records.find(x=>x.id===id); if(!r)return; editId=id; const f=F(id);
  switchTab('siparis'); showForm();   // duzenlemede form acik kalmali
  document.getElementById('gameSel').value=r.game||DEFAULT_GAME;
  onGameChange();                       // rank listelerini bu oyuna gore doldur
  document.getElementById('orderType').value=r.orderType||'rank';
  document.getElementById('boosterSel').value=r.boosterId||'';
  document.getElementById('fulfil').value = r.vendor ? 'dis' : 'ic';
  document.getElementById('vendor').value = r.vendor || '';
  document.getElementById('vendorCost').value = r.vendorCost || '';
  document.getElementById('vendorCur').value = r.vendorCur || 'USD';
  document.getElementById('vendorPaid').checked = !!r.vendorPaid;
  onFulfilChange();
  if(r.orderType==='netwin'||r.orderType==='placement'){
    document.getElementById('unitRank').value=r.baslangic||ranksOfGame(r.game)[0];
    document.getElementById('unitCount').value=r.winCount||1;
  } else if(r.orderType==='custom'){
    document.getElementById('jobDesc').value=r.jobDesc||'';
  } else {
    document.getElementById('baslangic').value=r.baslangic;document.getElementById('hedef').value=r.hedef;
    document.getElementById('startRR').value=r.startRR;document.getElementById('region').value=r.region;
    document.getElementById('riotId').value=r.riotId||'';
  }
  renderFormExtras();
  EXTRA_DEF.forEach(e=>{const c=document.getElementById('fx-'+e.key);if(c)c.checked=(r.extras||[]).includes(e.key);});
  document.getElementById('extraWin').checked=r.orderType==='rank'&&!!r.extraWin;
  document.getElementById('platform').value=f.platform||''; onPlatformChange();
  document.getElementById('platformRef').value=f.platformRef||'';
  document.getElementById('cost').value=f.cost||'';document.getElementById('currency').value=f.costCur||'USD';
  document.getElementById('feePct').value=f.feePct||0;
  const re=document.getElementById('rate');
  re.value=f.rate||''; re.dataset.auto = f.rate ? '' : '1';   // kayitli kur korunur
  const pe=document.getElementById('payout');pe.value=r.payout||'';pe.dataset.manual='1';
  const ds=document.getElementById('durum');ds.value=r.durum;
  if(ds.value!==r.durum) ds.value='tamam';   // eski 'odendi' durumu artık seçenek değil → Tamam'a düşür
  document.getElementById('tarih').value=r.tarih;
  document.getElementById('dueAt').value=r.dueAt||'';
  document.getElementById('not').value=r.not;formImage=r.image;
  toggleImageField();showFormImage();onTypeChange();
  document.getElementById('formTitle').textContent='Siparişi Düzenle';
  document.getElementById('formSub').textContent='Kayıtlı sipariş — değiştirdiğin alanlar güncellenir.';
  // Yapistir-cozumle yalnizca YENI siparis icin: mevcut bir kaydin alanlarini
  // yapistirilan metinle ezmek sessiz veri kaybi olurdu.
  document.querySelector('.paste-box')?.classList.add('hidden');
  document.getElementById('saveBtn').textContent='Güncelle';
  document.getElementById('cancelBtn').classList.remove('hidden');
}
/* Tablo/pano modunda .wide form sütununu gizliyor. Forma dönen her yol
   (yeni sipariş butonu, düzenle, uyarıdan gelen bağlantı) buradan geçtiği
   için görünürlüğü tek yerde geri alıyoruz. */
/* Form acikligi ayri bir durum: render() bunu EZMEMELI. Aksi halde tablo/pano
   modunda kullanici formu doldururken gelen her realtime tazelemesi ya da
   arama tusu formu gizliyor ve girilen veri gozden kayboluyordu. */
let formAcik = false;

/* İş içeride mi dışarıda mı — alanlar buna göre. Booster ataması ile dış
   satıcı bilgisi aynı anda anlamlı değil. */
/* Dış kaynak alanları. İş içerideyse temizlenir — yarım kalmış bir satıcı
   kaydı borç listesinde hayalet satır üretmesin. */
function disAlanlari(){
  const el = document.getElementById('fulfil');
  const dis = el && el.value === 'dis' && isAdmin();
  if(!dis) return { vendor:null, vendor_cost:0, vendor_currency:'USD', vendor_paid:false };
  return {
    vendor: document.getElementById('vendor').value.trim() || null,
    vendor_cost: Number(document.getElementById('vendorCost').value) || 0,
    vendor_currency: document.getElementById('vendorCur').value,
    vendor_paid: document.getElementById('vendorPaid').checked,
  };
}

function onFulfilChange(){
  const dis = document.getElementById('fulfil').value === 'dis';
  document.getElementById('disAlan').classList.toggle('hidden', !dis);
  document.getElementById('icAlan').classList.toggle('hidden', dis);
  if(dis) document.getElementById('boosterSel').value = '';
  onRankChange();
}

/* Form artik modalda. Eskiden Siparisler'in sol sutunundaydi: liste alaninin
   ucte birini kalici olarak yiyordu ve tablo/pano modunda gizlenmesi gerekiyordu
   (o gizleme de yazilmakta olan veriyi siliyordu). Modalda o sinif hatalarin
   tamami dusuyor - form ya aciktir ya kapali. */
function showForm(){
  formAcik = true;
  document.getElementById('formModal')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.getElementById('formPanel')?.scrollTo({ top:0 });
}
function hideForm(){
  formAcik = false;
  document.getElementById('formModal')?.classList.add('hidden');
  // Drawer da acik olabilir; onun kilidini kaldirmayalim.
  if(document.getElementById('drawer')?.classList.contains('hidden'))
    document.body.style.overflow = '';
}
/* Eski cagri noktalari korunuyor; artik yapacak isi yok. */
function hideFormIfWide(){}

function resetForm(){
  // resetForm hem "iptal" hem "kayittan sonra" yolunda cagriliyor - ikisinde de
  // form KAPANIYOR. Kullanicinin formu acik tutmasi showForm() ile oluyor.
  hideForm();
  const pb=document.getElementById('pasteBox');
  if(pb){ pb.value=''; onPasteChange(); }
  editId=null;formImage=null;
  ['payout','not','cost','platformRef','rate','jobDesc','riotId','dueAt'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('orderType').value='rank';
  document.getElementById('unitCount').value='1';
  document.getElementById('platform').value='';document.getElementById('feePct').value='0';
  document.getElementById('currency').value='USD';document.getElementById('payout').dataset.manual='';
  document.getElementById('rate').dataset.auto='1';   // yeni siparis: kur otomatik gelsin
  document.getElementById('boosterSel').value='';
  const gs=document.getElementById('gameSel'); if(gs){ gs.value=DEFAULT_GAME; onGameChange(); }
  const fu=document.getElementById('fulfil');
  if(fu){ fu.value='ic'; document.getElementById('vendor').value='';
          document.getElementById('vendorCost').value='';
          document.getElementById('vendorPaid').checked=false; onFulfilChange(); }
  document.getElementById('durum').value=(me&&!isAdmin())?'atandi':'yeni';   // booster'ın girdiği iş zaten ona atanmış
  document.getElementById('startRR').value='0';document.getElementById('region').value='TR';
  document.getElementById('extraWin').checked=false;
  document.getElementById('extrasBox').innerHTML='';renderFormExtras();
  document.getElementById('tarih').value=new Date().toISOString().slice(0,10);
  fillRankSelects();onTypeChange();showFormImage();toggleImageField();
  document.getElementById('formTitle').textContent=(me&&!isAdmin())?'İş Ekle':'Yeni Sipariş';
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
async function setStatus(id,durum){const {error}=await sb.from(TABLES.orders).update({durum}).eq('id',id);if(error){alert(error.message);return;}await loadAll();}
async function togglePaid(id,val){const {error}=await sb.from(TABLES.orders).update({paid:val}).eq('id',id);if(error){alert(error.message);return;}await loadAll();}
async function toggleArchive(id,val){const {error}=await sb.from(TABLES.orders).update({archived:val}).eq('id',id);if(error){alert(error.message);return;}await loadAll();}
async function deleteRecord(id){
  if(!confirm('Bu iş KALICI olarak silinecek. Geri alınamaz. Emin misin?')) return;
  const {data,error}=await sb.from(TABLES.orders).delete().eq('id',id).select('id');
  if(error){alert('Silinemedi: '+error.message);return;}
  if(!data||!data.length){alert('Silinemedi: bu iş ödenmiş ya da yönetici finans bilgisi girmiş. Silinmesi gerekiyorsa yöneticiye söyle.');return;}
  if(editId===id) resetForm();
  await loadAll();
}
async function addShot(id,input){const f=input.files[0];if(!f)return;input.value='';const d=await compressImage(f);
  const {error}=await sb.from(TABLES.orders).update({image:d}).eq('id',id);if(error){alert(error.message);return;}await loadAll();}

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
    // Tanimlar ui-common.js'te; Rapor ve Genel Bakis ayni hesabi kullaniyor.
    const P=paraOzeti(), ciro=P.brut, kar=P.kar, borc=P.borc;
    const acik=active.filter(r=>!['tamam','odendi'].includes(r.durum)).length;
    el.style.gridTemplateColumns='repeat(4,1fr)';
    el.innerHTML=`
      <div class="stat"><div class="label">Aktif Sipariş</div><div class="value">${active.length} <small>(${acik} açık)</small></div></div>
      <div class="stat gold"><div class="label">Brüt Gelir (TL)</div><div class="value" style="font-size:20px">${fmt(ciro,'TRY')}</div></div>
      <div class="stat ${kar<0?'red':'green'}"><div class="label">Net Kâr</div><div class="value" style="font-size:20px">${fmt(kar,'TRY')}</div></div>
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
/* ============ SİPARİŞ GÖRÜNÜMLERİ ============

   Üç görünüm aynı filtrelenmiş listeyi tüketiyor: kart (eskisi), tablo, pano.
   Filtre durumu DOM'da değil burada: realtime her sipariş değişiminde
   loadAll->render tetikliyor ve innerHTML baştan yazılıyor — DOM'da tutulan
   seçim ya da sekme durumu her turda kaybolurdu.

   Durum filtresi eskiden #filterDurum select'iydi; artık durum sekmeleri.
   Tek kaynak ordersView.durum. */

const ordersView = {
  // Varsayilan TABLO: kart gorunumu on isten sonra taranamaz hale geliyordu,
  // ekrana ucu sigiyor ve "hangi is nerede" sorusu kaydirma ile cevaplaniyordu.
  mode:  lsGet('ordersMode', 'tablo'),  // tablo | kart | pano
  durum: '',                            // '' = hepsi
  src:   '',                            // '' = hepsi | ic | dis
  sort:  lsGet('ordersSort', 'due'),    // bkz. SORTS
  dir:   lsGet('ordersDir', 'asc'),     // asc | desc
  sel:   new Set(),                     // toplu seçim, sipariş id'leri
};

/* Siralama anahtarlari. Her biri karsilastirilabilir bir deger donduruyor;
   null/bos olanlar YONDEN BAGIMSIZ olarak sona atiliyor - teslim tarihi
   girilmemis isler listenin basini kaplamasin diye. */
const SORTS = {
  due:     { etiket:'Teslim',  al:r => tsMs(r.dueAt) },
  tarih:   { etiket:'Tarih',   al:r => tsMs(r.tarih) },
  durum:   { etiket:'Durum',   al:r => FORM_STATUSES.indexOf(r.durum) },
  is:      { etiket:'İş',      al:r => routeText(r).toLocaleLowerCase('tr') },
  oyun:    { etiket:'Oyun',    al:r => gameOf(r.game).label },
  booster: { etiket:'Booster', al:r => isDis(r) ? r.vendor : (r.boosterId ? nameOf(r.boosterId) : '') },
  ilerleme:{ etiket:'İlerleme',al:r => ilerleme(r).oran },
  net:     { etiket:'Net Gelir', al:r => hasFin(r.id) ? netGelirTLof(r.id) : null, admin:true },
  kar:     { etiket:'Kâr',     al:r => hasFin(r.id) ? netGelirTLof(r.id) - r.payout - disMaliyetTL(r) : null, admin:true },
  ucret:   { etiket:'Ücret',   al:r => r.payout },
};

function setSort(k){
  if(!SORTS[k]) return;
  // Ayni sutuna tekrar tiklamak yonu cevirir; yeni sutun kendi dogal yonuyle
  // baslar: tarihlerde "en yakin once", parada "en cok once".
  if(ordersView.sort === k) ordersView.dir = ordersView.dir === 'asc' ? 'desc' : 'asc';
  else { ordersView.sort = k; ordersView.dir = ['net','kar','ucret','ilerleme'].includes(k) ? 'desc' : 'asc'; }
  lsSet('ordersSort', ordersView.sort); lsSet('ordersDir', ordersView.dir);
  render();
}

function sortRecords(list){
  const s = SORTS[ordersView.sort] || SORTS.due;
  const yon = ordersView.dir === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => {
    const x = s.al(a), y = s.al(b);
    const xb = x == null || x === '', yb = y == null || y === '';
    if(xb && yb) return 0;
    if(xb) return 1;          // bos olan hep sonda, yonden bagimsiz
    if(yb) return -1;
    if(x === y) return 0;
    return (typeof x === 'string' ? x.localeCompare(y, 'tr') : (x < y ? -1 : 1)) * yon;
  });
}

function setOrdersView(mode){
  ordersView.mode = mode; lsSet('ordersMode', mode);
  ordersView.sel.clear();
  render();
}
function setOrdersDurum(d){ ordersView.durum = d; ordersView.sel.clear(); render(); }
function setOrdersSrc(k){ ordersView.src = k; ordersView.sel.clear(); render(); }

/* Genel Bakış ve bildirimler buradan süzüyor — kendi filtre mantığını
   kurmuyorlar, aksi hâlde aynı ekranda farklı sayılar çıkardı. */
function setOrdersFilter(f){
  switchTab('siparis');
  if('durum'   in f) ordersView.durum = f.durum;
  if('game'    in f) setGameScope(f.game, true);
  if('booster' in f) document.getElementById('filterBooster').value = f.booster;
  if('archive' in f) document.getElementById('filterArchive').value = f.archive;
  if('q'       in f) document.getElementById('search').value = f.q;
  ordersView.sel.clear();
  render();
}

function filterRecords(){
  const q  = (document.getElementById('search').value || '').toLowerCase();
  const fb = document.getElementById('filterBooster').value;
  const fa = document.getElementById('filterArchive').value;
  return records.filter(r => {
    if(fa === 'active' && r.archived) return false;
    if(fa === 'arch' && !r.archived) return false;
    if(!inScope(r)) return false;
    if(ordersView.src === 'ic'  &&  isDis(r)) return false;
    if(ordersView.src === 'dis' && !isDis(r)) return false;
    // 'acik' sanal bir durum: akışı bitmemiş işler. Genel Bakış'taki
    // "Açık sipariş" KPI'ı buna bağlı, yoksa tıklayınca farklı sayı çıkardı.
    if(ordersView.durum === 'acik'){ if(!isOpen(r)) return false; }
    else if(ordersView.durum && r.durum !== ordersView.durum) return false;
    if(fb && r.boosterId !== fb) return false;
    if(!q) return true;
    return [r.baslangic, r.hedef, r.jobDesc, ORDER_TYPES[r.orderType], gameOf(r.game).label,
            r.not, r.riotId, nameOf(r.boosterId)].join(' ').toLowerCase().includes(q);
  });
}

/* Durum sekmesi sayaçları durum filtresini YOK SAYAR, diğer filtreleri sayar —
   yoksa seçili sekmenin dışındaki her sekme 0 gösterirdi. */
/* Durum filtresi dışındaki filtrelerin sonucundaki durumlar. */
function hepsiDurum(){
  const tut = ordersView.durum; ordersView.durum = '';
  const d = filterRecords().map(r => r.durum); ordersView.durum = tut;
  return d;
}

function statusCounts(){
  const tut = ordersView.durum; ordersView.durum = '';
  const hepsi = filterRecords(); ordersView.durum = tut;
  const c = { '': hepsi.length };
  hepsi.forEach(r => { c[r.durum] = (c[r.durum] || 0) + 1; });
  FORM_STATUSES.forEach(k => c[k] = c[k] || 0);
  return c;
}

function renderStatusTabs(){
  const box = document.getElementById('statusTabs'); if(!box) return;
  const c = statusCounts();
  // Veride bulunan ama formda seçilemeyen durumlar (eski 'odendi') da sekme
  // alsın; yoksa "Tümü" onları sayar ama hiçbir sekmede görünmezler.
  const veride = [...new Set(hepsiDurum())];
  const ekstra = veride.filter(k => !FORM_STATUSES.includes(k));
  const tabs = [['', 'Tümü']]
    .concat(FORM_STATUSES.filter(k => k !== 'odendi' || veride.includes(k)).concat(ekstra)
            .map(k => [k, STATUS_LABEL[k] || k]));
  box.innerHTML = tabs.map(([k, l]) =>
    `<button class="st-tab${k===ordersView.durum?' active':''}" onclick="setOrdersDurum('${esc(k)}')">
       ${esc(l)}<span class="st-n">${c[k] || 0}</span></button>`).join('');
}

/* Kaynak sekmeleri. Sayaclar kendi filtresini yok sayar (yoksa secili olmayan
   sekme hep 0 gosterir), diger filtreleri sayar. Yalnizca admin gorur: booster
   dis kaynak diye bir sey bilmiyor. */
function renderSrcTabs(){
  const box = document.getElementById('srcTabs'); if(!box) return;
  if(!isAdmin()){ box.innerHTML = ''; box.classList.add('hidden'); return; }
  const tut = ordersView.src; ordersView.src = '';
  const hepsi = filterRecords(); ordersView.src = tut;
  const dis = hepsi.filter(isDis).length;
  // Hic dis kaynak isi yoksa sekmeler gurultu.
  if(!dis && !tut){ box.innerHTML = ''; box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const say = { '':hepsi.length, ic:hepsi.length - dis, dis };
  box.innerHTML = [['','Tüm işler'], ['ic','Kendi ekibim'], ['dis','Dış kaynak']].map(([k,l]) =>
    `<button class="st-tab${k===ordersView.src?' active':''}" onclick="setOrdersSrc('${esc(k)}')">
       ${esc(l)}<span class="st-n">${say[k]}</span></button>`).join('');
}

/* Siralama secici. Dar ekranda tablo basliklari yiginlasip kayboluyor;
   siralamanin oradan da erisilebilir olmasi gerek. Genis ekranda da
   klavye/fare ile tek adimda yon degistirmeye yariyor. */
function renderSortSel(){
  const box = document.getElementById('sortSel'); if(!box) return;
  const admin = isAdmin();
  const secenekler = Object.entries(SORTS).filter(([, s]) => !s.admin || admin);
  box.innerHTML = secenekler.map(([k, s]) =>
    `<option value="${esc(k)}" ${k === ordersView.sort ? 'selected' : ''}>${esc(s.etiket)}</option>`).join('');
}
function onSortSel(v){
  if(v === ordersView.sort) return;      // setSort yonu cevirirdi; select'te bu istenmiyor
  ordersView.sort = v;
  ordersView.dir = ['net','kar','ucret','ilerleme'].includes(v) ? 'desc' : 'asc';
  lsSet('ordersSort', v); lsSet('ordersDir', ordersView.dir);
  render();
}
function toggleSortDir(){
  ordersView.dir = ordersView.dir === 'asc' ? 'desc' : 'asc';
  lsSet('ordersDir', ordersView.dir);
  render();
}

function renderViewSwitch(){
  const box = document.getElementById('viewSwitch'); if(!box) return;
  renderSortSel();
  const yon = document.getElementById('sortDir');
  if(yon){ yon.textContent = ordersView.dir === 'asc' ? '↑' : '↓';
           yon.title = ordersView.dir === 'asc' ? 'Artan' : 'Azalan'; }
  const modlar = [['tablo','☰','Tablo'], ['kart','▤','Kart'], ['pano','▥','Pano']];
  box.innerHTML = modlar.map(([m, i, t]) =>
    `<button class="vw${m===ordersView.mode?' active':''}" onclick="setOrdersView('${m}')" title="${t}">${i}</button>`).join('');
}

/* --- Toplu seçim ----------------------------------------------------------
   Görünmeyen kayıtta değişiklik yapmak bu sistemdeki en tehlikeli hata sınıfı;
   her render'da seçim görünür listeye kırpılıyor. Toplu SİLME bilinçli olarak
   yok — geri dönüşü olmayan tek işlem tek tek yapılsın. */
function pruneSelection(list){
  const gorunen = new Set(list.map(r => r.id));
  [...ordersView.sel].forEach(id => { if(!gorunen.has(id)) ordersView.sel.delete(id); });
}
function toggleSel(id, on){
  if(on) ordersView.sel.add(id); else ordersView.sel.delete(id);
  renderBulkBar();
  document.querySelectorAll(`[data-selrow="${id}"]`).forEach(el => el.classList.toggle('picked', on));
}
function selAll(on){
  const list = filterRecords();
  ordersView.sel.clear();
  if(on) list.forEach(r => ordersView.sel.add(r.id));
  render();
}
function renderBulkBar(){
  const bar = document.getElementById('bulkBar'); if(!bar) return;
  const n = ordersView.sel.size;
  bar.classList.toggle('hidden', n === 0);
  if(!n) return;
  // Toplu atama en cok tekrar eden is: on siparise tek tek booster secmek
  // yirmi tiklamaydi.
  const atama = isAdmin()
    ? `<select class="bulk-sel" onchange="bulkAssign(this.value);this.value=''">
         <option value="">Booster ata…</option>
         ${people.filter(p => p.active && p.role === 'booster')
                 .map(p => `<option value="${esc(p.id)}">${esc(p.display_name)}</option>`).join('')}
         <option value="__bos">— atamayı kaldır</option>
       </select>`
    : '';
  bar.innerHTML = `<span class="bulk-n">${n} seçili</span>
    ${atama}
    <button class="icon-btn go" onclick="bulkAdvance()">→ Durumu ilerlet</button>
    ${isAdmin() ? `<button class="icon-btn" onclick="bulkArchive(true)">🗄 Arşivle</button>
                   <button class="icon-btn" onclick="bulkPaid(true)">💰 Ödendi</button>` : ''}
    <button class="icon-btn" onclick="selAll(false)">Seçimi bırak</button>`;
}

/* Toplu yazmalar .select('id') ile yapılıyor: RLS bir satırı sessizce
   reddedebiliyor (deleteRecord'da bunun canlı örneği var). Dönen satır sayısı
   beklenenden azsa kullanıcıya söylüyoruz. */
async function bulkPatch(ids, patch, etiket){
  if(!ids.length) return;
  const { data, error } = await sb.from(TABLES.orders).update(patch).in('id', ids).select('id');
  if(error){ alert(etiket + ' başarısız: ' + error.message); return; }
  const yazilan = (data || []).length;
  if(yazilan < ids.length)
    alert(`${etiket}: ${ids.length} seçiliydi, ${yazilan} tanesi güncellendi. ` +
          `Kalanına yetkin olmayabilir.`);
  ordersView.sel.clear();
  await loadAll();
}
function bulkAdvance(){
  // Her seçilinin bir sonraki durumu farklı olabilir; duruma göre gruplayıp
  // ayrı ayrı yazıyoruz. Akışı bitmiş olanlar atlanıyor.
  const secili = filterRecords().filter(r => ordersView.sel.has(r.id));
  const gruplar = {};
  secili.forEach(r => { const n = NEXT_STATUS[r.durum]; if(n) (gruplar[n] ||= []).push(r.id); });
  const adet = Object.values(gruplar).reduce((a, b) => a + b.length, 0);
  if(!adet){ alert('Seçili işlerin hepsi akışın sonunda.'); return; }
  if(!confirm(`${adet} işin durumu ilerletilecek. Devam?`)) return;
  Object.entries(gruplar).forEach(([durum, ids]) => bulkPatch(ids, { durum }, 'Durum ilerletme'));
}
/* Toplu booster atama. Disariya verilmis isler ATLANIYOR: o islerin ucreti
   satiya odeniyor, booster atamak borcu iki kere yazardi. Kac tanesinin
   atlandigi da soyleniyor - sessizce atlamak "atadim saniyorum" hatasi olur. */
function bulkAssign(val){
  if(!val) return;
  const secili = filterRecords().filter(r => ordersView.sel.has(r.id));
  const uygun = secili.filter(r => !isDis(r));
  const atlanan = secili.length - uygun.length;
  if(!uygun.length){ alert('Seçililerin hepsi dış kaynak — booster atanmaz.'); return; }
  const bos = val === '__bos';
  const ad = bos ? '' : nameOf(val);
  const mesaj = `${uygun.length} iş ${bos ? 'atamasız bırakılacak' : ad + ' adlı boostçuya atanacak'}.`
    + (atlanan ? ` ${atlanan} dış kaynak işi atlanıyor.` : '') + ' Devam?';
  if(!confirm(mesaj)) return;
  // Atama yapilirken 'yeni' durumdaki isler 'atandi'ya geciyor: bot 'yeni'
  // siparisleri yoklamiyor, atanmis ama 'yeni' kalan is sessizce takipsiz olurdu.
  const yeniler = uygun.filter(r => r.durum === 'yeni').map(r => r.id);
  const otekiler = uygun.filter(r => r.durum !== 'yeni').map(r => r.id);
  const alan = { booster_id: bos ? null : val };
  if(otekiler.length) bulkPatch(otekiler, alan, 'Booster atama');
  if(yeniler.length)  bulkPatch(yeniler, bos ? alan : { ...alan, durum:'atandi' }, 'Booster atama');
}

function bulkArchive(v){
  const ids = [...ordersView.sel];
  if(confirm(`${ids.length} iş arşivlenecek. Devam?`)) bulkPatch(ids, { archived: v }, 'Arşivleme');
}
function bulkPaid(v){
  const ids = filterRecords().filter(r => ordersView.sel.has(r.id) && r.payout > 0).map(r => r.id);
  if(!ids.length){ alert('Seçililerde ücreti olan iş yok.'); return; }
  if(confirm(`${ids.length} iş ödendi olarak işaretlenecek. Devam?`)) bulkPatch(ids, { paid: v }, 'Ödeme işaretleme');
}

/* --- Ortak parçalar ------------------------------------------------------- */

function selBox(r){
  return `<input type="checkbox" class="sel" ${ordersView.sel.has(r.id)?'checked':''}
    onclick="event.stopPropagation();toggleSel('${esc(r.id)}',this.checked)">`;
}
function nextBtn(r){
  return NEXT_STATUS[r.durum]
    ? `<button class="icon-btn go" onclick="event.stopPropagation();setStatus('${r.id}','${NEXT_STATUS[r.durum]}')">→ ${STATUS_LABEL[NEXT_STATUS[r.durum]]}</button>`
    : '';
}

/* --- Görünümler ----------------------------------------------------------- */

/* Teslim durumu çipi. Tarih girilmemişse hiç çizilmiyor: "süresiz" ayrı bir
   bilgi değil, sadece bilinmiyor. */
function dueChip(r){
  const t = teslim(r);
  if(!t) return '';
  return `<span class="chip ${t.gec ? 'gec' : 'due'}">${t.gec ? '⏰' : '🗓'} ${esc(t.metin)}</span>`;
}

/* Kart üstündeki ilerleme çubuğu. Takip verisi varsa gerçek elo ilerlemesi,
   yoksa işin akıştaki adımı — etiket hangisi olduğunu söylüyor (ui-common). */
function ilerlemeHTML(r){
  const p = ilerleme(r);
  return `<div class="rec-prog">
    <div class="rec-prog-bar ${p.takip ? 'canli' : ''}"><span style="width:${(p.oran*100).toFixed(1)}%"></span></div>
    <div class="rec-prog-l">${esc(p.etiket)}</div></div>`;
}

/* Kart eylemleri. Tasarımda kartın ayağında tek "Detay" var; buradaki yedi
   buton kartı üç satır uzatıp listeyi okunmaz hâle getiriyordu. Sık kullanılan
   ikisi (durumu ilerlet, detay) ayakta duruyor, kalanı "⋯" ile açılıyor —
   hiçbir eylem kaybolmadı, sadece varsayılan olarak kapalı. */
let acikEylem = null;

function toggleEylem(id, e){
  if(e) e.stopPropagation();
  acikEylem = acikEylem === id ? null : id;
  document.querySelectorAll('[data-acts]').forEach(el =>
    el.classList.toggle('hidden', el.dataset.acts !== acikEylem));
  document.querySelectorAll('[data-actbtn]').forEach(el =>
    el.classList.toggle('active', el.dataset.actbtn === acikEylem));
}

function cardHTML(r){
    const f=F(r.id); const netTL=netGelirTLof(r.id), kar=netTL-r.payout-disMaliyetTL(r);
    const ayak=isAdmin()
      ? (hasFin(r.id)
          ? `<div class="rec-f"><span class="rec-f-l">net gelir</span><span class="rec-f-v">${fmt(netTL,'TRY')}</span></div>
             <div class="rec-f"><span class="rec-f-l">kâr</span><span class="rec-f-v ${kar<0?'neg':'pos'}">${fmt(kar,'TRY')}</span></div>`
          : `<div class="rec-f"><span class="rec-f-l">finans</span><span class="rec-f-v warn">girilmemiş</span></div>
             <div class="rec-f"><span class="rec-f-l">booster</span><span class="rec-f-v">${fmt(r.payout,'TRY')}</span></div>`)
      : `<div class="rec-f"><span class="rec-f-l">kazancın</span><span class="rec-f-v">${fmt(r.payout,'TRY')}</span></div>`;
    const shot=r.image?`<div class="rec-shot"><img src="${r.image}" onclick="openLightbox('${r.id}')"></div>`:'';
    return `<div class="rec ${r.archived?'arch':''}${isGec(r)?' gec':''}">
      <div class="rec-top"><div>
        <div class="rec-route open" onclick="openDetail('${r.id}')" title="Detayı aç">
          <span class="chip game">${esc(gameOf(r.game).short)}</span> ${routeHTML(r)}</div>
        <div class="rec-meta" style="margin-top:7px">
          ${isAdmin()&&isDis(r)?`<span class="chip dis">🏷 ${esc(r.vendor)}${r.vendorPaid?'':' · ödenmedi'}</span>`:''}
          ${r.orderType!=='rank'?`<span class="chip" style="border-color:rgba(90,157,237,.35);color:var(--blue)">🎯 ${ORDER_TYPES[r.orderType]}</span>`:''}
          ${r.archived?`<span class="chip" style="color:var(--amber)">🗄 arşiv</span>`:''}
          ${isAdmin()&&f.platform?`<span class="chip" style="border-color:rgba(212,175,55,.3);color:var(--gold)">🛒 ${esc(f.platform)}${refHTML(f.platformRef)}</span>`:''}
          ${isAdmin()&&r.boosterId?`<span class="chip booster">👤 ${esc(nameOf(r.boosterId))}</span>`:''}
          ${isAdmin()&&!r.boosterId&&!isDis(r)?`<span class="chip" style="color:var(--amber)">⚠ atanmadı</span>`:''}
          <span class="chip">🗓 ${r.tarih}</span>
          ${dueChip(r)}
          ${r.orderType==='rank'&&r.startRR?`<span class="chip">RR ${r.startRR}</span>`:''}
          ${r.orderType==='rank'&&r.region!=='TR'?`<span class="chip">🌍 ${esc(r.region)}</span>`:''}
          ${r.riotId?`<span class="chip" style="border-color:rgba(90,157,237,.35);color:var(--blue)">🎮 ${esc(r.riotId)}</span>`:''}
          ${r.orderType==='rank'&&r.extraWin?`<span class="chip">➕ Extra Win</span>`:''}
          ${(r.extras||[]).map(k=>`<span class="chip">✚ ${esc(extraLabel(k))}</span>`).join('')}
          ${r.payout>0?`<span class="chip ${r.paid?'paid':'unpaid'}">${r.paid?'✓ ödendi':'● ödenmedi'}</span>`:''}
        </div>
      </div>
      <span class="status ${esc(r.durum)}">${esc(STATUS_LABEL[r.durum]||r.durum)}</span></div>
      ${ilerlemeHTML(r)}
      ${r.jobDesc?`<div class="rec-note">📋 ${esc(r.jobDesc)}</div>`:''}
      ${r.not?`<div class="rec-note">${esc(r.not)}</div>`:''}${shot}
      <div class="rec-foot">
        ${ayak}
        <div class="rec-foot-b">
          ${NEXT_STATUS[r.durum]?`<button class="icon-btn go" onclick="setStatus('${r.id}','${NEXT_STATUS[r.durum]}')">→ ${STATUS_LABEL[NEXT_STATUS[r.durum]]}</button>`:''}
          <button class="icon-btn" onclick="openDetail('${r.id}')">🔍 Detay</button>
          <button class="icon-btn more" data-actbtn="${esc(r.id)}" onclick="toggleEylem('${esc(r.id)}',event)" title="Diğer işlemler">⋯</button>
        </div>
      </div>
      <div class="rec-more ${acikEylem===r.id?'':'hidden'}" data-acts="${esc(r.id)}">
        <button class="icon-btn" onclick="document.getElementById('shot-${r.id}').click()">📷 ${r.image?'Görseli değiştir':'Görsel ekle'}</button>
        <button class="icon-btn" onclick="editRecord('${r.id}')">✎ Düzenle</button>
        ${isAdmin()&&r.payout>0?`<button class="icon-btn" onclick="togglePaid('${r.id}',${!r.paid})">${r.paid?'↺ Ödeme geri':'💰 Ödendi'}</button>`:''}
        ${isAdmin()?`<button class="icon-btn" onclick="toggleArchive('${r.id}',${!r.archived})">${r.archived?'↩ Arşivden çıkar':'🗄 Arşivle'}</button>`:''}
        ${(isAdmin()||!r.paid)?`<button class="icon-btn del" onclick="deleteRecord('${r.id}')">🗑 Sil</button>`:''}
        <input type="file" id="shot-${r.id}" accept="image/*" class="hidden" onchange="addShot('${r.id}',this)">
      </div></div>`;
}

function renderCards(list){
  return list.map(cardHTML).join('');
}

function renderTable(list){
  const admin = isAdmin();
  /* Sutun basliklari siralanabilir. Aktif sutunun oku yonu gosteriyor;
     aria-sort ekran okuyucuya da soyluyor. */
  const th = (k, sinif) => {
    const s = SORTS[k];
    const aktif = ordersView.sort === k;
    const yon = aktif ? (ordersView.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    return `<th class="${sinif || ''}${aktif ? ' sorted' : ''}" aria-sort="${yon}">
      <button class="th-b" onclick="setSort('${esc(k)}')">${esc(s.etiket)}
        <span class="th-ok">${aktif ? (ordersView.dir === 'asc' ? '↑' : '↓') : '↕'}</span></button></th>`;
  };
  const bas = `<tr>
    <th class="c-sel"><input type="checkbox" class="sel" onclick="selAll(this.checked)"
        ${list.length && ordersView.sel.size===list.length?'checked':''}></th>
    ${th('is')}${th('oyun','c-game')}${th('durum','c-st')}
    ${admin?th('booster','c-b'):''}
    ${th('ilerleme','c-track')}${th('due','c-due')}
    ${admin?th('net','r c-m')+th('kar','r c-m'):th('ucret','r c-m')}
    <th class="c-act"></th></tr>`;

  const satir = r => {
    const net = netGelirTLof(r.id), kar = net - r.payout - disMaliyetTL(r);
    const para = admin
      ? (hasFin(r.id)
          ? `<td class="r c-m" data-l="Net gelir">${fmt(net,'TRY')}</td>
             <td class="r c-m" data-l="Kâr"><b class="${kar<0?'neg':'pos'}">${fmt(kar,'TRY')}</b></td>`
          : `<td class="r c-m dim" data-l="Net gelir">—</td><td class="r c-m dim" data-l="Kâr">—</td>`)
      : `<td class="r c-m" data-l="Kazancın">${fmt(r.payout,'TRY')}</td>`;
    const t = teslim(r);
    return `<tr data-selrow="${esc(r.id)}" class="${ordersView.sel.has(r.id)?'picked':''}${r.archived?' arch':''}${isGec(r)?' gec':''}">
      <td class="c-sel">${selBox(r)}</td>
      <td class="o-job" onclick="openDetail('${esc(r.id)}')">
        <div class="o-route">${routeHTML(r)}</div>
        <div class="o-sub">${esc(r.tarih||'')}${r.riotId?' · '+esc(r.riotId):''}</div></td>
      <td class="c-game" data-l="Oyun"><span class="chip game">${esc(gameOf(r.game).short)}</span></td>
      <td class="c-st" data-l="Durum">${statusCell(r)}</td>
      ${admin?`<td class="c-b" data-l="Booster">${isDis(r)?`<span class="chip dis">🏷 ${esc(r.vendor)}</span>`
        :r.boosterId?esc(nameOf(r.boosterId)):'<span class="dim">atanmadı</span>'}</td>`:''}
      <td class="c-track" data-l="İlerleme">${ilerlemeHTML(r)}</td>
      <td class="c-due" data-l="Teslim">${t ? `<span class="${t.gec?'gec':'dim'}">${esc(t.metin)}</span>`
                            : '<span class="dim">—</span>'}</td>
      ${para}
      <td class="c-act"><button class="icon-btn" onclick="openDetail('${esc(r.id)}')">🔍</button></td>
    </tr>`;
  };
  return `<div class="table-scroll"><table class="otable">
    <thead>${bas}</thead><tbody>${list.map(satir).join('')}</tbody></table></div>`;
}

/* Satir ici durum degisimi. "Tek tek tiklama yavas" sikayetinin tablo
   tarafindaki cevabi: durumu degistirmek icin drawer acmak ya da forma gitmek
   gerekmiyor, hucredeki secim yetiyor.

   Akisi bitmis durumlar (odendi gibi) formda secilemiyor ama VERIDE var;
   secenek listesine mevcut durumu her zaman ekliyoruz, yoksa select bos
   gorunur ve ilk tiklamada isi baska bir duruma kaydirirdi. */
function statusCell(r){
  if(r.archived) return `<span class="status ${esc(r.durum)}">${esc(STATUS_LABEL[r.durum]||r.durum)}</span>`;
  const secenekler = FORM_STATUSES.includes(r.durum) ? FORM_STATUSES : [...FORM_STATUSES, r.durum];
  return `<select class="st-sel ${esc(r.durum)}" onclick="event.stopPropagation()"
      onchange="setStatus('${esc(r.id)}',this.value)">
    ${secenekler.map(k => `<option value="${esc(k)}" ${k===r.durum?'selected':''}>${esc(STATUS_LABEL[k]||k)}</option>`).join('')}
  </select>`;
}

/* Pano: sürükle-bırak yerine kart üstündeki "→" butonu. Düz JS'te HTML5 DnD
   dokunmatikte çalışmıyor ve yanlış sütuna bırakma geri alınamıyor —
   NEXT_STATUS'ün tersi domain.json'da tanımlı değil. */
function renderBoard(list){
  // Formda seçilemeyen ama veride bulunabilen durumlar da sütun almalı —
  // eski 'odendi' kayıtları aksi hâlde panoda hiç görünmüyor ama "Tümü"
  // sayacına dahil oluyordu. Böyle kayıt yoksa sütun da eklenmiyor.
  const ekstra = [...new Set(list.map(r => r.durum))].filter(k => !FORM_STATUSES.includes(k));
  const sutunlar = FORM_STATUSES.filter(k => k !== 'odendi' || list.some(r => r.durum === 'odendi'))
    .concat(ekstra);
  return `<div class="board-hint">Kartı sütuna sürükleyerek durumunu değiştir.
      Birden çok kart seçiliyse hepsi taşınır. Dokunmatikte kart üstündeki
      <b>→</b> butonunu kullan.</div>
    <div class="board">${sutunlar.map(k => {
    const kolon = list.filter(r => r.durum === k);
    return `<div class="bcol" data-col="${esc(k)}"
        ondragover="boardDragOver(event,'${esc(k)}')" ondragleave="boardDragLeave(event)"
        ondrop="boardDrop(event,'${esc(k)}')">
      <div class="bcol-h"><span class="status ${esc(k)}">${esc(STATUS_LABEL[k]||k)}</span><span class="bcol-n">${kolon.length}</span></div>
      <div class="bcol-body">${kolon.map(r => `
        <div class="bcard${isGec(r)?' gec':''}" data-selrow="${esc(r.id)}" draggable="true"
             ondragstart="boardDragStart(event,'${esc(r.id)}')" ondragend="boardDragEnd(event)"
             ondragover="shotDragOver(event)" ondragleave="shotDragLeave(event)"
             ondrop="shotDrop(event,'${esc(r.id)}')"
             onclick="openDetail('${esc(r.id)}')">
          <div class="bcard-top">
            <span class="bcard-grip" title="sürükle">⠿</span>
            <div class="bcard-head">
              <div class="o-route"><span class="chip game">${esc(gameOf(r.game).short)}</span> ${routeHTML(r)}</div>
              <div class="bcard-sub">${esc(r.tarih || '')}${r.riotId ? ' · ' + esc(r.riotId) : ''}${
                (teslim(r)||{}).gec ? ` · <span class="gec">${esc(teslim(r).metin)}</span>` : ''}</div>
            </div>
          </div>
          ${ilerlemeHTML(r)}
          <div class="bcard-meta">
          ${isAdmin()&&isDis(r)?`<span class="chip dis">🏷 ${esc(r.vendor)}${r.vendorPaid?'':' · ödenmedi'}</span>`:''}
            ${isAdmin()&&r.boosterId?`<span class="chip booster">${esc(nameOf(r.boosterId))}</span>`:''}
            ${isAdmin()&&r.payout>0?`<span class="bcard-pay">${fmt(r.payout,'TRY')}</span>`:''}
          </div>
          <div class="bcard-foot">${nextBtn(r)}</div>
        </div>`).join('') || '<div class="bcol-empty">boş</div>'}</div>
    </div>`;
  }).join('')}</div>`;
}

/* --- Pano: sürükle-bırak -------------------------------------------------

   Kart üstündeki "→" butonu KALIYOR. Sürükle-bırak fare için hızlı ama
   dokunmatikte HTML5 DnD çalışmıyor ve yanlış sütuna bırakmanın geri alması
   yok (NEXT_STATUS'ün tersi domain.json'da tanımlı değil). İkisi bir arada:
   masaüstünde sürükle, telefonda butona bas.

   Sürüklenen kart seçiliyse tüm seçim taşınır — kullanıcı 5 kart seçip birini
   sürüklediğinde beşinin de taşınmasını bekler. */
/* Bitiş görüntüsünü kartın üstüne bırakmak: dosyayı kaydediyor ve işi
   "Tamam"a çekiyor. Boostçunun teslim akışı zaten "ekran görüntüsü at" —
   panelde de aynı hareket olsun.

   Kart sürüklemesiyle karışmıyor: sürüklenen şey DOSYA mı diye bakıyoruz
   (dataTransfer.types 'Files' içeriyorsa). Kart sürüklerken tetiklenirse
   yanlış sütuna düşerdi. */
const dosyaSurukleniyor = e => [...(e.dataTransfer?.types || [])].includes('Files');

function shotDragOver(e){
  if(!dosyaSurukleniyor(e)) return;          // kart sürüklemesi → sütun ilgilensin
  e.preventDefault(); e.stopPropagation();
  e.currentTarget.classList.add('shot-over');
}
function shotDragLeave(e){ e.currentTarget.classList.remove('shot-over'); }

async function shotDrop(e, id){
  if(!dosyaSurukleniyor(e)) return;
  e.preventDefault(); e.stopPropagation();
  e.currentTarget.classList.remove('shot-over');
  const f = e.dataTransfer.files[0];
  if(!f || !/^image\//.test(f.type)){ toast('Yalnızca görsel bırakabilirsin.', 'err'); return; }
  const r = records.find(x => x.id === id); if(!r) return;
  try {
    const d = await compressImage(f);
    // Görsel ve durum TEK yazımda: iki ayrı istek olsaydı ikincisi
    // düşünce görselli ama hâlâ 'devam' bir kayıt kalırdı.
    const alan = { image:d };
    if(r.durum !== 'tamam' && NEXT_STATUS[r.durum]) alan.durum = 'tamam';
    const { error } = await sb.from(TABLES.orders).update(alan).eq('id', id);
    if(error) throw error;
    await loadAll();
    toast(alan.durum ? `${routeText(r)} · görsel eklendi, Tamam'a alındı`
                     : `${routeText(r)} · görsel eklendi`);
  } catch(err){ toast('Görsel eklenemedi: ' + err.message, 'err'); }
}

let boardDrag = null;

function boardDragStart(e, id){
  boardDrag = ordersView.sel.has(id) ? [...ordersView.sel] : [id];
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);   // Firefox sürüklemeyi başlatmıyor yoksa
  e.currentTarget.classList.add('dragging');
}
function boardDragEnd(e){
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.bcol.over').forEach(el => el.classList.remove('over'));
  boardDrag = null;
}
function boardDragOver(e, durum){
  if(!boardDrag) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('over');
}
function boardDragLeave(e){
  // Alt elemanlara girip çıkarken tetiklenmesin.
  if(!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('over');
}
async function boardDrop(e, durum){
  e.preventDefault();
  e.currentTarget.classList.remove('over');
  const ids = boardDrag; boardDrag = null;
  if(!ids || !ids.length) return;

  // Zaten o sütunda olanları atla; boşuna yazma ve boşuna realtime turu olmasın.
  const tasinacak = records.filter(r => ids.includes(r.id) && r.durum !== durum);
  if(!tasinacak.length) return;

  // Geri alması olmadığı için birden fazla kartta onay istiyoruz.
  if(tasinacak.length > 1 &&
     !confirm(`${tasinacak.length} iş "${STATUS_LABEL[durum]}" durumuna taşınacak. Devam?`)) return;

  await bulkPatch(tasinacak.map(r => r.id), { durum }, 'Durum değiştirme');
}

function render(){
  renderStats();
  renderStatusTabs();
  renderSrcTabs();
  renderViewSwitch();

  const list = sortRecords(filterRecords());
  pruneSelection(list);
  renderBulkBar();

  // Tablo ve pano geniş alan istiyor; form gizleniyor ama SİLİNMİYOR —
  // resetForm() ve editRecord() hâlâ o alanları okuyor.
  hideFormIfWide();

  const el = document.getElementById('recordList');
  if(!list.length){
    el.innerHTML = `<div class="empty"><div class="big">${records.length?'Sonuç yok':'Henüz iş yok'}</div>
      <div>${isAdmin()?'Soldaki formdan ekle.':'Soldaki formdan işini kendin ekleyebilirsin.'}</div></div>`;
  } else if(ordersView.mode === 'tablo'){
    el.innerHTML = renderTable(list);
  } else if(ordersView.mode === 'pano'){
    el.innerHTML = renderBoard(list);
  } else {
    el.innerHTML = renderCards(list);
  }

  // Genel Bakış açıksa o da tazelensin. Erken return'lerin ARKASINDA değil.
  if(currentTab === 'genel') renderOverview();
  if(currentTab === 'odeme') renderPayments();
  renderDetail();   // drawer açıksa içindeki durum/para da tazelensin
  renderShell();
}
