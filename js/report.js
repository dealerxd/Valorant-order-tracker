/* ============ RAPOR ============ */
function clearReportDates(){document.getElementById('repFrom').value='';document.getElementById('repTo').value='';renderReport();}
function renderReport(){
  if(!isAdmin())return;
  const from=document.getElementById('repFrom').value, to=document.getElementById('repTo').value;
  const inRange=r=>(!from||r.tarih>=from)&&(!to||r.tarih<=to)&&!r.archived;
  const rows=records.filter(inRange);
  const brut=rows.reduce((s,r)=>s+brutTLof(r.id),0);
  const kom=rows.reduce((s,r)=>s+komTLof(r.id),0);
  const netGelir=rows.reduce((s,r)=>s+netGelirTLof(r.id),0);
  const boosterPay=rows.reduce((s,r)=>s+r.payout,0);
  const odenen=rows.filter(r=>r.paid).reduce((s,r)=>s+r.payout,0);
  const kar=netGelir-boosterPay;
  let html=`<div class="stats" style="grid-template-columns:repeat(3,1fr);margin-bottom:22px">
    <div class="stat gold"><div class="label">Brüt Gelir (TL)</div><div class="value" style="font-size:19px">${fmt(brut,'TRY')}</div></div>
    <div class="stat amber"><div class="label">Panel Komisyonu (TL)</div><div class="value" style="font-size:19px">−${fmt(kom,'TRY')}</div></div>
    <div class="stat blue"><div class="label">Net Gelir (TL)</div><div class="value" style="font-size:19px">${fmt(netGelir,'TRY')}</div></div>
    <div class="stat"><div class="label">Booster Ödemesi</div><div class="value" style="font-size:19px">${fmt(boosterPay,'TRY')} <small>(${odenen.toLocaleString('tr-TR')} ödendi)</small></div></div>
    <div class="stat green"><div class="label">NET KÂR</div><div class="value" style="font-size:22px">${fmt(kar,'TRY')}</div></div>
  </div>`;
  const byB={};
  rows.forEach(r=>{ if(!r.boosterId)return; byB[r.boosterId]=byB[r.boosterId]||{is:0,hak:0,odendi:0}; const b=byB[r.boosterId]; b.is++; b.hak+=r.payout; if(r.paid)b.odendi+=r.payout; });
  html+=`<h3 style="font-family:Oswald;letter-spacing:1px;text-transform:uppercase;color:var(--silver);margin-bottom:12px">Booster Başına</h3>
    <table><thead><tr><th>Booster</th><th class="r">İş</th><th class="r">Hak Ettiği</th><th class="r">Ödenen</th><th class="r">Kalan</th></tr></thead><tbody>`;
  const keys=Object.keys(byB);
  if(!keys.length) html+=`<tr><td colspan="5" style="color:var(--muted)">Bu dönemde booster işi yok.</td></tr>`;
  else keys.forEach(id=>{const b=byB[id];html+=`<tr><td>${esc(nameOf(id))}</td><td class="r">${b.is}</td>
    <td class="r fiyat">${b.hak.toLocaleString('tr-TR')}</td><td class="r">${b.odendi.toLocaleString('tr-TR')}</td>
    <td class="r" style="color:${b.hak-b.odendi>0?'var(--red)':'var(--green)'}">${(b.hak-b.odendi).toLocaleString('tr-TR')}</td></tr>`;});
  html+=`</tbody></table>`;
  document.getElementById('reportBody').innerHTML=html;
}
