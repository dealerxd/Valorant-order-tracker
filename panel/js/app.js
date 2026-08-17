/* ============ KABUK: NAV / SAYFA / ROL / BAŞLAT ============ */

let currentTab = 'genel';

/* Nav tanımı role göre değişiyor. Booster finans, arşiv ve booster yönetimini
   görmez — bu ayrım yalnızca burada değil, veri katmanında da var (data.js
   booster için order_finance ve invites'ı hiç sorgulamıyor). */
function navDef(){
  return isAdmin()
    ? [['genel','Genel Bakış','◱'], ['siparis','Siparişler','▤'], ['rapor','Rapor','◆'],
       ['odeme','Ödemeler','₺'], ['arsiv','Arşiv','▨'], ['boosterlar','Boosterlar','◇'], ['hesap','Hesaplayıcı','∑'],
       ['fiyat','Fiyat Listesi','≡'], ['profil','Profilim','◉']]
    : [['siparis','İşlerim','▤'], ['fiyat','Fiyat Listesi','≡'], ['profil','Profilim','◉']];
}

const TAB_IDS = ['genel','siparis','odeme','rapor','arsiv','boosterlar','hesap','fiyat','profil'];

const PAGE_META = {
  genel:      ['Genel Bakış',   'işin özeti ve dikkat isteyenler'],
  siparis:    ['Siparişler',    'açık işler ve takip durumu'],
  odeme:      ['Ödemeler',      'boosterlara ve dış satıcılara olan borç'],
  rapor:      ['Rapor',         'dönemsel gelir ve kâr'],
  arsiv:      ['Arşiv',         'kapatılmış işler'],
  boosterlar: ['Boosterlar',    'ekip ve davet kodları'],
  hesap:      ['Hesaplayıcı',   'fiyat teklifi hesapla'],
  fiyat:      ['Fiyat Listesi', 'booster ödemeleri'],
  profil:     ['Profilim',      'iletişim ve ödeme bilgilerin'],
};

function buildTabs(){
  const def = navDef();
  // Rol değiştiyse ya da varsayılan sekme bu rolde yoksa ilkine düş.
  if(!def.some(n => n[0] === currentTab)) currentTab = def[0][0];
  document.getElementById('tabBar').innerHTML = def.map(([k,l,i]) =>
    `<button class="nav-item${k===currentTab?' active':''}" data-tab="${k}" onclick="switchTab('${k}')">
       <span class="nav-ico">${i}</span><span class="nav-label">${l}</span>
       <span class="nav-badge" data-badge="${k}"></span>
     </button>`).join('');
  refreshNavBadges();
}

/* Rozetleri innerHTML'i yeniden yazmadan güncelliyoruz: realtime her sipariş
   değişiminde loadAll->render tetikliyor, buildTabs çağırsak aktif vurgu ve
   dar ekrandaki yatay kaydırma konumu her seferinde sıfırlanırdı. */
function refreshNavBadges(){
  document.querySelectorAll('#tabBar .nav-badge').forEach(el => {
    const v = navBadge(el.dataset.badge);
    el.textContent = v ? String(v) : '';
    el.classList.toggle('hidden', !v);
  });
}

function switchTab(t){
  currentTab = t;
  document.querySelectorAll('#tabBar .nav-item')
    .forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  TAB_IDS.forEach(x => {
    const el = document.getElementById('tab-' + x);
    if(el) el.classList.toggle('hidden', x !== t);
  });

  // #statsRow yalnızca Siparişler'de; Genel Bakış kendi KPI'larını çiziyor.
  const stats = document.getElementById('statsRow');
  if(stats) stats.classList.toggle('hidden', t !== 'siparis');

  if(t === 'siparis')    render();
  if(t === 'genel')      renderOverview();
  if(t === 'odeme')      renderPayments();
  if(t === 'rapor')      renderReport();
  if(t === 'arsiv')      renderArchive();
  if(t === 'fiyat')      renderPriceTables();
  if(t === 'profil')     fillProfileForm();

  renderShell();
  closeNotif();
  // Dar ekranda nav yatay kayıyor; aktif öğe görünür kalsın.
  document.querySelector('#tabBar .nav-item.active')
    ?.scrollIntoView({ inline:'center', block:'nearest' });
}

/* --- Topbar başlığı ve sidebar durumu ------------------------------------- */

function renderShell(){
  const [t, s] = PAGE_META[currentTab] || ['Panel', ''];
  const title = document.getElementById('pageTitle');
  const sub   = document.getElementById('pageSub');
  if(title) title.textContent = t;
  if(sub)   sub.textContent   = s;
  renderBotBox();
  refreshNavBadges();
  renderNotifDot();
}

function renderBotBox(){
  const box = document.getElementById('botBox'); if(!box) return;
  const b = botStatus();
  // Booster'da tracker_state RLS yüzünden boş gelebiliyor; ona "bot durmuş"
  // demek yanlış alarm olur. Takipli iş görünmüyorsa kutuyu hiç çizmiyoruz.
  if(b.hal === 'yok'){ box.innerHTML = ''; return; }
  const sinif = { calisiyor:'ok', gecikmeli:'warn', durmus:'err', bilinmiyor:'muted' }[b.hal];
  box.innerHTML = `<div class="bot-h">Takip Botu</div>
    <div class="bot-line ${sinif}"><span>● ${esc(b.metin)}</span><span class="n">${b.hesap} hesap</span></div>
    <div class="bot-sub">son yoklama ${esc(agoText(b.son))}</div>
    ${b.duraklatilan ? `<div class="bot-sub">${b.duraklatilan} sipariş duraklatıldı</div>` : ''}`;
}

