'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { NotificationMenu } from './NotificationMenu';
import { SearchField } from './SearchField';
import { NewOrderButton } from './NewOrderModal';
import type { Notif } from '@/lib/orders';
import type { PricingTables } from '@/lib/pricing';
import { C, FONT_DISPLAY } from '@/lib/ui';

export function TopBar({
  titles, notifs, boosters, isAdmin, pricing, defaultRate,
}: {
  /** section -> [title, subtitle]. The subtitle counts what is on screen. */
  titles: Record<string, [string, string]>;
  notifs: Notif[];
  boosters: { id: string; name: string }[];
  isAdmin: boolean;
  pricing: PricingTables;
  defaultRate: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [spinning, setSpinning] = useState(false);

  const section = pathname.split('/')[1] || 'overview';
  const [title, subtitle] = titles[section] ?? titles.overview;

  const refresh = () => {
    setSpinning(true);
    router.refresh();
    setTimeout(() => setSpinning(false), 600);
  };

  return (
    <div className="topbar">
      <div style={{ minWidth: 140 }}>
        <h1 style={{
          fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 600,
          letterSpacing: '1.2px', textTransform: 'uppercase', margin: 0,
        }}>
          {title}
        </h1>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{subtitle}</div>
      </div>

      <SearchField />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        <NotificationMenu notifs={notifs} />

        <button
          onClick={refresh}
          aria-label="Refresh"
          className="hover-border"
          style={{
            background: C.surface3, border: `1px solid ${C.border2}`, borderRadius: 10,
            color: C.text2, padding: '9px 12px', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center',
          }}
        >
          <RotateCw size={14} style={spinning ? { animation: 'shimmer .6s linear' } : undefined} />
        </button>

        <NewOrderButton
          boosters={boosters}
          isAdmin={isAdmin}
          pricing={pricing}
          defaultRate={defaultRate}
        />
      </div>
    </div>
  );
}
