import Link from 'next/link';
import { ST, STATUSES, GAMES, GAME_KEYS, type GameKey } from '@/lib/domain';
import { TL } from '@/lib/format';
import { C, FONT_DISPLAY, cardStyle, dot, fillStyle, headingBar, panelHeading, trackStyle } from '@/lib/ui';

/* The four Overview panels. All of them are pure presentation — the counts
   arrive already computed from the page. */

export function FunnelCard({ counts, total, avgDelivery }: {
  counts: Record<string, number>;
  total: number;
  avgDelivery: string;
}) {
  return (
    <div style={cardStyle}>
      <div style={panelHeading}><span style={headingBar(C.gold)} />Workflow</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {STATUSES.map((k) => {
          const c = counts[k] ?? 0;
          const pct = total ? Math.round(c / total * 100) : 0;
          return (
            <div key={k}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                <span style={{ color: C.text2 }}>{ST[k].label}</span>
                <span style={{ fontFamily: FONT_DISPLAY, color: C.muted }}>{c}</span>
              </div>
              <div style={trackStyle(7, false)}>
                <div style={fillStyle(pct, ST[k].c)} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{
        marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.muted,
      }}>
        <span>avg. delivery</span>
        <b style={{ fontFamily: FONT_DISPLAY, color: C.text, fontWeight: 600 }}>{avgDelivery}</b>
      </div>
    </div>
  );
}

export interface Alert {
  text: string;
  sub: string;
  count: number;
  color: string;
  /** Orders view, pre-filtered to whatever this alert is about. */
  href: string;
}

export function AlertsCard({ alerts }: { alerts: Alert[] }) {
  return (
    <div style={cardStyle}>
      <div style={panelHeading}><span style={headingBar(C.amber)} />Needs Attention</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {alerts.length === 0 && (
          <div style={{ fontSize: 12.5, color: C.muted }}>Everything is on track.</div>
        )}
        {alerts.map((a) => (
          <Link
            key={a.text}
            href={a.href}
            className="hover-border"
            style={{
              textAlign: 'left', background: C.surface1, border: `1px solid ${C.border}`,
              borderRadius: 11, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12,
              color: 'inherit',
            }}
          >
            <span style={dot(a.color, 8, true)} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, color: C.text }}>{a.text}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: C.muted, marginTop: 2 }}>{a.sub}</span>
            </span>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 17, color: C.text2 }}>{a.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export interface GameStat {
  key: GameKey;
  jobs: number;
  net: number;
  profit: number;
}

export function GameBreakdownCard({ stats, showFinance }: { stats: GameStat[]; showFinance: boolean }) {
  const maxNet = Math.max(1, ...stats.map((s) => s.net));

  return (
    <div style={cardStyle}>
      <div style={panelHeading}><span style={headingBar(C.text2)} />By Game</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {GAME_KEYS.map((k) => {
          const s = stats.find((x) => x.key === k) ?? { key: k, jobs: 0, net: 0, profit: 0 };
          const g = GAMES[k];
          return (
            <Link key={k} href={`/orders?game=${k}`} className="hover-fade" style={{ display: 'block', color: 'inherit' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', border: `1px solid ${g.color}55`,
                  borderRadius: 6, padding: '3px 7px', fontFamily: FONT_DISPLAY, fontSize: 10,
                  letterSpacing: '.6px', color: g.color,
                }}>
                  {g.short}
                </span>
                <span style={{ fontSize: 13, color: C.text }}>{g.label}</span>
                <span style={{ fontSize: 11.5, color: C.muted, marginLeft: 'auto' }}>{s.jobs} jobs</span>
              </span>
              <span style={{ display: 'block', ...trackStyle(7, false) }}>
                <span style={{ display: 'block', ...fillStyle(Math.round(s.net / maxNet * 100), g.color) }} />
              </span>
              {showFinance && (
                <span style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11.5, color: C.muted }}>
                  <span>net {TL(s.net)}</span>
                  <b style={{ fontFamily: FONT_DISPLAY, fontSize: 15, color: s.profit < 0 ? C.red : C.green }}>
                    {TL(s.profit)}
                  </b>
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export interface FeedEntry {
  text: string;
  time: string;
  color: string;
}

export function FeedCard({ feed }: { feed: FeedEntry[] }) {
  return (
    <div style={cardStyle}>
      <div style={panelHeading}><span style={headingBar(C.blue)} />Live Feed</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {feed.length === 0 && <div style={{ fontSize: 12.5, color: C.muted }}>No activity yet.</div>}
        {feed.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '0 0 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={dot(e.color)} />
              {i < feed.length - 1 && <span style={{ flex: 1, width: 1, background: C.border }} />}
            </div>
            <div style={{ minWidth: 0, paddingBottom: 2 }}>
              <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>{e.text}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{e.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
