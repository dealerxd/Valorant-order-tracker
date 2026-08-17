'use client';

import { useState, useTransition } from 'react';
import { Check, Clipboard } from 'lucide-react';
import { payBoosters } from '@/lib/actions';
import { TL } from '@/lib/format';
import { C, FONT_DISPLAY, goldButton } from '@/lib/ui';
import { Toast } from './Toast';

export interface PayRow {
  /** Booster id, or `v:<vendor name>` for an outsourced seller. */
  key: string;
  kind: 'booster' | 'vendor';
  name: string;
  jobs: number;
  method: string;
  accountLabel: string;
  account: string;
  unpaid: number;
  periodTotal: number;
  /** Order ids this vendor row settles. Empty for booster rows. */
  orderIds: string[];
}

export function PaymentsView({
  rows, period, summary, partnerShare,
}: {
  rows: PayRow[];
  period: { start: string; end: string };
  summary: { accrued: number; paid: number; outstanding: number };
  /** TZX's accrued cut for the period. Reporting only — see the note below. */
  partnerShare: number;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const total = rows.filter((r) => selected.includes(r.key)).reduce((a, r) => a + r.unpaid, 0);

  const copy = async (row: PayRow) => {
    try {
      await navigator.clipboard.writeText(row.account);
      setCopied(row.key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError('Clipboard is blocked in this browser');
    }
  };

  const pay = () => {
    const picked = rows.filter((r) => selected.includes(r.key));
    if (!picked.length) return;

    const boosterIds = picked.filter((r) => r.kind === 'booster').map((r) => r.key);
    const vendorOrderIds = picked.filter((r) => r.kind === 'vendor').flatMap((r) => r.orderIds);

    start(async () => {
      const res = await payBoosters(boosterIds, vendorOrderIds, period);
      if (!res.ok) setError(res.error ?? 'Payout failed');
      else setSelected([]);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>selected total</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: C.gold }}>{TL(total)}</div>
        </div>
        <button
          onClick={pay}
          disabled={pending || !selected.length}
          style={{ ...goldButton, padding: '11px 18px' }}
        >
          {pending ? 'Paying…' : 'Pay Selected'}
        </button>
      </div>

      <div style={{
        background: 'linear-gradient(170deg,#121214,#16161a)',
        border: `1px solid ${C.border}`, borderRadius: 14, padding: '8px 0',
      }}>
        {rows.length === 0 && (
          <div style={{ padding: 20, color: C.muted, fontSize: 13 }}>Nothing outstanding for this period.</div>
        )}

        {rows.map((r) => {
          const on = selected.includes(r.key);
          return (
            <div
              key={r.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                padding: '16px 18px', borderBottom: `1px solid ${C.border}`,
                background: on
                  ? 'rgba(212,175,55,.05)'
                  : r.kind === 'vendor' ? 'rgba(199,204,212,.03)' : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => setSelected((s) => (on ? s.filter((x) => x !== r.key) : [...s, r.key]))}
                aria-label={`Select ${r.name}`}
                style={{ accentColor: C.gold, width: 16, height: 16, flexShrink: 0 }}
              />

              <div style={{ minWidth: 150, flex: '1 1 160px' }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{r.jobs} jobs · {r.method}</div>
              </div>

              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
                  {r.accountLabel}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{
                    fontFamily: 'ui-monospace,monospace', fontSize: 12, color: C.text2,
                    background: C.surface0, border: `1px solid ${C.border}`, borderRadius: 7,
                    padding: '5px 9px', whiteSpace: 'nowrap', overflow: 'hidden',
                    textOverflow: 'ellipsis', maxWidth: 230,
                  }}>
                    {r.account}
                  </code>
                  <button
                    onClick={() => copy(r)}
                    aria-label={`Copy ${r.accountLabel}`}
                    className="hover-gold"
                    style={{
                      background: 'transparent', border: `1px solid ${C.border2}`, borderRadius: 7,
                      color: copied === r.key ? C.green : C.muted, padding: '5px 9px', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center',
                    }}
                  >
                    {copied === r.key ? <Check size={12} /> : <Clipboard size={12} />}
                  </button>
                </div>
              </div>

              <div style={{ textAlign: 'right', minWidth: 110 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, color: C.red }}>{TL(r.unpaid)}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>this period {TL(r.periodTotal)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        background: C.surface1, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '16px 18px', display: 'flex', gap: 26, flexWrap: 'wrap',
      }}>
        <Summary label="period accrued" value={TL(summary.accrued)} />
        <Summary label="paid" value={TL(summary.paid)} color={C.green} />
        <Summary label="outstanding" value={TL(summary.outstanding)} color={C.red} />
        {partnerShare !== 0 && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>
              TZX share (accrued)
            </div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, marginTop: 3, color: C.blue }}>
              {TL(partnerShare)}
            </div>
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>
              50% of Eldorado profit · not settled here yet
            </div>
          </div>
        )}
      </div>

      <Toast message={error} onClose={() => setError('')} />
    </div>
  );
}

function Summary({ label, value, color = C.text }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, marginTop: 3, color }}>{value}</div>
    </div>
  );
}
