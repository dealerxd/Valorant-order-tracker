'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Diamond, Table2, Gem, Banknote, Menu } from 'lucide-react';
import { Logo } from './Logo';
import { signOut } from '@/lib/actions';
import { C, FONT_DISPLAY } from '@/lib/ui';

export interface NavBadges {
  open: number;
  boosters: number;
  debt: string;
}

const NAV = [
  { href: '/overview', label: 'Overview', Icon: Diamond, badge: null },
  { href: '/orders', label: 'Orders', Icon: Table2, badge: 'open' },
  { href: '/boosters', label: 'Boosters', Icon: Gem, badge: 'boosters' },
  { href: '/payments', label: 'Payments', Icon: Banknote, badge: 'debt' },
  { href: '/pricing', label: 'Pricing', Icon: Menu, badge: null },
] as const;

export function Sidebar({
  badges, me, trackedCount, syncedAt,
}: {
  badges: NavBadges;
  me: { name: string; role: string };
  trackedCount: number;
  syncedAt: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  // Keep the game filter when moving between sections — it is a global lens.
  const game = params.get('game');
  const suffix = game && game !== 'all' ? `?game=${game}` : '';

  return (
    <div className="sidebar">
      <div className="sidebar-brand" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Logo />
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18, letterSpacing: '1.4px', textTransform: 'uppercase', lineHeight: 1 }}>
            RESELL<span style={{ color: C.gold }}>.</span>BOT
          </div>
          <div style={{ fontSize: 9, color: C.muted, letterSpacing: '2.6px', textTransform: 'uppercase', marginTop: 4 }}>
            HILL Boosting
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ href, label, Icon, badge }) => {
          const on = pathname.startsWith(href);
          const value = badge === 'open' ? String(badges.open)
            : badge === 'boosters' ? String(badges.boosters)
            : badge === 'debt' ? badges.debt
            : '';
          return (
            <Link
              key={href}
              href={href + suffix}
              className="nav-item"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                textAlign: 'left',
                border: 'none',
                borderRadius: 10,
                padding: '11px 12px',
                fontSize: 13.5,
                ...(on
                  ? { background: 'linear-gradient(160deg,#2a2419,#1f1c14)', color: C.gold, boxShadow: 'inset 0 0 0 1px rgba(212,175,55,.3)' }
                  : { background: 'transparent', color: C.muted }),
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center' }}>
                  <Icon size={14} strokeWidth={2} />
                </span>
                {label}
              </span>
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: 11, color: on ? C.gold : C.muted }}>{value}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <div style={{ background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 13 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 8 }}>
            Database
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.green }}>
            ● live · Supabase
            <span style={{ color: C.muted, marginLeft: 'auto' }}>{trackedCount} tracked</span>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 7 }}>synced {syncedAt}</div>
          <form action={signOut}>
            <button
              type="submit"
              className="hover-gold"
              style={{
                marginTop: 10, width: '100%', background: 'transparent', border: `1px solid ${C.border2}`,
                borderRadius: 8, color: C.muted, padding: 7, fontSize: 11.5, cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </form>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderTop: `1px solid ${C.border}` }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(160deg,#2a2419,#1f1c14)',
            border: '1px solid rgba(212,175,55,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONT_DISPLAY, color: C.gold, fontSize: 14, flexShrink: 0,
          }}>
            {me.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {me.name}
            </div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase' }}>
              {me.role}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
