/* ============ SEKME / ROL / BAŞLAT ============ */
function buildTabs(){
  const tabs=isAdmin()
    ? [['siparis','Siparişler'],['rapor','Rapor'],['arsiv','Arşiv'],['boosterlar','Boosterlar'],['hesap','Hesaplayıcı'],['fiyat','Fiyat Listesi']]
    : [['siparis','İşlerim'],['fiyat','Fiyat Listesi']];
  document.getElementById('tabBar').innerHTML=tabs.map((t,i)=>
    `<button class="tab ${i===0?'active':''}" data-tab="${t[0]}" onclick="switchTab('${t[0]}')">${t[1]}</button>`).join('');
}
function switchTab(t){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
  ['siparis','rapor','arsiv','boosterlar','hesap','fiyat'].forEach(x=>{const el=document.getElementById('tab-'+x);if(el)el.classList.toggle('hidden',x!==t);});
  if(t==='siparis'&&isAdmin()) document.getElementById('tab-siparis').classList.remove('hidden');
  if(t==='rapor') renderReport();
  if(t==='arsiv') renderArchive();
  if(t==='fiyat') renderPriceTables();
}
function applyRoleUI(){
  if(!isAdmin()){
    document.getElementById('formPanel').classList.add('hidden');
    document.getElementById('tab-siparis').style.gridTemplateColumns='1fr';
    document.getElementById('filterBooster').classList.add('hidden');
  }
}

/* Başlat */
resetForm();
sb.auth.getSession().then(({data:{session}})=>{ if(session) afterLogin(); else showAuth(); });
