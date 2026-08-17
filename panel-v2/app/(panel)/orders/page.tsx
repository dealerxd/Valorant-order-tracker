import { redirect } from 'next/navigation';
import { GameFilter } from '@/components/GameFilter';
import { FilterTabs, ViewSwitcher, type Tab } from '@/components/FilterTabs';
import { OrdersView, type ViewMode } from '@/components/OrdersView';
import { loadPanel } from '@/lib/orders';
import { filterOrders, isExternal, partnerBucket } from '@/lib/model';
import { GAME_KEYS, ST, STATUSES } from '@/lib/domain';

export const dynamic = 'force-dynamic';

export interface OrdersSearchParams {
  view?: string;
  status?: string;
  game?: string;
  src?: string;
  partner?: string;
  q?: string;
  late?: string;
  unpaid?: string;
  nofinance?: string;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<OrdersSearchParams>;
}) {
  const data = await loadPanel();
  if (!data) redirect('/login');

  const sp = await searchParams;
  const { orders: all, boosters, isAdmin } = data;

  const view: ViewMode = sp.view === 'cards' ? 'cards' : sp.view === 'board' ? 'board' : 'table';
  const status = sp.status ?? '';
  const src = sp.src ?? '';
  const partner = sp.partner ?? '';
  const game = sp.game ?? 'all';

  const rows = filterOrders(all, {
    status,
    game,
    src,
    partner,
    q: sp.q,
    late: sp.late === '1',
    unpaid: sp.unpaid === '1',
    nofinance: sp.nofinance === '1',
  });

  // Tab counts respect the game lens but not the tab's own dimension, so the
  // numbers stay stable as you click between them.
  const inGame = game === 'all' ? all : all.filter((o) => o.game === game);

  const gameCounts: Record<string, number> = { all: all.length };
  GAME_KEYS.forEach((k) => { gameCounts[k] = all.filter((o) => o.game === k).length; });

  const statusTabs: Tab[] = [
    { value: '', label: 'All', count: inGame.length },
    ...STATUSES.map((k) => ({ value: k, label: ST[k].label, count: inGame.filter((o) => o.status === k).length })),
  ];

  const extCount = inGame.filter(isExternal).length;
  const srcTabs: Tab[] = [
    { value: '', label: 'All jobs', count: inGame.length },
    { value: 'internal', label: 'Our team', count: inGame.length - extCount },
    { value: 'external', label: 'Outsourced', count: extCount },
  ];

  // The ownership split. Admin-only: it is a finance lens. Only rendered
  // once at least one shared order exists.
  const sharedCount = inGame.filter((o) => partnerBucket(o) !== 'own').length;
  const partnerTabs: Tab[] = [
    { value: '', label: 'All', count: inGame.length },
    { value: 'own', label: '100% you', count: inGame.length - sharedCount },
    { value: 'TZX', label: 'TZX shared', count: sharedCount },
  ];

  return (
    <>
      <GameFilter counts={gameCounts} />
      <div className="page-pad">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <FilterTabs param="status" tabs={statusTabs} current={status} variant="status" />
            <FilterTabs param="src" tabs={srcTabs} current={src} />
            {isAdmin && sharedCount > 0 && <FilterTabs param="partner" tabs={partnerTabs} current={partner} />}
            <ViewSwitcher current={view} />
          </div>

          <OrdersView
            orders={rows}
            view={view}
            boosters={boosters.filter((b) => b.on).map((b) => ({ id: b.id, name: b.name }))}
            isAdmin={isAdmin}
          />
        </div>
      </div>
    </>
  );
}
