'use client';

import { useState, useTransition } from 'react';
import { saveStepPrices } from '@/lib/actions';
import type { GameKey } from '@/lib/domain';
import { C, FONT_DISPLAY, cardStyle, goldButton, headingBar, panelHeading } from '@/lib/ui';
import { Toast } from './Toast';

export interface StepRow {
  rank: string;
  label: string;
  value: number;
}

/** Division Prices. Saving merges this game's map into the shared
    `pricing.step_prices` row — the other games are never overwritten. */
export function PriceEditor({
  game, gameLabel, rows,
}: {
  game: GameKey;
  gameLabel: string;
  rows: StepRow[];
}) {
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(rows.map((r) => [r.rank, String(r.value)])),
  );
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [saved, setSaved] = useState(false);

  const save = () => {
    const map: Record<string, number> = {};
    Object.entries(values).forEach(([rank, v]) => {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) map[rank] = Math.round(n);
    });

    start(async () => {
      const res = await saveStepPrices(game, map);
      if (!res.ok) { setMsg(res.error ?? 'Save failed'); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  return (
    <div style={cardStyle}>
      <div style={{ ...panelHeading, marginBottom: 6 }}>
        <span style={headingBar(C.gold)} />Division Prices
      </div>
      <p style={{ fontSize: 12, color: C.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
        {gameLabel} · price to climb to the next rank. Every game has its own ladder and prices — switch with the game picker above.
      </p>

      <div className="scroll-y" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520 }}>
        {rows.map((r) => (
          <div
            key={r.rank}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, background: C.surface1,
              border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px',
            }}
          >
            <span style={{ flex: 1, fontSize: 13, color: C.text2 }}>{r.label}</span>
            <input
              type="number"
              value={values[r.rank] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [r.rank]: e.target.value }))}
              aria-label={r.label}
              style={{
                width: 92, background: C.surface0, border: `1px solid ${C.border2}`, borderRadius: 7,
                color: C.gold, padding: '7px 9px', fontSize: 14, fontFamily: FONT_DISPLAY, textAlign: 'right',
              }}
            />
          </div>
        ))}
      </div>

      <button onClick={save} disabled={pending} style={{ ...goldButton, marginTop: 14 }}>
        {pending ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
      </button>

      <Toast message={msg} onClose={() => setMsg('')} />
    </div>
  );
}
