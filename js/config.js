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

const RANK_ORDER = ["Bronze 1","Bronze 2","Bronze 3","Silver 1","Silver 2","Silver 3","Gold 1","Gold 2","Gold 3",
  "Plat 1","Plat 2","Plat 3","Diamond 1","Diamond 2","Diamond 3","Ascendant 1","Ascendant 2","Ascendant 3",
  "Immortal 1","Immortal 2","Immortal 3"];
const REGION_MULT = { "TR":1.00,"EU":1.00,"NA":1.05,"Diğer":1.10 };

const STATUS_LABEL={yeni:'Yeni',atandi:'Atandı',devam:'Devam',tamam:'Tamam',odendi:'Ödendi'};
const NEXT_STATUS={yeni:'atandi',atandi:'devam',devam:'tamam',tamam:'odendi',odendi:'yeni'};

/* Fiyat verisi (DB'den yüklenir) */
let RANK_VALUE = {}, NET_WIN_PRICE = {}, SETTINGS = {price_mult:1.25,placement_factor:0.5,
  extras:{duo:2.0,stream:1.0,offline:1.0,agent:1.0,no5q:1.0,soloq:1.0}};

/* Uygulama durumu */
let me=null, records=[], finance={}, people=[], invites=[], formImage=null, editId=null;
const isAdmin=()=> me && me.role==='admin';

/* Yardımcılar */
function esc(s){return (s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setSync(s,t){const el=document.getElementById('syncStatus');el.className='sync-pill'+(s==='ok'?' ok':s==='err'?' err':'');el.textContent=t;}
