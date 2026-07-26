/* ============ VERİ (Supabase okuma + finans yardımcıları) ============ */
function rowToRec(r){
  return {id:r.id,orderType:r.order_type||'rank',baslangic:r.baslangic||'',hedef:r.hedef||'',
    winCount:Number(r.win_count)||0,jobDesc:r.job_desc||'',
    startRR:r.start_rr||0,region:r.region||'TR',
    duo:!!r.duo,express:!!r.express,durum:r.durum||'yeni',tarih:r.tarih||'',not:r.note||'',image:r.image||null,
    boosterId:r.booster_id||null,payout:Number(r.booster_payout)||0,paid:!!r.paid,
    archived:!!r.archived,created:r.created_at||''};
}
async function loadAll(){
  if(!me) return;
  setSync('','● yükleniyor…');
  const [rRes,pRes,fRes,iRes]=await Promise.all([
    sb.from('resells').select('*').order('created_at',{ascending:false}),
    sb.from('profiles').select('*').order('display_name'),
    isAdmin()?sb.from('order_finance').select('*'):Promise.resolve({data:[]}),
    isAdmin()?sb.from('invites').select('*').order('created_at',{ascending:false}):Promise.resolve({data:[]})
  ]);
  if(rRes.error){ setSync('err','● hata'); alert('Veri çekilemedi: '+rRes.error.message); return; }
  records=(rRes.data||[]).map(rowToRec);
  people=pRes.data||[];
  invites=iRes.data||[];
  finance={}; (fRes.data||[]).forEach(f=>finance[f.order_id]={
    platform:f.platform||'', platformRef:f.platform_ref||'',
    cost:Number(f.cost)||0, costCur:f.cost_currency||'USD', feePct:Number(f.fee_pct)||0,
    costTL:Number(f.cost_tl)||0, rate:Number(f.rate)||0 });
  setSync('ok','● bağlı · canlı');
  fillBoosterSelects(); render();
  if(isAdmin()){ renderBoosters(); renderInvites(); }
}
const F=id=>finance[id]||{platform:'',platformRef:'',cost:0,costCur:'USD',feePct:0,costTL:0};
/* costTL = brüt GELİR TL (boost fiyatı × kur, sipariş anında sabit) */
const brutTLof=id=>F(id).costTL;
const netGelirTLof=id=>{const f=F(id);return Math.round(f.costTL*(1-f.feePct/100));};
const komTLof=id=>{const f=F(id);return Math.round(f.costTL*f.feePct/100);};
function subscribeRealtime(){ try{ sb.channel('rt').on('postgres_changes',{event:'*',schema:'public',table:'resells'},()=>loadAll()).subscribe(); }catch(e){} }
