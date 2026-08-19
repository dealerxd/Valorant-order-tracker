'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { createOrder, type NewOrderInput } from '@/lib/actions';
import { EXTRAS, G, GAMES, GAME_KEYS, PLATFORMS, REGIONS, type Currency, type GameKey } from '@/lib/domain';
import { parsePaste, parsedChips } from '@/lib/parse';
import { payoutFromTables, type PricingTables } from '@/lib/pricing';
import { TL } from '@/lib/format';
import { C, FONT_DISPLAY, chip, ghostButton, goldButton, inputStyle, label11, pillGroup } from '@/lib/ui';
import { Toast } from './Toast';

type FormRole = 'admin' | 'booster';

interface Draft {
  game: GameKey;
  type: 'rank' | 'netwin' | 'placement' | 'custom';
  from: string;
  to: string;
  count: string;
  region: string;
  startRR: string;
  riotId: string;
  platform: string;
  cost: string;
  cur: Currency;
  feePct: string;
  rate: string;
  boosterId: string;
  extras: string[];
  fulfil: 'internal' | 'external';
  vendor: string;
  vcost: string;
  vcur: Currency;
  vpaid: boolean;
  /** Kendi satıcı hesabımız; '' = seçilmedi. */
  accountId: string;
  /** Resell'in çıktığı hesap; '' = hesap dışı (Discord vb.). */
  resellAccountId: string;
  /** Müşterinin Discord adı; boş = eklemedik. */
  customerDiscord: string;
}

const emptyDraft = (rate: number): Draft => ({
  game: 'valorant', type: 'rank', from: 'Gold 1', to: 'Diamond 1', count: '5',
  region: 'TR', startRR: '0', riotId: '', platform: '', cost: '', cur: '$',
  feePct: '10', rate: String(rate), boosterId: '', extras: [],
  fulfil: 'internal', vendor: '', vcost: '', vcur: '$', vpaid: false,
  accountId: '', resellAccountId: '', customerDiscord: '',
});

