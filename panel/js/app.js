/* ============ SEKME / ROL / BAŞLAT ============ */
function buildTabs(){
  const tabs=isAdmin()
    ? [['siparis','Siparişler'],['rapor','Rapor'],['arsiv','Arşiv'],['boosterlar','Boosterlar'],['hesap','Hesaplayıcı'],['fiyat','Fiyat Listesi'],['profil','Profilim']]
    : [['siparis','İşlerim'],['fiyat','Fiyat Listesi'],['profil','Profilim']];
  document.getElementById('tabBar').innerHTML=tabs.map((t,i)=>
    `<button class="tab ${i===0?'active':''}" data-tab="${t[0]}" onclick="switchTab('${t[0]}')">${t[1]}</button>`).join('');
}
function switchTab(t){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
  ['siparis','rapor','arsiv','boosterlar','hesap','fiyat','profil'].forEach(x=>{const el=document.getElementById('tab-'+x);if(el)el.classList.toggle('hidden',x!==t);});
  if(t==='siparis'&&isAdmin()) document.getElementById('tab-siparis').classList.remove('hidden');
  if(t==='rapor') renderReport();
  if(t==='arsiv') renderArchive();
  if(t==='fiyat') renderPriceTables();
  if(t==='profil') fillProfileForm();
}
function applyRoleUI(){
  if(!isAdmin()){
    // Booster formu görür ama sade: panel/link/booster ataması ve para alanları gizli.
    // İşini kendisi girer, ücretini fiyat listesinden alır — finansı admin sonradan doldurur.
    document.querySelectorAll('#formPanel .admin-only').forEach(el=>el.classList.add('hidden'));
    document.getElementById('formTitle').textContent='İş Ekle';
    document.getElementById('payoutLabel').textContent='Ücretin (TL)';
    document.getElementById('filterBooster').classList.add('hidden');
  }
}

/* Başlat */
/* Bölge ve durum seçenekleri HTML'de gömülü değil — shared/domain.json'dan
   üretiliyor. resetForm() bu alanlara değer atadığı için önce doldurulmalı. */
fillRegionSelects(); fillStatusSelects(); fillGameSelects();
resetForm();
sb.auth.getSession().then(({data:{session}})=>{ if(session) afterLogin(); else showAuth(); });
