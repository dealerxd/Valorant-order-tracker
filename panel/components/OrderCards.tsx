'use client';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { netRevenue, profit, progressLabel, routeOf, subLine, type Order } from '@/lib/model';
import { TL } from '@/lib/format';
import { C, FONT_DISPLAY, chip } from '@/lib/ui';
import { DoerChip, GameBadge, PaidChip, ProgressBar, StatusPill } from './OrderBits';

/** The card grid. Also the mobile view — below 760px the table hides and
    this takes over, hence the `forceVisible` escape hatch. */
export function OrderCards({
  orders, isAdmin, forceVisible = false,
}: {
  orders: Order[];
  isAdmin: boolean;
  forceVisible?: boolean;
}) {
  return (
    <div
      className={forceVisible ? undefined : 'only-narrow'}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}
    >
      {orders.length === 0 && (
        <div style={{ color: C.muted, fontSize: 13, padding: 8 }}>No jobs match these filters.</div>
      )}

      {orders.map((o) => {
        const k = profit(o);
        return (
          <div
            key={o.id}
            style={{
              background: 'linear-gradient(170deg,#121214,#16161a)',
              border: `1px solid ${o.late ? 'rgba(226,85,85,.35)' : C.border}`,
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <GameBadge game={o.game} />
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 600 }}>{routeOf(o)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>{subLine(o)}</div>
              </div>
              <StatusPill status={o.status} />
            </div>

            <div style={{ marginTop: 14 }}>
              <ProgressBar order={o} />
              <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{progressLabel(o)}</div>
            </div>

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 14 }}>
              <DoerChip order={o} />
              <span style={chip(C.text2, '199,204,212')}>
                <CalendarDays size={11} /> {o.tarih}
              </span>
              <PaidChip order={o} />
            </div>

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: 14, paddingTop: 13, borderTop: `1px solid ${C.border}`, gap: 10,
            }}>
              {isAdmin ? (
                <>
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>
                      net revenue
                    </div>
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17 }}>
                      {o.cost > 0 ? TL(netRevenue(o)) : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>
                      profit
                    </div>
                    <div style={{
                      fontFamily: FONT_DISPLAY, fontSize: 17,
                      color: o.cost > 0 ? (k < 0 ? C.red : C.green) : C.amber,
                    }}>
                      {o.cost > 0 ? TL(k) : 'no finance'}
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    your fee
                  </div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, color: C.gold }}>{TL(o.payout)}</div>
                </div>
              )}

              <Link
                href={`/orders/${o.id}`}
                scroll={false}
                className="hover-gold"
                style={{
                  background: 'transparent', border: `1px solid ${C.border2}`, borderRadius: 9,
                  color: C.text2, padding: '8px 12px', fontSize: 12, whiteSpace: 'nowrap',
                }}
              >
                Details
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
