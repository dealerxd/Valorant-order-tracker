'use client';

import { useTransition } from 'react';
import { Archive, ArrowRight, Wallet } from 'lucide-react';
import { advance, archive, assign, setPaid } from '@/lib/actions';
import type { Order } from '@/lib/model';
import { C, FONT_DISPLAY } from '@/lib/ui';

/** Appears when rows are selected. Each action applies to every selected row
    in one request. */
export function BulkBar({
  selected, orders, boosters, isAdmin, onClear, onError,
}: {
  selected: string[];
  orders: Order[];
  boosters: { id: string; name: string }[];
  isAdmin: boolean;
  onClear: () => void;
  onError: (msg: string) => void;
}) {
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    start(async () => {
      const res = await fn();
      if (!res.ok) onError(res.error ?? 'Update failed');
      else onClear();
    });
  };

  const picked = orders.filter((o) => selected.includes(o.id));

  const action: React.CSSProperties = {
    background: 'transparent', border: `1px solid ${C.border2}`, borderRadius: 9,
    color: C.text2, padding: '8px 12px', fontSize: 12.5, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  };

  return (
    <div style={{
      background: '#1f1c14', border: '1px solid rgba(212,175,55,.35)', borderRadius: 12,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      opacity: pending ? .6 : 1,
    }}>
      <b style={{ fontFamily: FONT_DISPLAY, color: C.gold, fontSize: 14, letterSpacing: '.6px' }}>
        {selected.length} SELECTED
      </b>

      <select
        defaultValue=""
        disabled={pending}
        aria-label="Assign booster"
        onChange={(e) => {
          const id = e.target.value;
          e.target.value = '';
          if (id) run(() => assign(selected, id));
        }}
        style={{
          background: C.surface0, border: `1px solid ${C.border2}`, borderRadius: 9,
          color: C.text, padding: '8px 10px', fontSize: 12.5,
        }}
      >
        <option value="">Assign booster…</option>
        {boosters.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>

      <button
        disabled={pending}
        onClick={() => run(() => advance(picked.map((o) => ({ id: o.id, status: o.status }))))}
        style={{ ...action, border: '1px solid rgba(62,207,142,.35)', color: C.green }}
      >
        <ArrowRight size={13} /> Advance status
      </button>

      {isAdmin && (
        <button disabled={pending} onClick={() => run(() => setPaid(selected, true))} style={action}>
          <Wallet size={13} /> Mark paid
        </button>
      )}

      <button disabled={pending} onClick={() => run(() => archive(selected))} style={action}>
        <Archive size={13} /> Archive
      </button>

      <button
        onClick={onClear}
        style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', marginLeft: 'auto' }}
      >
        clear
      </button>
    </div>
  );
}
