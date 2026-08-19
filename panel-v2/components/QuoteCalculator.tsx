'use client';

import { useMemo, useState } from 'react';
import { EXTRAS, G, REGIONS, type GameKey } from '@/lib/domain';
import { payoutFromTables, quote, type PricingTables } from '@/lib/pricing';
import { TL } from '@/lib/format';
import { C, FONT_DISPLAY, cardStyle, headingBar, inputStyle, label11, panelHeading } from '@/lib/ui';

/** Booster fee + target margin, grossed up for the marketplace cut. */
export function QuoteCalculator({
  game, pricing, rate,
}: {
  game: GameKey;
  pricing: PricingTables;
  rate: number;
}) {
  const ladder = G(game).ladder;
  const [from, setFrom] = useState(ladder[Math.floor(ladder.length * 0.3)]);
  const [to, setTo] = useState(ladder[Math.floor(ladder.length * 0.55)]);
  const [region, setRegion] = useState('TR');
  const [startRR, setStartRR] = useState('40');
  const [extras, setExtras] = useState<string[]>(['Duo Boost']);
  const [marginPct, setMarginPct] = useState('45');
  const [marketFeePct, setMarketFeePct] = useState('10');

  const q = useMemo(() => {
    const fee = payoutFromTables(
      { game, type: 'rank', from, to, count: 0, startRR, region, extras },
      pricing,
    );
    return quote(fee, {
      marginPct: Number(marginPct) || 0,
      marketFeePct: Number(marketFeePct) || 0,
      rate,
    });
  }, [game, from, to, startRR, region, extras, marginPct, marketFeePct, pricing, rate]);

  return (
    <div style={cardStyle}>
      <div style={{ ...panelHeading, marginBottom: 6 }}>
        <span style={headingBar(C.blue)} />Quick Quote
      </div>
      <p style={{ fontSize: 12, color: C.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
        Use it when quoting a customer — booster fee + target profit margin.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={label11}>From</label>
          <select value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle}>
            {ladder.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={label11}>To</label>
          <select value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle}>
            {ladder.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div>
          <label style={label11}>Region</label>
          <select value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle}>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={label11}>Starting RR</label>
          <input type="number" value={startRR} onChange={(e) => setStartRR(e.target.value)} style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div>
          <label style={label11}>Target margin %</label>
          <input type="number" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={label11}>Marketplace fee %</label>
          <input type="number" value={marketFeePct} onChange={(e) => setMarketFeePct(e.target.value)} style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 14 }}>
        {EXTRAS.map(([label, mult]) => {
          const on = extras.includes(label);
          return (
            <button
              key={label}
              onClick={() => setExtras((s) => (on ? s.filter((x) => x !== label) : [...s, label]))}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 20,
                padding: '6px 13px', fontSize: 12, cursor: 'pointer',
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

      <div style={{
        background: C.surface1, border: '1px solid rgba(212,175,55,.35)',
        borderRadius: 11, padding: 15, marginTop: 16,
      }}>
        <Line label="booster fee" value={TL(q.boosterFee)} color={C.text} />
        <Line label={`target margin %${q.marginPct}`} value={`+${TL(q.margin)}`} color={C.blue} />
        <Line label={`marketplace fee %${q.marketFeePct}`} value={`+${TL(q.marketFee)}`} color={C.amber} />
        <div style={{
          display: 'flex', justifyContent: 'space-between', fontSize: 13,
          padding: '8px 0 3px', marginTop: 6, borderTop: `1px solid ${C.border}`, color: C.muted,
        }}>
          <span>price to list</span>
          <b style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: C.gold }}>
            ${q.listed.toLocaleString('en-US')}
          </b>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
          {TL(q.totalTL)} at {rate} ₺/$
        </div>
      </div>
    </div>
  );
}

function Line({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: C.muted }}>
      <span>{label}</span>
      <b style={{ fontFamily: FONT_DISPLAY, fontSize: 15, color }}>{value}</b>
    </div>
  );
}
