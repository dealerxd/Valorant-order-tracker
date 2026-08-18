'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, CalendarDays, Gamepad2, Pencil, Trash2, Wallet, X } from 'lucide-react';
import { addNote, archive, deleteOrders, setPaid, setStatus } from '@/lib/actions';
import { G, ORDER_LABEL, ST } from '@/lib/domain';
import {
  costTL, isExternal, netRevenue, nextStatus, ownProfit, partnerOf, partnerShare,
  profit, progress, routeOf, type Order,
} from '@/lib/model';
import { TL } from '@/lib/format';
import { C, FONT_DISPLAY, chip, dot, fillStyle, ghostButton, goldButton, innerCard, label10, rowBetween } from '@/lib/ui';
import { DoerChip, GameBadge, StatusPill } from './OrderBits';
import { Toast } from './Toast';

/** Right-hand overlay. Rendered as an intercepted route over /orders, and as
    a standalone page on a direct load — `standalone` drops the backdrop and
    the close-by-navigation behaviour. */
export function OrderDrawer({
  order, isAdmin, standalone = false,
}: {
  order: Order;
  isAdmin: boolean;
  standalone?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  // Delete is irreversible, so it arms first and only fires on a second click.
  const [armed, setArmed] = useState(false);

  const close = () => (standalone ? router.push('/orders') : router.back());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const o = order;
  const g = G(o.game);
  const p = progress(o);
  const ext = isExternal(o);
  const partner = partnerOf(o);
  const next = nextStatus(o.status);
  const wins = o.matches.filter((m) => m === 'W').length;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Update failed');
    });

  const submitNote = () => {
    const text = note.trim();
    if (!text) return;
    setNote('');
    run(() => addNote(o.id, text));
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', justifyContent: 'flex-end' }}>
      <div className="overlay" onClick={close} aria-hidden />

      <div className="drawer-panel scroll-y" role="dialog" aria-modal="true" aria-label={routeOf(o)}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, letterSpacing: '.4px' }}>
              {routeOf(o)}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              {g.label} · {o.platform} · {ORDER_LABEL[o.type]} · {o.tarih}
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            style={{ background: 'transparent', border: `1px solid ${C.border2}`, borderRadius: 9, color: C.muted, padding: '7px 11px', cursor: 'pointer' }}
          >
            <X size={13} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 14 }}>
          <GameBadge game={o.game} />
          <StatusPill status={o.status} />
          <DoerChip order={o} />
          <span style={chip(C.text2, '199,204,212')}><CalendarDays size={11} /> {o.tarih}</span>
          <span style={chip(C.blue, '90,157,237')}><Gamepad2 size={11} /> {o.riotId}</span>
        </div>

        {/* ---- tracker ---- */}
        <div style={{ ...innerCard, padding: 16, marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={label10}>
              {g.tracker ? 'Tracker bot · match-by-match progress' : `${g.label} · progress reported by booster/seller`}
            </div>
            <span style={{ fontSize: 11, color: g.tracker ? C.green : C.muted }}>
              {g.tracker ? '● live' : '○ manual'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 14, color: C.text2 }}>{o.from}</span>
            <div style={{ flex: 1, height: 9, background: C.surface0, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>
              <div style={fillStyle(p, 'linear-gradient(90deg,#5a9ded,#d4af37)')} />
            </div>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 14, color: C.gold }}>
              {o.to || `${o.count} matches`}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: C.muted, marginTop: 9, gap: 10 }}>
            <span>
              now <b style={{ color: C.text, fontWeight: 600 }}>{o.current}</b>
              {g.tracker ? ` · ${o.currentRR} RR` : ''}
            </span>
            <span>
              {o.matches.length
                ? `${wins}W / ${o.matches.length - wins}L · last ${o.matches.length} matches`
                : 'no matches yet'}
            </span>
          </div>

          {o.matches.length > 0 && (
            <div style={{ display: 'flex', gap: 5, marginTop: 12, flexWrap: 'wrap' }}>
              {o.matches.map((m, i) => (
                <span
                  key={i}
                  style={{
                    width: 22, height: 22, borderRadius: 6, display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontFamily: FONT_DISPLAY, fontSize: 11,
                    background: m === 'W' ? 'rgba(62,207,142,.15)' : 'rgba(226,85,85,.15)',
                    color: m === 'W' ? C.green : C.red,
                    border: `1px solid ${m === 'W' ? 'rgba(62,207,142,.3)' : 'rgba(226,85,85,.3)'}`,
                  }}
                >
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ---- finance + order ---- */}
        <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: 12, marginTop: 14 }}>
          {isAdmin && (
            <div style={innerCard}>
              <div style={{ ...label10, marginBottom: 10 }}>Finance</div>
              <div style={rowBetween}>
                <span>boost price</span>
                <b style={{ fontFamily: FONT_DISPLAY, fontSize: 14, color: C.text }}>{o.cost > 0 ? `${o.cur}${o.cost}` : '—'}</b>
              </div>
              <div style={rowBetween}>
                <span>commission</span>
                <b style={{ fontFamily: FONT_DISPLAY, fontSize: 14, color: C.amber }}>{o.cost > 0 ? `−%${o.feePct}` : '—'}</b>
              </div>
              <div style={rowBetween}>
                <span>net revenue</span>
                <b style={{ fontFamily: FONT_DISPLAY, fontSize: 14, color: C.blue }}>{o.cost > 0 ? TL(netRevenue(o)) : '—'}</b>
              </div>
              <div style={rowBetween}>
                <span>{ext ? 'seller' : 'booster'}</span>
                <b style={{ fontFamily: FONT_DISPLAY, fontSize: 14, color: C.text2 }}>{TL(costTL(o))}</b>
              </div>
              <div style={{ ...rowBetween, padding: '8px 0 3px', marginTop: 5, borderTop: `1px solid ${C.border}` }}>
                <span>remaining profit</span>
                <b style={{ fontFamily: FONT_DISPLAY, fontSize: 16, color: o.cost > 0 ? (profit(o) < 0 ? C.red : C.green) : C.amber }}>
                  {o.cost > 0 ? TL(profit(o)) : 'no finance'}
                </b>
              </div>

              {/* Eldorado jobs are shared 50/50 with TZX; GameBoost is wholly ours. */}
              {o.cost > 0 && partner && (
                <>
                  <div style={rowBetween}>
                    <span>{partner.name} · %{partner.sharePct}</span>
                    <b style={{ fontFamily: FONT_DISPLAY, fontSize: 14, color: C.blue }}>−{TL(partnerShare(o))}</b>
                  </div>
                  <div style={{ ...rowBetween, padding: '8px 0 3px', marginTop: 5, borderTop: `1px solid ${C.border}` }}>
                    <span>yours</span>
                    <b style={{ fontFamily: FONT_DISPLAY, fontSize: 16, color: ownProfit(o) < 0 ? C.red : C.green }}>
                      {TL(ownProfit(o))}
                    </b>
                  </div>
                </>
              )}
            </div>
          )}

          <div style={innerCard}>
            <div style={{ ...label10, marginBottom: 10 }}>Order</div>
            <div style={rowBetween}>
              <span>marketplace</span>
              <span style={{ color: C.gold }}>{o.platform}{ext ? ` → ${o.vendor}` : ''}</span>
            </div>
            <div style={rowBetween}><span>region</span><span style={{ color: C.text }}>{o.region}</span></div>
            <div style={rowBetween}><span>starting RR</span><span style={{ color: C.text }}>{o.startRR} RR</span></div>
            <div style={rowBetween}>
              <span>extras</span>
              <span style={{ color: C.text, textAlign: 'right' }}>{o.extras.length ? o.extras.join(', ') : '—'}</span>
            </div>
            <div style={{ ...rowBetween, padding: '8px 0 3px', marginTop: 5, borderTop: `1px solid ${C.border}` }}>
              <span>due</span>
              <span style={{ color: o.late ? C.red : C.text }}>{o.due}</span>
            </div>
          </div>
        </div>

        {/* ---- actions ---- */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <button
            disabled={pending || !next}
            onClick={() => next && run(() => setStatus([o.id], next))}
            style={{ ...goldButton, padding: '11px 16px', opacity: next ? 1 : .5 }}
          >
            {next ? `→ ${ST[next].label}` : '✓ Done'}
          </button>

          <button disabled className="hover-gold" style={{ ...ghostButton, display: 'inline-flex', alignItems: 'center', gap: 6 }} title="Editing lands with the order edit form">
            <Pencil size={13} /> Edit
          </button>

          {isAdmin && (
            <button
              disabled={pending}
              onClick={() => run(() => setPaid([o.id], !(ext ? o.vpaid : o.paid)))}
              className="hover-gold"
              style={{ ...ghostButton, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Wallet size={13} /> {(ext ? o.vpaid : o.paid) ? 'Mark unpaid' : 'Mark paid'}
            </button>
          )}

          <button
            disabled={pending}
            onClick={() => run(async () => { const r = await archive([o.id]); if (r.ok) close(); return r; })}
            className="hover-gold"
            style={{ ...ghostButton, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Archive size={13} /> Archive
          </button>

          {/* Permanent delete, for a job opened by mistake. Offered to admins
              always, and to a booster only while the job is unpaid — the same
              rule the old panel used, and the one RLS enforces anyway. */}
          {(isAdmin || !o.paid) && (
            armed ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: C.red }}>Kalıcı olarak silinsin mi?</span>
                <button
                  disabled={pending}
                  onClick={() => run(async () => {
                    const r = await deleteOrders([o.id]);
                    if (r.ok) close(); else setArmed(false);
                    return r;
                  })}
                  style={{
                    border: '1px solid rgba(226,85,85,.5)', background: 'rgba(226,85,85,.12)',
                    color: C.red, borderRadius: 10, padding: '11px 14px', fontSize: 12.5, cursor: 'pointer',
                  }}
                >
                  Evet, sil
                </button>
                <button
                  disabled={pending}
                  onClick={() => setArmed(false)}
                  style={{ ...ghostButton, padding: '11px 14px' }}
                >
                  Vazgeç
                </button>
              </span>
            ) : (
              <button
                disabled={pending}
                onClick={() => setArmed(true)}
                style={{
                  ...ghostButton, display: 'inline-flex', alignItems: 'center', gap: 6,
                  borderColor: 'rgba(226,85,85,.35)', color: C.red,
                }}
              >
                <Trash2 size={13} /> Sil
              </button>
            )
          )}
        </div>

        {/* ---- activity ---- */}
        <div style={{ marginTop: 22 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, letterSpacing: '1px', textTransform: 'uppercase', color: C.text2, marginBottom: 14 }}>
            Activity &amp; Notes
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {o.activity.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={dot(a.k === 'warn' ? C.amber : a.k === 'note' ? C.text2 : (ST[a.k as keyof typeof ST]?.c ?? C.blue))} />
                  {i < o.activity.length - 1 && <span style={{ flex: 1, width: 1, background: C.border }} />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>{a.text}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                    {[a.who, a.time].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitNote(); } }}
              placeholder="Write a note — the booster sees it too…"
              style={{
                flex: 1, background: C.surface0, border: `1px solid ${C.border2}`, borderRadius: 10,
                color: C.text, padding: '11px 12px', fontSize: 13, outline: 'none', minWidth: 0,
              }}
            />
            <button
              onClick={submitNote}
              disabled={pending || !note.trim()}
              className="hover-gold"
              style={{ ...ghostButton, background: C.surface6, color: C.text2, whiteSpace: 'nowrap' }}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      <Toast message={error} onClose={() => setError('')} />
    </div>
  );
}
