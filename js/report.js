/* ============ ARŞİV ============ */
function renderArchive(){
  if(!isAdmin())return;
  const el=document.getElementById('archiveBody'); if(!el) return;
  const fp=document.getElementById('arcPanel').value;
  const rows=records.filter(r=>r.archived).filter(r=>!fp||F(r.id).platform===fp);
  if(!rows.length){ el.innerHTML=`<div class="empty"><div class="big">Arşiv boş</div>
    <div>Sipariş kartındaki "🗄 Arşivle" butonuyla biten işler buraya düşer.</div></div>`; return; }
  let brutT=0,netT=0,payT=0,karT=0;
  const body=rows.map(r=>{
    const f=F(r.id), net=netGelirTLof(r.id), kar=net-r.payout;
    brutT+=brutTLof(r.id); netT+=net; payT+=r.payout; karT+=kar;
    const link=f.platformRef
      ? (/^https?:\/\//i.test(f.platformRef)
          ? `<a href="${esc(f.platformRef)}" target="_blank" rel="noopener" style="color:var(--blue)">aç ↗</a>`
          : esc(f.platformRef))
      : '—';
    return `<tr>
      <td style="white-space:nowrap">${r.tarih}</td>
      <td>${esc(routeText(r))}</td>
      <td>${esc(f.platform||'—')}</td>
      <td>${link}</td>
      <td class="r" style="white-space:nowrap">${fmt(f.cost,f.costCur)}${f.feePct?` <small style="color:var(--muted)">−%${f.feePct}</small>`:''}</td>
      <td class="r">${fmt(net,'TRY')}</td>
      <td class="r">${r.payout.toLocaleString('tr-TR')}</td>
      <td class="r fiyat" style="color:${kar<0?'var(--red)':'var(--green)'}">${fmt(kar,'TRY')}</td>
      <td class="r" style="white-space:nowrap"><button class="icon-btn" title="Arşivden çıkar" onclick="toggleArchive('${r.id}',false)">↩</button>
        <button class="icon-btn del" title="Kalıcı sil" onclick="deleteRecord('${r.id}')">🗑</button></td>
    </tr>`;
  }).join('');
  el.innerHTML=`<table>
    <thead><tr><th>Tarih</th><th>İş</th><th>Panel</th><th>Link</th>
      <th class="r">Boost Fiyatı</th><th class="r">Net Gelir (TL)</th><th class="r">Booster (TL)</th><th class="r">Kâr (TL)</th><th></th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><th colspan="5" style="text-align:right">Toplam (${rows.length} iş)</th>
      <th class="r" style="color:var(--blue)">${fmt(netT,'TRY')}</th>
      <th class="r">${payT.toLocaleString('tr-TR')}</th>
      <th class="r" style="color:${karT<0?'var(--red)':'var(--green)'}">${fmt(karT,'TRY')}</th><th></th></tr></tfoot>
  </table>`;
}

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