/* --- Bildirim zili --------------------------------------------------------
   Kendi uyarı listesini KURMUYOR, ui-common.js'teki alertModel()'i tüketiyor.
   Ayrı hesaplasaydı zil "7" derken Genel Bakış kartı "4" derdi. */

/* "Görüldü" kaydı SAYIYA değil uyarı kimliğine bağlı. Sayı karşılaştırırken
   eski uyarılar çözülüp yenileri geldiğinde toplam artmıyor ve kritik bir
   uyarı (takıldı, kayıp serisi) hiç bildirilmiyordu. */
const alertKey = a => a.tur + ':' + (a.id || '');

function renderNotifDot(){
  const dot = document.getElementById('notifDot'); if(!dot) return;
  const simdi = alertModel().map(alertKey);
  let gorulen = [];
  try { gorulen = JSON.parse(lsGet('notifSeen', '[]')) || []; } catch(e){}
  const yeni = simdi.filter(k => !gorulen.includes(k));
  dot.classList.toggle('hidden', yeni.length === 0);
}

function toggleNotif(e){
  if(e) e.stopPropagation();          // yoksa dışarı-tıklama dinleyicisi anında kapatır
  const pop = document.getElementById('notifPop');
  const btn = document.getElementById('notifBtn');
  const acik = pop.classList.contains('hidden');
  if(!acik){ closeNotif(); return; }

  const list = alertModel();
  pop.innerHTML = `<div class="notif-h">
      <span>Dikkat isteyenler</span>
      ${list.length ? `<button class="lnk" onclick="markNotifSeen()">okundu işaretle</button>` : ''}
    </div>` + (list.length
      ? `<div class="notif-list">${list.map(a =>
          `<button class="notif-row ${esc(a.tur)}" onclick="${a.id ? `openDetail('${a.id}')` : ''};closeNotif()">
             ${esc(a.metin)}</button>`).join('')}</div>`
      : `<div class="notif-empty">Her şey yolunda.</div>`);
  pop.classList.remove('hidden');
  btn.setAttribute('aria-expanded', 'true');
}

function closeNotif(){
  const pop = document.getElementById('notifPop'); if(!pop) return;
  pop.classList.add('hidden');
  document.getElementById('notifBtn')?.setAttribute('aria-expanded', 'false');
}

function markNotifSeen(){
  lsSet('notifSeen', JSON.stringify(alertModel().map(alertKey)));
  renderNotifDot(); closeNotif();
}

document.addEventListener('click', e => {
  if(!e.target.closest('.notif-wrap')) closeNotif();
});

/* Escape zinciri TEK dinleyicide: en üstteki katmandan başlayıp bir tanesini
   kapatıp çıkıyor. İki ayrı dinleyici olduğunda tek tuş hem drawer'ı kapatıyor
   hem arama kutusunu siliyordu. */
document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  const drawer = document.getElementById('drawer');
  if(drawer && !drawer.classList.contains('hidden')){ closeDetail(); return; }
  const pop = document.getElementById('notifPop');
  if(pop && !pop.classList.contains('hidden')){ closeNotif(); return; }
  const s = document.getElementById('search');
  if(s && s.value){ s.value = ''; render(); }
});

/* --- Yeni sipariş ---------------------------------------------------------
   Tablo/pano modunda form gizli olabiliyor; butonun onu geri getirmesi
   gerekiyor. resetForm() zaten görünürlüğü ayarlıyor (bkz. orders.js). */
function newOrder(){
  switchTab('siparis');
  resetForm();      // alanlari temizler ve formAcik'i false yapar
  showForm();       // ...sonra kullanici icin acik tutar (tablo/pano modunda sart)
  document.getElementById('formPanel')?.scrollIntoView({ behavior:'smooth', block:'start' });
}

/* --- Rol arayüzü ---------------------------------------------------------- */

function applyRoleUI(){
  const admin = isAdmin();
  document.querySelectorAll('#formPanel .admin-only')
    .forEach(el => el.classList.toggle('hidden', !admin));
  // #disAlan/#icAlan hem admin-only hem de birbirinin alternatifi: yukarıdaki
  // toplu toggle ikisini birden açardı. Görünürlüğü seçime göre yeniden kur.
  if(admin) onFulfilChange();
  if(!admin){
    // Booster işini kendisi girer, ücretini fiyat listesinden alır; finansı
    // admin sonradan doldurur.
    document.getElementById('formTitle').textContent = 'İş Ekle';
    document.getElementById('payoutLabel').textContent = 'Ücretin (TL)';
    document.getElementById('filterBooster').classList.add('hidden');
  }
}

/* Sidebar kullanıcı kartı. #whoAmI eskiden header'daydı ve rol etiketini de
   o taşıyordu; artık ad ile rol ayrı elemanlarda. */
function renderMeCard(){
  const ad = me ? (me.display_name || '') : '';
  const w = document.getElementById('whoAmI');
  const r = document.getElementById('meRole');
  const a = document.getElementById('meInitial');
  if(w) w.textContent = ad;
  if(r) r.textContent = isAdmin() ? 'Admin' : 'Booster';
  if(a) a.textContent = (ad.trim()[0] || '—').toUpperCase();
  document.querySelector('.user-card')?.classList.toggle('admin', isAdmin());
}

/* Başlat */
/* Bölge, durum ve oyun seçenekleri HTML'de gömülü değil — shared/domain.json'dan
   üretiliyor. resetForm() bu alanlara değer atadığı için önce doldurulmalı. */
fillRegionSelects(); fillStatusSelects(); fillGameSelects();
resetForm();
sb.auth.getSession().then(({data:{session}})=>{ if(session) afterLogin(); else showAuth(); });

/* Bot kutusundaki "son yoklama" ekran açık kalınca bayatlamasın. */
setInterval(() => { if(me) renderBotBox(); }, 60000);
