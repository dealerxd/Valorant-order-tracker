/* ============ SİPARİŞ DETAY DRAWER'I ============

   Sağdan açılan detay paneli. Yeni olan kısım takip bloğu: `tracker_state` ve
   `tracker_matches` tabloları panelde ilk kez gösteriliyor — o veri bugüne
   kadar sadece Telegram/Discord'a gidiyordu.

   Maçlar drawer açılınca çekiliyor, liste yüklenirken değil: `tracker_matches`
   sipariş başına yüzlerce satır olabiliyor, hepsini önden çekmek listeyi
   yavaşlatırdı. `tracker_state` ise sipariş başına tek satır, o loadAll'da
   geliyor (bkz. data.js) — liste rozetleri onu kullanıyor.
*/

let drawerId = null;

const TRACK_EMPTY = { rows: null, error: null };
let drawerMatches = TRACK_EMPTY;

function trackerOf(id){ return tracker[id] || null; }

/* Takip rozetinin listede görünen hali. */
function trackChip(r){
  const t = trackerOf(r.id);
  if(!t) return r.riotId
    ? `<span class="chip" style="color:var(--amber)">◌ takip bekliyor</span>`
    : '';
  if(t.paused) return `<span class="chip" style="color:var(--amber)">⏸ duraklatıldı</span>`;
  const pct = Math.round(eloProgress(t.start_elo, t.current_elo, t.target_elo) * 100);
  return `<span class="chip" style="border-color:rgba(62,207,142,.35);color:var(--green)">▲ %${pct}</span>`;
}

function openDetail(id){
  // Kayıt yoksa drawer'ı hiç açma: gövdesinde ÖNCEKİ siparişin parası kalır ve
  // butonları o siparişe yazar. (Silinen ya da filtre dışı bir id'ye tıklamak
  // realtime tazelemesinden sonra mümkün.)
  if(!records.some(r => r.id === id)) return;
  drawerId = id;
  drawerMatches = TRACK_EMPTY;
  renderDetail();
  document.getElementById('drawer').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  loadDrawerMatches(id);
}

function closeDetail(){
  drawerId = null;
  document.getElementById('drawer').classList.add('hidden');
  document.body.style.overflow = '';
}

async function loadDrawerMatches(id){
  const { data, error } = await sb.from(TABLES.matches)
    .select('match_id,played_at,rr_change,elo,tier_id,map_name,refunded_rr,derank_protected')
    .eq('order_id', id).order('played_at', { ascending:false }).limit(40);
  if(drawerId !== id) return;                    // kullanıcı bu arada kapattı
  drawerMatches = error ? { rows:null, error:error.message } : { rows:data||[], error:null };
  renderDetail();
}

/* Maç rozeti: kazanç yeşil, kayıp kırmızı, beraberlik gri. */
function matchChip(m){
  const rr = Number(m.rr_change) || 0;
  const color = rr > 0 ? 'var(--green)' : rr < 0 ? 'var(--red)' : 'var(--muted)';
  const sign = rr > 0 ? '+' : '';
  const flags = [];
  if(m.refunded_rr) flags.push(`iade ${m.refunded_rr} RR`);
  if(m.derank_protected) flags.push('düşme koruması');
  const title = [m.map_name || 'harita ?', m.played_at ? new Date(m.played_at).toLocaleString('tr-TR') : '',
                 ...flags].filter(Boolean).join(' · ');
  return `<span class="match-chip" style="color:${color};border-color:${color}33" title="${esc(title)}">${sign}${rr}</span>`;
}

