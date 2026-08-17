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
/* Ekip listesi. Tasarımdaki doluluk çubuğu buradaki asıl bilgi: kimin
   müsait olduğunu bilmeden atama yapmak, dolu boostçuya beşinci işi vermek
   demek. Kapasite profiles.capacity'den (shared/migrations/003); girilmemişse
   "sınırsız" sayılıyor ve çubuk çizilmiyor — uydurma bir tavan koymuyoruz.

   Sayılar sipariş listesinden türetiliyor, ayrı bir yerde tutulmuyor: iki
   kaynak olsaydı biri güncellenip diğeri eski kalırdı. */
function boosterOzeti(p){
  const hepsi  = records.filter(r => r.boosterId === p.id && !r.archived);
  const acik   = hepsi.filter(isOpen);
  const gecen  = acik.filter(isGec).length;
  const kazanc = hepsi.filter(r => r.paid).reduce((s,r) => s + r.payout, 0);
  const borc   = hepsi.filter(r => !isOpen(r) && !r.paid).reduce((s,r) => s + r.payout, 0);
  const kap    = Number(p.capacity) || 0;
  const oyunlar = [...new Set(hepsi.map(r => r.game))];
  return {
    hepsi, acik:acik.length, gecen, kazanc, borc, kap, oyunlar,
    bitti: hepsi.length - acik.length,
    dolu: kap > 0 && acik.length >= kap,
    hal: !p.active ? 'pasif' : acik.length ? 'meşgul' : 'müsait',
  };
}

function renderBoosters(){
  const el = document.getElementById('boosterList');
  el.innerHTML = `<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Kayıtlı kişiler</div>`
    + people.map(p => {
      const o = boosterOzeti(p);
      const kisisel = [
        p.full_name  ? `<span class="chip">👤 ${esc(p.full_name)}</span>` : '',
        p.phone      ? `<span class="chip">📞 ${esc(p.phone)} <b style="cursor:pointer" data-v="${esc(p.phone)}" onclick="copyText(this)">📋</b></span>` : '',
        p.discord    ? `<span class="chip">💬 ${esc(p.discord)}</span>` : '',
        p.iban       ? `<span class="chip">🏦 ${esc(p.iban)} <b style="cursor:pointer" data-v="${esc(p.iban)}" onclick="copyText(this)">📋</b></span>` : '',
        p.crypto_addr? `<span class="chip">🪙 ${esc(p.crypto_addr)} <b style="cursor:pointer" data-v="${esc(p.crypto_addr)}" onclick="copyText(this)">📋</b></span>` : '',
      ].filter(Boolean).join('');

      const kutu = (etiket, deger, sinif) =>
        `<div class="bs-cell"><span class="bs-l">${esc(etiket)}</span>
           <span class="bs-v ${sinif||''}">${esc(deger)}</span></div>`;

      return `<div class="rec">
        <div class="rec-top"><div>
          <div class="rec-route">${esc(p.display_name)}
            <span class="role-chip ${p.role==='admin'?'':'booster'}" style="margin-left:8px">${p.role==='admin'?'Admin':'Booster'}</span></div>
          <div class="rec-meta" style="margin-top:7px">
            <span class="chip bs-${o.hal==='pasif'?'off':o.hal==='meşgul'?'busy':'free'}">${o.hal}</span>
            ${o.oyunlar.map(g => `<span class="chip game">${esc(gameOf(g).short)}</span>`).join('')}
          </div>
        </div></div>

        ${o.kap ? `<div class="bs-load">
          <div class="bs-load-top"><span>doluluk</span><b>${o.acik} / ${o.kap} iş</b></div>
          <div class="bs-load-bar"><span class="${o.dolu?'full':''}"
            style="width:${Math.min(100, Math.round(o.acik/o.kap*100))}%"></span></div>
        </div>` : `<div class="bs-load"><div class="bs-load-top">
          <span>doluluk</span><b class="dim">kapasite girilmemiş · ${o.acik} açık iş</b></div></div>`}

        <div class="bs-grid">
          ${kutu('tamamladığı', String(o.bitti))}
          ${kutu('geciken', o.gecen ? `${o.gecen} iş` : '—', o.gecen ? 'red' : '')}
          ${kutu('kazandığı', fmt(o.kazanc,'TRY'))}
          ${kutu('borç', fmt(o.borc,'TRY'), o.borc ? 'red' : 'green')}
        </div>

        <div class="rec-meta" style="margin-top:11px">${kisisel
          || '<span class="chip" style="color:var(--muted)">kişisel bilgi girilmemiş</span>'}</div>

        <div class="rec-actions">
          <button class="icon-btn" onclick="setKapasite('${esc(p.id)}')">⚖ Kapasite</button>
          <button class="icon-btn ${p.active?'del':'go'}" onclick="toggleActive('${esc(p.id)}',${!p.active})">${p.active?'Pasifleştir':'Aktifleştir'}</button>
        </div></div>`;
    }).join('');
}

/* Kapasite: aynı anda kaç açık iş alabilir. Boş bırakmak "sınırsız" demek. */
async function setKapasite(id){
  const p = people.find(x => x.id === id); if(!p) return;
  const cvp = prompt(`${p.display_name} aynı anda kaç iş alabilir?\n(boş bırak = sınırsız)`,
                     p.capacity || '');
  if(cvp === null) return;
  const v = cvp.trim() === '' ? null : Number(cvp);
  if(v !== null && (!isFinite(v) || v < 1)){ alert('Pozitif bir sayı gir ya da boş bırak.'); return; }
  const { error } = await sb.from('profiles').update({ capacity:v }).eq('id', id);
  if(error){ alert('Kaydedilemedi: ' + error.message); return; }
  await loadAll();
  toast(v === null ? `${p.display_name} · kapasite sınırsız` : `${p.display_name} · kapasite ${v} iş`);
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
