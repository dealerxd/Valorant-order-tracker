/* ============ VERİ (Supabase okuma + finans yardımcıları) ============ */
function rowToRec(r){
  return {id:r.id,game:r.game||DEFAULT_GAME,orderType:r.order_type||'rank',baslangic:r.baslangic||'',hedef:r.hedef||'',
    winCount:Number(r.win_count)||0,jobDesc:r.job_desc||'',
    startRR:r.start_rr||0,region:r.region||'TR',riotId:r.riot_id||'',
    extras:Array.isArray(r.extras)?r.extras:[],
    extraWin:!!r.extra_win,
    durum:r.durum||'yeni',tarih:r.tarih||'',not:r.note||'',image:r.image||null,
    boosterId:r.booster_id||null,payout:Number(r.booster_payout)||0,paid:!!r.paid,
    archived:!!r.archived,created:r.created_at||''};
}
/* Kusak sayaci: iki loadAll ust uste calisirsa gec donen BAYAT olan ekrani
   ezebiliyordu (toplu islem + realtime ayni anda tetikliyor). Yalnizca en son
   baslatilan yukleme ekrana yaziyor. */
let loadSeq = 0;

async function loadAll(){
  if(!me) return;
  const benimSira = ++loadSeq;
  setSync('','● yükleniyor…');
  const [rRes,pRes,fRes,iRes,tRes]=await Promise.all([
    sb.from(TABLES.orders).select('*').order('created_at',{ascending:false}),
    sb.from('profiles').select('*').order('display_name'),
    isAdmin()?sb.from('order_finance').select('*'):Promise.resolve({data:[]}),
    isAdmin()?sb.from('invites').select('*').order('created_at',{ascending:false}):Promise.resolve({data:[]}),
    // Takip durumu: sipariş başına tek satır, listedeki ilerleme rozetleri buradan.
    // Maçlar burada çekilmiyor — sipariş başına yüzlerce satır olabiliyor,
    // detail.js drawer açılınca ayrıca alıyor.
    sb.from(TABLES.state).select('*')
  ]);
  if(benimSira !== loadSeq) return;        // daha yenisi baslamis, bunu yazma
  if(rRes.error){ setSync('err','● hata'); alert('Veri çekilemedi: '+rRes.error.message); return; }
  records=(rRes.data||[]).map(rowToRec);
  people=pRes.data||[];
  invites=iRes.data||[];
  // Takip verisi olmasa da panel çalışmalı: bot kapalıysa ya da RLS okumaya
  // izin vermiyorsa rozetler görünmez, sipariş yönetimi etkilenmez.
  tracker={}; (tRes.data||[]).forEach(t=>tracker[t.order_id]=t);
  finance={}; (fRes.data||[]).forEach(f=>finance[f.order_id]={
    platform:f.platform||'', platformRef:f.platform_ref||'',
    cost:Number(f.cost)||0, costCur:f.cost_currency||'USD', feePct:Number(f.fee_pct)||0,
    costTL:Number(f.cost_tl)||0, rate:Number(f.rate)||0 });
  setSync('ok','● bağlı · canlı');
  fillBoosterSelects(); render();
  if(isAdmin()){ renderBoosters(); renderInvites(); renderArchive(); }
}
const F=id=>finance[id]||{platform:'',platformRef:'',cost:0,costCur:'USD',feePct:0,costTL:0};
const hasFin=id=>!!finance[id];   // booster'ın kendi girdiği işlerde finans kaydı yoktur (admin sonradan doldurur)
/* costTL = brüt GELİR TL (boost fiyatı × kur, sipariş anında sabit) */
const brutTLof=id=>F(id).costTL;
const netGelirTLof=id=>{const f=F(id);return Math.round(f.costTL*(1-f.feePct/100));};
const komTLof=id=>{const f=F(id);return Math.round(f.costTL*f.feePct/100);};
function subscribeRealtime(){ try{ sb.channel('rt').on('postgres_changes',{event:'*',schema:'public',table:TABLES.orders},()=>loadAll()).subscribe(); }catch(e){} }
