/* ============ SUPABASE + SABİTLER + GLOBAL DURUM ============ */
const SUPABASE_URL = "https://yhrvpgkxywwgeelhjszb.supabase.co";
const SUPABASE_KEY = "sb_publishable_zwHVMn87dm7xJ1aB-_p7Xg_iUypsY-L";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const CUR = { TRY:'₺', USD:'$', EUR:'€' };
const fmt = (n,c)=> (CUR[c]||'') + Number(n||0).toLocaleString('tr-TR');

/* Panel: alış para birimi + komisyon seçenekleri (kur elle girilir) */
const PLATFORMS = {
  "Eldorado":  { cur:'USD', fees:[10] },
  "GameBoost": { cur:'EUR', fees:[10,45] }
};

/* Sipariş türleri */
const ORDER_TYPES = { rank:'Rank Boost', netwin:'Net Win', placement:'Placement', custom:'Özel' };

/* Extra seçenekleri — çarpanları SETTINGS.extras'ta, admin Fiyat Listesi'nden düzenler */
const EXTRA_DEF = [
  {key:'duo',     label:'Duo Boost'},
  {key:'stream',  label:'Stream'},
  {key:'offline', label:'Offline Mode'},
  {key:'agent',   label:'Agent Selection'},
  {key:'no5q',    label:'No 5Q'},
  {key:'soloq',   label:'SoloQ'}
];
const extraLabel=k=>{const d=EXTRA_DEF.find(e=>e.key===k);return d?d.label:k;};
const extraMultOf=k=>((SETTINGS.extras||{})[k]||1);
const extrasMult=keys=>(keys||[]).reduce((m,k)=>m*extraMultOf(k),1);

/* RANK_ORDER, REGION_MULT, STATUS_LABEL, NEXT_STATUS ve TABLES artık
   js/domain.generated.js'ten geliyor — kaynağı shared/domain.json.
   Takip botu aynı dosyayı okuyor; burada elle değiştirirsen bot'la ayrışır.

   Akış Tamam'da biter; ödeme ayrı takip edilir (paid bayrağı, 💰 butonu —
   sadece admin). 'odendi' etiketi eski kayıtların görüntülenmesi için duruyor,
   formda seçenek değil. */

/* Fiyat verisi (DB'den yüklenir)
   STEP_PRICE[r] = r rankından bir sonrakine çıkmanın TL fiyatı (bölüm başı).
   Boost fiyatı = başlangıç→hedef arasındaki adımların toplamı. */
let STEP_PRICE = {}, RANK_VALUE = {}, NET_WIN_PRICE = {}, SETTINGS = {price_mult:1.25,placement_factor:0.5,
  extras:{duo:2.0,stream:1.0,offline:1.0,agent:1.0,no5q:1.0,soloq:1.0}};

/* Uygulama durumu */
let me=null, records=[], finance={}, tracker={}, people=[], invites=[], formImage=null, editId=null;
const isAdmin=()=> me && me.role==='admin';

/* Yardımcılar */
function esc(s){return (s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setSync(s,t){const el=document.getElementById('syncStatus');el.className='sync-pill'+(s==='ok'?' ok':s==='err'?' err':'');el.textContent=t;}