export function NewOrderButton(props: {
  boosters: { id: string; name: string }[];
  isAdmin: boolean;
  pricing: PricingTables;
  defaultRate: number;
  accounts: { id: number; name: string; platform: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} style={goldButton}>+ New Order</button>
      {open && <NewOrderModal {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function NewOrderModal({
  boosters, isAdmin, pricing, defaultRate, accounts, onClose,
}: {
  boosters: { id: string; name: string }[];
  isAdmin: boolean;
  pricing: PricingTables;
  defaultRate: number;
  accounts: { id: number; name: string; platform: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [role, setRole] = useState<FormRole>(isAdmin ? 'admin' : 'booster');
  const [paste, setPaste] = useState('');
  const [f, setF] = useState<Draft>(() => emptyDraft(defaultRate));
  const [error, setError] = useState('');

  const asBooster = role === 'booster';
  const ext = !asBooster && f.fulfil === 'external';
  const game = G(f.game);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((d) => ({ ...d, [k]: v }));

  // Hesaplar pazaryerine bagli: Eldorado siparisine GameBoost hesabi secilemesin.
  const platformAccounts = accounts.filter((a) => a.platform === f.platform);

  const parsed = useMemo(() => parsePaste(paste), [paste]);
  const chips = useMemo(() => parsedChips(parsed), [parsed]);

  const applyParsed = () => {
    if (!parsed) return;
    setF((d) => ({
      ...d,
      ...(parsed.game ? { game: parsed.game } : null),
      ...(parsed.from ? { from: parsed.from } : null),
      ...(parsed.to ? { to: parsed.to } : null),
      ...(parsed.cost ? { cost: parsed.cost } : null),
      ...(parsed.cur ? { cur: parsed.cur } : null),
      ...(parsed.riotId ? { riotId: parsed.riotId } : null),
      ...(parsed.region ? { region: parsed.region } : null),
      ...(parsed.startRR != null ? { startRR: String(parsed.startRR) } : null),
      ...(parsed.platform ? { platform: parsed.platform } : null),
      ...(parsed.type ? { type: parsed.type } : null),
      ...(parsed.count != null ? { count: String(parsed.count) } : null),
      ...(parsed.extras?.length ? { extras: parsed.extras } : null),
    }));
  };

  // Live summary. An outsourced job costs whatever the seller charges; ours
  // costs the fee the price list computes.
  const payout = ext
    ? Math.round((Number(f.vcost) || 0) * (f.vcur === '₺' ? 1 : Number(f.rate) || 41))
    : payoutFromTables(
        { game: f.game, type: f.type, from: f.from, to: f.to, count: f.count, startRR: f.startRR, region: f.region, extras: f.extras },
        pricing,
      );
  const net = Math.round((Number(f.cost) || 0) * (1 - (Number(f.feePct) || 0) / 100) * (f.cur === '₺' ? 1 : Number(f.rate) || 0));
  const kar = net - payout;

  const save = () => {
    const input: NewOrderInput = {
      game: f.game,
      type: f.type,
      from: f.from,
      to: f.to,
      count: Number(f.count) || 0,
      region: f.region,
      startRR: Number(f.startRR) || 0,
      riotId: f.riotId,
      extras: f.extras,
      platform: asBooster ? '' : f.platform,
      cost: asBooster ? 0 : Number(f.cost) || 0,
      cur: f.cur,
      feePct: Number(f.feePct) || 0,
      rate: Number(f.rate) || 0,
      fulfil: asBooster ? 'internal' : f.fulfil,
      boosterId: f.boosterId,
      vendor: f.vendor,
      vcost: Number(f.vcost) || 0,
      vcur: f.vcur,
      vpaid: f.vpaid,
      accountId: f.accountId ? Number(f.accountId) : null,
      resellAccountId: f.resellAccountId ? Number(f.resellAccountId) : null,
      customerDiscord: f.customerDiscord,
      payout,
    };

    start(async () => {
      const res = await createOrder(input);
      if (!res.ok) { setError(res.error ?? 'Could not save the order'); return; }
      onClose();
      router.push('/orders');
    });
  };

  const tab = (on: boolean): React.CSSProperties => ({
    border: 'none', cursor: 'pointer', borderRadius: 8, padding: '8px 14px',
    fontFamily: FONT_DISPLAY, fontSize: 12.5, letterSpacing: '.5px', textTransform: 'uppercase',
    background: on ? '#1f1c14' : 'transparent', color: on ? C.gold : C.muted,
  });

  const fulfilBtn = (on: boolean): React.CSSProperties => ({
    cursor: 'pointer', borderRadius: 9, padding: '10px 14px', fontSize: 12.5,
    ...(on
      ? { border: '1px solid #b8962f', background: 'rgba(212,175,55,.1)', color: C.gold }
      : { border: `1px solid ${C.border2}`, background: C.surface0, color: C.muted }),
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90, display: 'flex',
      alignItems: 'flex-start', justifyContent: 'center', padding: '36px 18px', overflowY: 'auto',
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(6,6,8,.72)' }} aria-hidden />

      <div className="modal-panel" role="dialog" aria-modal="true" aria-label="New order">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>
              {asBooster ? 'Add Job' : 'New Order'}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              {asBooster
                ? 'The booster enters their own job — the fee comes from the price list, the admin fills in finance.'
                : 'Paste, check, save. Once the marketplace API is connected these fields fill themselves.'}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: `1px solid ${C.border2}`, borderRadius: 9, color: C.muted, padding: '7px 11px', cursor: 'pointer' }}>
            <X size={13} />
          </button>
        </div>

        {isAdmin && (
          <div style={{ ...pillGroup, marginTop: 16, width: 'fit-content' }}>
            <button onClick={() => setRole('admin')} style={tab(!asBooster)}>Admin entry</button>
            <button onClick={() => setRole('booster')} style={tab(asBooster)}>Booster entry</button>
          </div>
        )}

        {/* ---- paste parser ---- */}
        <div style={{ background: C.surface1, border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 16, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
              Paste from marketplace · autofills
            </div>
            <span style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 20, padding: '3px 9px' }}>Ctrl+V</span>
          </div>

          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'Paste the Eldorado / GameBoost order text or link here — e.g. "Gold 1 to Diamond 1, TR, Sylas#TR1, $120, duo"'}
            style={{ ...inputStyle, minHeight: 74, resize: 'vertical', padding: 12, fontSize: 13 }}
          />

          {chips.length > 0 && (
            <div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
                {chips.map((c) => (
                  <span key={c.key} style={chip(C.green, '62,207,142')}>{c.label}</span>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <button onClick={applyParsed} style={{ ...goldButton, padding: '9px 15px', fontSize: 12.5 }}>
                  Apply to fields
                </button>
                <span style={{ fontSize: 11.5, color: C.muted }}>detected fields fill the form, complete the rest</span>
              </div>
            </div>
          )}
        </div>

        {/* ---- job fields ---- */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginTop: 18 }}>
          <Field label="Game">
            <select
              value={f.game}
              onChange={(e) => {
                const key = e.target.value as GameKey;
                const L = G(key).ladder;
                setF((d) => ({ ...d, game: key, from: L[Math.floor(L.length * 0.3)], to: L[Math.floor(L.length * 0.55)] }));
              }}
              style={inputStyle}
            >
              {GAME_KEYS.map((k) => <option key={k} value={k}>{GAMES[k].label}</option>)}
            </select>
          </Field>

          <Field label="Order Type">
            <select value={f.type} onChange={(e) => set('type', e.target.value as Draft['type'])} style={inputStyle}>
              <option value="rank">Rank Boost</option>
              <option value="netwin">Net Win</option>
              <option value="placement">Placement</option>
              <option value="custom">Custom</option>
            </select>
          </Field>

          <Field label="From">
            <select value={f.from} onChange={(e) => set('from', e.target.value)} style={inputStyle}>
              {game.ladder.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>

          <Field label={f.type === 'rank' ? 'To' : f.type === 'placement' ? 'Match Count' : f.type === 'netwin' ? 'Win Count' : '—'}>
            {f.type === 'rank' ? (
              <select value={f.to} onChange={(e) => set('to', e.target.value)} style={inputStyle}>
                {game.ladder.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            ) : f.type === 'custom' ? (
              <input value="" disabled style={inputStyle} />
            ) : (
              <input type="number" value={f.count} onChange={(e) => set('count', e.target.value)} style={inputStyle} />
            )}
          </Field>

          <Field label="Region">
            <select value={f.region} onChange={(e) => set('region', e.target.value)} style={inputStyle}>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>

          <Field label="Starting RR">
            <input type="number" value={f.startRR} onChange={(e) => set('startRR', e.target.value)} style={inputStyle} />
          </Field>

          <Field label={game.idLabel}>
            <input type="text" value={f.riotId} onChange={(e) => set('riotId', e.target.value)} placeholder={game.idPh} style={inputStyle} />
          </Field>
        </div>

        <div style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 10, color: game.tracker ? C.muted : C.amber }}>
          {game.tracker
            ? 'The tracker bot polls this game match by match — enter a Riot ID and progress arrives automatically.'
            : `${game.label} has no tracker bot; the booster/seller reports progress and you update status by dragging on the Board.`}
        </div>

        {/* ---- finance (admin only) ---- */}
        {!asBooster && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 12 }}>
              <Field label="Marketplace">
                <select value={f.platform} onChange={(e) => set('platform', e.target.value)} style={inputStyle}>
                  <option value="">— select —</option>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>

              <Field label="Hesap">
                <select
                  value={f.accountId}
                  onChange={(e) => set('accountId', e.target.value)}
                  style={inputStyle}
                  disabled={!platformAccounts.length}
                >
                  <option value="">{platformAccounts.length ? '— seç —' : '— hesap yok —'}</option>
                  {platformAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>

              <Field label="Boost Price">
                <input type="number" value={f.cost} onChange={(e) => set('cost', e.target.value)} placeholder="0" style={inputStyle} />
              </Field>

              <Field label="Currency">
                <select value={f.cur} onChange={(e) => set('cur', e.target.value as Currency)} style={inputStyle}>
                  <option value="$">$ USD</option><option value="€">€ EUR</option><option value="₺">₺ TL</option>
                </select>
              </Field>

              <Field label="Fee">
                <select value={f.feePct} onChange={(e) => set('feePct', e.target.value)} style={inputStyle}>
                  <option value="0">%0</option><option value="10">%10</option><option value="45">%45</option>
                </select>
              </Field>

              <Field label="FX rate (1 unit ₺)">
                <input type="number" value={f.rate} onChange={(e) => set('rate', e.target.value)} placeholder="41" style={inputStyle} />
              </Field>

              <Field label="Müşteri Discord">
                <input
                  type="text"
                  value={f.customerDiscord}
                  onChange={(e) => set('customerDiscord', e.target.value)}
                  placeholder="eklemediysek boş"
                  style={inputStyle}
                />
              </Field>

              <Field label={ext ? 'Seller' : 'Booster'}>
                {ext ? (
                  <input type="text" value={f.vendor} onChange={(e) => set('vendor', e.target.value)} placeholder="seller name · channel" style={inputStyle} />
                ) : (
                  <select value={f.boosterId} onChange={(e) => set('boosterId', e.target.value)} style={inputStyle}>
                    <option value="">— unassigned —</option>
                    {boosters.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
              </Field>
            </div>

            <div style={{ background: C.surface1, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginTop: 12 }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: 10 }}>
                Who fulfils it?
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => set('fulfil', 'internal')} style={fulfilBtn(!ext)}>Our own booster</button>
                <button onClick={() => set('fulfil', 'external')} style={fulfilBtn(ext)}>↗ Outsourced resell (another seller)</button>
              </div>

              {ext && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginTop: 14 }}>
                    <Field label="Verildiği hesap">
                      <select
                        value={f.resellAccountId}
                        onChange={(e) => set('resellAccountId', e.target.value)}
                        style={inputStyle}
                      >
                        <option value="">— hesap dışı (Discord vb.) —</option>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Paid to seller">
                      <input type="number" value={f.vcost} onChange={(e) => set('vcost', e.target.value)} placeholder="0" style={inputStyle} />
                    </Field>
                    <Field label="Currency">
                      <select value={f.vcur} onChange={(e) => set('vcur', e.target.value as Currency)} style={inputStyle}>
                        <option value="$">$ USD</option><option value="€">€ EUR</option><option value="₺">₺ TL</option>
                      </select>
                    </Field>
                    <Field label="Payment status">
                      <button
                        onClick={() => set('vpaid', !f.vpaid)}
                        style={{
                          width: '100%', cursor: 'pointer', borderRadius: 9, padding: '11px 12px', fontSize: 13,
                          ...(f.vpaid
                            ? { border: '1px solid rgba(62,207,142,.35)', background: 'rgba(62,207,142,.1)', color: C.green }
                            : { border: '1px solid rgba(226,85,85,.35)', background: 'rgba(226,85,85,.08)', color: C.red }),
                        }}
                      >
                        {f.vpaid ? '✓ paid' : '● unpaid'}
                      </button>
                    </Field>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
                    Outsourced jobs skip the tracker bot and don&apos;t take booster capacity; their cost lands in profit and in Payments as &quot;Outsourcing&quot;.
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* ---- extras ---- */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 16 }}>
          {EXTRAS.map(([label, mult]) => {
            const on = f.extras.includes(label);
            return (
              <button
                key={label}
                onClick={() => set('extras', on ? f.extras.filter((x) => x !== label) : [...f.extras, label])}
                style={{
                  cursor: 'pointer', borderRadius: 20, padding: '7px 14px', fontSize: 12,
                  ...(on
                    ? { border: '1px solid #b8962f', color: C.gold, background: 'rgba(212,175,55,.1)' }
                    : { border: `1px solid ${C.border2}`, color: C.muted, background: C.surface0 }),
                }}
              >
                {label} <b style={{ fontSize: 11 }}>×{mult}</b>
              </button>
            );
          })}
        </div>

        {/* ---- live summary ---- */}
        <div style={{ background: C.surface1, border: '1px solid rgba(212,175,55,.3)', borderRadius: 12, padding: 15, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0', color: C.muted }}>
            <span>{ext ? 'paid to seller (TL)' : 'booster fee per price list'}</span>
            <b style={{ fontFamily: FONT_DISPLAY, fontSize: 15, color: C.text }}>{TL(payout)}</b>
          </div>
          {!asBooster && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0', color: C.muted }}>
                <span>net revenue (TL)</span>
                <b style={{ fontFamily: FONT_DISPLAY, fontSize: 15, color: C.blue }}>{net ? TL(net) : '—'}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '8px 0 3px', marginTop: 5, borderTop: `1px solid ${C.border}`, color: C.muted }}>
                <span>your profit</span>
                <b style={{ fontFamily: FONT_DISPLAY, fontSize: 17, color: !net ? C.amber : kar < 0 ? C.red : C.green }}>
                  {net ? TL(kar) : 'enter boost price'}
                </b>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <button onClick={save} disabled={pending} style={{ ...goldButton, padding: '12px 20px', fontSize: 13.5 }}>
            {pending ? 'Saving…' : asBooster ? 'Add Job' : 'Save Order'}
          </button>
          <button onClick={onClose} style={{ ...ghostButton, padding: '12px 16px' }}>Cancel</button>
          <span style={{ fontSize: 11.5, color: C.muted, marginLeft: 'auto' }}>
            When the marketplace API is connected this form fills itself — manual entry stays as backup.
          </span>
        </div>
      </div>

      <Toast message={error} onClose={() => setError('')} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={label11}>{label}</label>
      {children}
    </div>
  );
}
