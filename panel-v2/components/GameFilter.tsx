'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { GAMES, GAME_KEYS } from '@/lib/domain';
import { C, FONT_DISPLAY } from '@/lib/ui';

/** Horizontally scrolling game chips. The selection is URL state so the
    Overview and Orders views stay linkable. */
export function GameFilter({ counts }: { counts: Record<string, number> }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get('game') || 'all';

  const tabs = [
    { k: 'all', label: 'All games', color: C.text2 },
    ...GAME_KEYS.map((k) => ({ k, label: GAMES[k].label, color: GAMES[k].color })),
  ];

  const href = (k: string) => {
    const next = new URLSearchParams(params.toString());
    if (k === 'all') next.delete('game'); else next.set('game', k);
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <div className="game-row scroll-x">
      {tabs.map((t) => {
        const on = current === t.k;
        return (
          <Link
            key={t.k}
            href={href(t.k)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 10,
              padding: '9px 14px', fontSize: 12.5, whiteSpace: 'nowrap', flex: '0 0 auto',
              ...(on
                ? { border: `1px solid ${t.color}66`, background: `${t.color}1a`, color: t.color }
                : { border: `1px solid ${C.border}`, background: C.surface0, color: C.muted }),
            }}
          >
            {t.label}
            <span style={{ opacity: .6, fontFamily: FONT_DISPLAY }}>{counts[t.k] ?? 0}</span>
          </Link>
        );
      })}
    </div>
  );
}