function trackerBlock(r){
  const t = trackerOf(r.id);
  if(!t){
    return `<div class="d-box"><div class="d-box-h">Takip</div>
      <div class="d-empty">${r.riotId
        ? `Riot ID girilmiş (<b>${esc(r.riotId)}</b>) ama bot henüz bağlamadı.
           Bir sonraki turda kendiliğinden bağlanır.`
        : `Bu sipariş takip edilmiyor. Panelde <b>Riot ID</b> alanını doldurursan
           bot kendiliğinden bağlar.`}</div></div>`;
  }

  const ratio = eloProgress(t.start_elo, t.current_elo, t.target_elo);
  const from = rankFromElo(t.start_elo), now = rankFromElo(t.current_elo), to = rankFromElo(t.target_elo);
  const kalan = Math.max(0, t.target_elo - t.current_elo);
  const m = drawerMatches;

  let matchLine;
  if(m.error)      matchLine = `<div class="d-empty">Maçlar okunamadı: ${esc(m.error)}</div>`;
  else if(!m.rows) matchLine = `<div class="d-empty">maçlar yükleniyor…</div>`;
  else if(!m.rows.length) matchLine = `<div class="d-empty">Henüz maç kaydı yok.</div>`;
  else {
    const won = m.rows.filter(x=>Number(x.rr_change)>0).length;
    const lost = m.rows.filter(x=>Number(x.rr_change)<0).length;
    const net = m.rows.reduce((s,x)=>s+(Number(x.rr_change)||0),0);
    matchLine = `<div class="d-sub" style="margin:12px 0 7px">son ${m.rows.length} maç ·
        <b style="color:var(--green)">${won}G</b> / <b style="color:var(--red)">${lost}M</b> ·
        net <b style="color:${net>=0?'var(--green)':'var(--red)'}">${net>0?'+':''}${net} RR</b></div>
      <div class="match-row">${m.rows.map(matchChip).join('')}</div>`;
  }

  return `<div class="d-box">
    <div class="d-box-h">Takip
      <span style="margin-left:auto">${t.paused
        ? `<span class="chip" style="color:var(--amber)">⏸ duraklatıldı</span>`
        : `<span class="chip" style="border-color:rgba(62,207,142,.35);color:var(--green)">● canlı</span>`}</span>
    </div>
    <div class="d-prog">
      <span class="d-rank">${esc(from ? from.label : '?')}</span>
      <div class="d-bar"><div class="d-fill" style="width:${(ratio*100).toFixed(1)}%"></div></div>
      <span class="d-rank gold">${esc(to ? to.label : '?')}</span>
    </div>
    <div class="d-sub" style="margin-top:9px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <span>şu an <b style="color:var(--text)">${esc(now ? now.label : '?')}</b>${now ? ` · ${now.rr} RR` : ''}</span>
      <span>%${Math.round(ratio*100)} · hedefe ${kalan} RR</span>
    </div>
    ${now && !eloProgressReliable(now.tier)
      ? `<div class="d-warn">Immortal 3 üstünde sıralama leaderboard'a bağlı — yüzde yaklaşıktır.</div>` : ''}
    ${matchLine}
  </div>`;
}

function renderDetail(){
  if(!drawerId) return;
  const r = records.find(x=>x.id===drawerId);
  if(!r){ closeDetail(); return; }

  const f = F(r.id), netTL = netGelirTLof(r.id), kar = netTL - r.payout;
  const money = isAdmin() ? `<div class="d-box">
      <div class="d-box-h">Para</div>
      ${hasFin(r.id) ? `
      <div class="d-line"><span>boost fiyatı</span><b>${fmt(f.cost,f.costCur)}</b></div>
      <div class="d-line"><span>komisyon${f.feePct?` (%${f.feePct})`:''}</span><b style="color:var(--amber)">${fmt(komTLof(r.id),'TRY')}</b></div>
      <div class="d-line"><span>net gelir</span><b style="color:var(--blue)">${fmt(netTL,'TRY')}</b></div>
      <div class="d-line"><span>booster ücreti</span><b>${fmt(r.payout,'TRY')}</b></div>
      <div class="d-line total"><span>kâr</span><b style="color:var(--green)">${fmt(kar,'TRY')}</b></div>`
      : `<div class="d-empty">Finans kaydı yok — ✎ Düzenle ile boost fiyatını gir.</div>`}
    </div>` : `<div class="d-box"><div class="d-box-h">Kazancın</div>
      <div class="d-line total"><span>${r.paid?'ödendi':'ödenmedi'}</span>
        <b style="color:${r.paid?'var(--green)':'var(--amber)'}">${fmt(r.payout,'TRY')}</b></div></div>`;

  document.getElementById('drawerBody').innerHTML = `
    <div class="d-head">
      <div>
        <div class="d-route">${routeHTML(r)}</div>
        <div class="d-sub" style="margin-top:5px">${ORDER_TYPES[r.orderType]||r.orderType} · ${r.tarih}</div>
      </div>
      <button class="icon-btn" onclick="closeDetail()">✕</button>
    </div>

    <div class="rec-meta" style="margin:14px 0 18px">
      <span class="status ${r.durum}">${STATUS_LABEL[r.durum]}</span>
      ${r.riotId?`<span class="chip" style="border-color:rgba(90,157,237,.35);color:var(--blue)">🎮 ${esc(r.riotId)}</span>`:''}
      ${r.orderType==='rank'?`<span class="chip">🌍 ${esc(r.region)}</span>`:''}
      ${r.orderType==='rank'&&r.startRR?`<span class="chip">RR ${r.startRR}</span>`:''}
      ${isAdmin()&&r.boosterId?`<span class="chip booster">👤 ${esc(nameOf(r.boosterId))}</span>`:''}
      ${isAdmin()&&f.platform?`<span class="chip" style="border-color:rgba(212,175,55,.3);color:var(--gold)">🛒 ${esc(f.platform)}</span>`:''}
      ${r.archived?`<span class="chip" style="color:var(--amber)">🗄 arşiv</span>`:''}
      ${(r.extras||[]).map(k=>`<span class="chip">✚ ${esc(extraLabel(k))}</span>`).join('')}
      ${r.extraWin?`<span class="chip">➕ Extra Win</span>`:''}
    </div>

    ${trackerBlock(r)}
    ${money}
    ${r.jobDesc?`<div class="d-box"><div class="d-box-h">İş açıklaması</div><div class="d-note">${esc(r.jobDesc)}</div></div>`:''}
    ${r.not?`<div class="d-box"><div class="d-box-h">Not</div><div class="d-note">${esc(r.not)}</div></div>`:''}

    <div class="rec-actions" style="margin-top:18px">
      ${NEXT_STATUS[r.durum]?`<button class="icon-btn go" onclick="setStatus('${r.id}','${NEXT_STATUS[r.durum]}')">→ ${STATUS_LABEL[NEXT_STATUS[r.durum]]}</button>`:''}
      <button class="icon-btn" onclick="editRecord('${r.id}');closeDetail()">✎ Düzenle</button>
      ${isAdmin()&&r.payout>0?`<button class="icon-btn" onclick="togglePaid('${r.id}',${!r.paid})">${r.paid?'↺ Ödeme geri':'💰 Ödendi'}</button>`:''}
      ${isAdmin()?`<button class="icon-btn" onclick="toggleArchive('${r.id}',${!r.archived})">${r.archived?'↩ Arşivden çıkar':'🗄 Arşivle'}</button>`:''}
    </div>`;
}

/* Escape zinciri tek yerde toplandı: app.js'teki dinleyici önce drawer'a
   bakıyor. İki ayrı dinleyici olduğunda tek tuş hem drawer'ı kapatıyor hem
   arama kutusunu siliyordu. */
