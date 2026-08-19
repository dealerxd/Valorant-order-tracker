import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { Realtime } from '@/components/Realtime';
import { loadPanel, costTL, isExternal } from '@/lib/orders';
import { TL, clockTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PanelLayout({
  children, drawer,
}: {
  children: React.ReactNode;
  /** Parallel slot the intercepted /orders/[id] route renders into. */
  drawer: React.ReactNode;
}) {
  const data = await loadPanel();
  if (!data) redirect('/login');

  const { orders, boosters, notifs, me, isAdmin, pricing, fx, accounts } = data;

  const open = orders.filter((o) => o.status !== 'tamam').length;
  const boosterDebt = boosters.reduce((a, b) => a + b.debt, 0);
  const vendorDebt = orders
    .filter((o) => isExternal(o) && !o.vpaid)
    .reduce((a, o) => a + costTL(o), 0);

  const titles: Record<string, [string, string]> = {
    overview: ['Overview', `${open} open jobs · ${notifs.filter((n) => n.unread).length} new notifications`],
    orders: ['Orders', `${orders.length} jobs · ${open} open`],
    boosters: ['Boosters', `${boosters.length} people · ${boosters.filter((b) => b.active > 0).length} busy`],
    payments: ['Payments', `unpaid · booster ${TL(boosterDebt)} · seller ${TL(vendorDebt)}`],
    pricing: ['Pricing', 'booster fees and quote calculator'],
  };

  return (
    <>
      <div className="shell">
        <Sidebar
          badges={{ open, boosters: boosters.filter((b) => b.on).length, debt: TL(boosterDebt + vendorDebt) }}
          me={{ name: me.display_name || 'user', role: isAdmin ? 'Admin' : 'Booster' }}
          trackedCount={orders.filter((o) => o.riotId !== '—').length}
          syncedAt={clockTime(new Date(data.syncedAt))}
        />

        <div className="content">
          <TopBar
            titles={titles}
            notifs={notifs}
            boosters={boosters.map((b) => ({ id: b.id, name: b.name }))}
            isAdmin={isAdmin}
            pricing={pricing}
            defaultRate={Math.round(fx.USD ?? 41)}
            accounts={accounts}
          />
          {children}
        </div>
      </div>

      {drawer}
      <Realtime />
    </>
  );
}
