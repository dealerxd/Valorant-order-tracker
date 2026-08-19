import { redirect } from 'next/navigation';
import { GameFilter } from '@/components/GameFilter';
import { loadPanel } from '@/lib/orders';
import { GAMES, GAME_KEYS, type GameKey } from '@/lib/domain';
import { TL } from '@/lib/format';
import { C, FONT_DISPLAY, cardStyle, chip, fillStyle, trackStyle } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function BoostersPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const data = await loadPanel();
  if (!data) redirect('/login');

  const { game } = await searchParams;
  const lens = game && game !== 'all' ? (game as GameKey) : null;

  const gameCounts: Record<string, number> = { all: data.orders.length };
  GAME_KEYS.forEach((k) => { gameCounts[k] = data.orders.filter((o) => o.game === k).length; });

  const boosters = lens ? data.boosters.filter((b) => b.games.includes(lens)) : data.boosters;

  return (
    <>
      <GameFilter counts={gameCounts} />
      <div className="page-pad">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16 }}>
          {boosters.length === 0 && (
            <div style={{ color: C.muted, fontSize: 13 }}>No boosters for this filter.</div>
          )}

          {boosters.map((b) => {
            const atCap = b.active >= b.cap;
            const statusChip = b.active > 0
              ? chip(C.blue, '90,157,237')
              : b.on
                ? chip(C.green, '62,207,142')
                : chip(C.muted, '139,139,149');

            return (
              <div key={b.id} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', background: C.surface1,
                    border: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontFamily: FONT_DISPLAY, fontSize: 16, color: C.text2,
                    flexShrink: 0,
                  }}>
                    {b.initial}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 600, letterSpacing: '.4px' }}>
                      {b.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
                      {b.games.map((k) => (
                        <span key={k} style={{
                          display: 'inline-flex', alignItems: 'center', border: `1px solid ${GAMES[k].color}55`,
                          borderRadius: 6, padding: '2px 6px', fontFamily: FONT_DISPLAY, fontSize: 10,
                          letterSpacing: '.6px', color: GAMES[k].color,
                        }}>
                          {GAMES[k].short}
                        </span>
                      ))}
                      <span style={{ fontSize: 11.5, color: C.muted }}>{b.rankRange}</span>
                    </div>
                  </div>

                  <span style={{ ...statusChip, marginLeft: 'auto' }}>
                    {b.active > 0 ? 'busy' : b.on ? 'available' : 'inactive'}
                  </span>
                </div>

                <div style={{ marginTop: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: C.muted, marginBottom: 6 }}>
                    <span>workload</span>
                    <span>{b.active} / {b.cap} jobs</span>
                  </div>
                  <div style={trackStyle(8)}>
                    <div style={fillStyle(
                      Math.min(100, Math.round(b.active / Math.max(1, b.cap) * 100)),
                      atCap ? C.red : b.active > 0 ? 'linear-gradient(90deg,#5a9ded,#d4af37)' : C.border2,
                    )} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 18 }}>
                  <Stat label="completed" value={String(b.done)} />
                  <Stat label="avg. time" value={b.avg} />
                  <Stat label="late" value={b.late ? `${b.late} jobs` : '—'} color={b.late ? C.red : C.text} />
                </div>

                {data.isAdmin && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}`,
                  }}>
                    <div>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>earned</div>
                      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, color: C.gold, marginTop: 2 }}>{TL(b.earned)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>unpaid</div>
                      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, marginTop: 2, color: b.debt ? C.red : C.green }}>
                        {TL(b.debt)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, color = C.text }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, marginTop: 3, color }}>{value}</div>
    </div>
  );
}
