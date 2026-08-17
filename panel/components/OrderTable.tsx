'use client';

import Link from 'next/link';
import { costTL, netRevenue, profit, progressLabel, routeOf, subLine, type Order } from '@/lib/model';
import { TL } from '@/lib/format';
import { C, FONT_DISPLAY } from '@/lib/ui';
import { DoerChip, GameBadge, PaidLine, ProgressBar, StatusPill } from './OrderBits';

export function OrderTable({
  orders, selected, onToggle, onToggleAll, isAdmin,
}: {
  orders: Order[];
  selected: string[];
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  isAdmin: boolean;
}) {
  const allOn = orders.length > 0 && orders.every((o) => selected.includes(o.id));

  return (
    <div className="only-wide" style={{
      background: 'linear-gradient(170deg,#121214,#16161a)',
      border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden',
    }}>
      <div className="scroll-x">
        <table className="order-table">
          <thead>
            <tr>
              <th style={{ width: 38, padding: '13px 0 13px 18px' }}>
                <input
                  type="checkbox"
                  checked={allOn}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  aria-label="Select all rows"
                />
              </th>
              <th>Job</th>
              <th>Booster</th>
              <th>Progress</th>
              <th>Status</th>
              {isAdmin && <th style={{ textAlign: 'right' }}>Net Revenue</th>}
              <th style={{ textAlign: 'right' }}>Booster</th>
              {isAdmin && <th style={{ textAlign: 'right', paddingRight: 18 }}>Profit</th>}
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 8 : 6} style={{ padding: 26, textAlign: 'center', color: C.muted, fontSize: 13 }}>
                  No jobs match these filters.
                </td>
              </tr>
            )}

            {orders.map((o) => {
              const on = selected.includes(o.id);
              const net = netRevenue(o);
              const k = profit(o);
              return (
                <tr
                  key={o.id}
                  className="row-hover"
                  style={{ background: on ? 'rgba(212,175,55,.06)' : 'transparent' }}
                >
                  <td style={{ padding: '14px 0 14px 18px' }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggle(o.id)}
                      aria-label={`Select ${routeOf(o)}`}
                    />
                  </td>

                  <td style={{ padding: 0 }}>
                    <Link
                      href={`/orders/${o.id}`}
                      scroll={false}
                      style={{ display: 'block', padding: 14, color: 'inherit' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <GameBadge game={o.game} />
                        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 600, letterSpacing: '.3px' }}>
                          {routeOf(o)}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{subLine(o)}</div>
                    </Link>
                  </td>

                  <td><DoerChip order={o} /></td>

                  <td style={{ minWidth: 150 }}>
                    <ProgressBar order={o} />
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>{progressLabel(o)}</div>
                  </td>

                  <td><StatusPill status={o.status} /></td>

                  {isAdmin && (
                    <td style={{ textAlign: 'right', fontFamily: FONT_DISPLAY, fontSize: 15, color: C.text, whiteSpace: 'nowrap' }}>
                      {o.cost > 0 ? TL(net) : '—'}
                    </td>
                  )}

                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 14, color: C.text2 }}>{TL(costTL(o))}</div>
                    <PaidLine order={o} />
                  </td>

                  {isAdmin && (
                    <td style={{
                      textAlign: 'right', paddingRight: 18, fontFamily: FONT_DISPLAY, fontSize: 15,
                      fontWeight: 600, whiteSpace: 'nowrap',
                      color: o.cost > 0 ? (k < 0 ? C.red : C.green) : C.amber,
                    }}>
                      {o.cost > 0 ? TL(k) : 'no finance'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
