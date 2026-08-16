/* ============ PROFİL (kişisel bilgiler) ============ */
function fillProfileForm(){
  if(!me) return;
  document.getElementById('pfName').value=me.full_name||'';
  document.getElementById('pfPhone').value=me.phone||'';
  document.getElementById('pfDiscord').value=me.discord||'';
  document.getElementById('pfIban').value=me.iban||'';
  document.getElementById('pfCrypto').value=me.crypto_addr||'';
  pfMsg('');
}
function pfMsg(t,ok){const el=document.getElementById('pfMsg');el.className='auth-msg'+(t?(ok?' ok':' err'):'');el.textContent=t||'';}
async function saveProfile(){
  const upd={
    full_name:document.getElementById('pfName').value.trim()||null,
    phone:document.getElementById('pfPhone').value.trim()||null,
    discord:document.getElementById('pfDiscord').value.trim()||null,
    iban:document.getElementById('pfIban').value.trim().replace(/\s+/g,' ')||null,
    crypto_addr:document.getElementById('pfCrypto').value.trim()||null
  };
  const {error}=await sb.from('profiles').update(upd).eq('id',me.id);
  if(error){ pfMsg('Kaydedilemedi: '+error.message); return; }
  Object.assign(me,upd);
  pfMsg('Kaydedildi ✓',true);
  if(isAdmin()) await loadAll();
}
function copyText(btn){
  navigator.clipboard.writeText(btn.dataset.v||'');
  const t=btn.textContent; btn.textContent='✓'; setTimeout(()=>btn.textContent=t,900);
}

/* ============ BOOSTER & DAVET ============ */
function renderInvites(){
  const el=document.getElementById('inviteList');
  const open=invites.filter(i=>!i.used_by);
  if(!open.length){ el.innerHTML=''; return; }
  el.innerHTML=`<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Kullanılmamış kodlar</div>`+
    open.map(i=>`<span class="chip" style="margin:0 6px 6px 0;font-family:ui-monospace,monospace;color:var(--gold)">${i.code}
      <span onclick="delInvite('${i.code}')" style="cursor:pointer;color:var(--muted)">✕</span></span>`).join('');
}
function renderBoosters(){
  const el=document.getElementById('boosterList');
  el.innerHTML=`<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Kayıtlı kişiler</div>`+
    people.map(p=>{
      const mine=records.filter(r=>r.boosterId===p.id&&!r.archived);
      const kazanc=mine.reduce((s,r)=>s+r.payout,0);
      const borc=mine.filter(r=>!r.paid).reduce((s,r)=>s+r.payout,0);
      const kisisel=[
        p.full_name?`<span class="chip">👤 ${esc(p.full_name)}</span>`:'',
        p.phone?`<span class="chip">📞 ${esc(p.phone)} <b style="cursor:pointer" data-v="${esc(p.phone)}" onclick="copyText(this)">📋</b></span>`:'',
        p.discord?`<span class="chip">💬 ${esc(p.discord)}</span>`:'',
        p.iban?`<span class="chip">🏦 ${esc(p.iban)} <b style="cursor:pointer" data-v="${esc(p.iban)}" onclick="copyText(this)">📋</b></span>`:'',
        p.crypto_addr?`<span class="chip">🪙 ${esc(p.crypto_addr)} <b style="cursor:pointer" data-v="${esc(p.crypto_addr)}" onclick="copyText(this)">📋</b></span>`:''
      ].filter(Boolean).join('');
      return `<div class="rec"><div class="rec-top"><div>
        <div class="rec-route">${esc(p.display_name)} <span class="role-chip ${p.role==='admin'?'':'booster'}" style="margin-left:8px">${p.role==='admin'?'Admin':'Booster'}</span></div>
        <div class="rec-meta" style="margin-top:7px">
          <span class="chip ${p.active?'paid':'unpaid'}">${p.active?'✓ aktif':'● pasif'}</span>
          <span class="chip">${mine.length} iş</span><span class="chip">kazanç ${kazanc.toLocaleString('tr-TR')} ₺</span>
          ${borc>0?`<span class="chip unpaid">borç ${borc.toLocaleString('tr-TR')} ₺</span>`:''}
        </div>
        ${kisisel?`<div class="rec-meta" style="margin-top:7px">${kisisel}</div>`:`<div class="rec-meta" style="margin-top:7px"><span class="chip" style="color:var(--muted)">kişisel bilgi girilmemiş</span></div>`}
        </div></div>
        <div class="rec-actions">
          <button class="icon-btn ${p.active?'del':'go'}" onclick="toggleActive('${p.id}',${!p.active})">${p.active?'Pasifleştir':'Aktifleştir'}</button>
        </div></div>`;
    }).join('');
}
function randCode(){ const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<6;i++)s+=a[Math.floor(Math.random()*a.length)]; return s; }
async function genInvite(){
  const code=randCode();
  const {error}=await sb.from('invites').insert({code,created_by:me.id});
  if(error){ alert('Kod üretilemedi: '+error.message); return; }
  document.getElementById('newCode').textContent=code;
  await loadAll();
}
function copyCode(){ const c=document.getElementById('newCode').textContent; if(c&&c!=='— — —'){ navigator.clipboard.writeText(c); } }
async function delInvite(code){ const {error}=await sb.from('invites').delete().eq('code',code); if(error){alert(error.message);return;} await loadAll(); }
async function toggleActive(id,val){ const {error}=await sb.from('profiles').update({active:val}).eq('id',id); if(error){alert(error.message);return;} await loadAll(); }
