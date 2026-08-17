import { redirect } from 'next/navigation';
import { GameFilter } from '@/components/GameFilter';
import { KpiCard } from '@/components/KpiCard';
import {
  AlertsCard, FeedCard, FunnelCard, GameBreakdownCard, PartnerCard,
  type Alert, type FeedEntry, type GameStat, type PartnerStat,
} from '@/components/OverviewPanels';
import {
  loadPanel, averageTurnaround, costTL, grossRevenue, isExternal, netRevenue,
  ownProfit, partnerBucket, partnerOf, partnerShare, profit, routeOf, type Order,
} from '@/lib/orders';
import { GAME_KEYS, ST, STATUSES, type GameKey } from '@/lib/domain';
import { TL, ago } from '@/lib/format';
import { C } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const data = await loadPanel();
  if (!data) redirect('/login');

  const { orders: all, boosters, isAdmin } = data;
  const { game } = await searchParams;
  const lens = game && game !== 'all' ? (game as GameKey) : null;
  const orders = lens ? all.filter((o) => o.game === lens) : all;

  const gameCounts: Record<string, number> = { all: all.length };
  GAME_KEYS.forEach((k) => { gameCounts[k] = all.filter((o) => o.game === k).length; });

  const withFinance = orders.filter((o) => o.cost > 0);
  const gross = withFinance.reduce((a, o) => a + grossRevenue(o), 0);
  // Headline profit is what reaches reXs: partner cuts already taken out.
  const net = withFinance.reduce((a, o) => a + ownProfit(o), 0);
  const partnerCut = withFinance.reduce((a, o) => a + partnerShare(o), 0);
  const debt = orders.filter((o) => !o.paid && o.booster && o.status === 'tamam').reduce((a, o) => a + o.payout, 0);
  const open = orders.filter((o) => o.status !== 'tamam').length;

  const ext = orders.filter(isExternal);
  const extCost = ext.reduce((a, o) => a + costTL(o), 0);
  const extDebt = ext.filter((o) => !o.vpaid).reduce((a, o) => a + costTL(o), 0);

  const avgDelivery = averageTurnaround(orders.filter((o) => o.status === 'tamam'));

  const kpis = [
    { label: 'Open Jobs', value: String(open), hint: `${orders.length} active orders`, color: C.text, gradient: '160deg,#d4af37,#b8962f' },
    ...(isAdmin ? [
      { label: 'Gross Revenue (TL)', value: TL(gross), hint: `this period · ${withFinance.length} jobs with finance`, color: C.gold, gradient: '160deg,#d4af37,#b8962f' },
      { label: 'Net Profit', value: TL(net), hint: partnerCut ? 'yours, after fees, payouts and partner cuts' : 'after fees and payouts', color: C.green, gradient: '160deg,#3ecf8e,#2f9e6c' },
      ...(partnerCut ? [
        { label: 'TZX Share', value: TL(partnerCut), hint: `partner cut on ${withFinance.filter((o) => partnerOf(o)).length} shared jobs`, color: C.blue, gradient: '160deg,#5a9ded,#3a6ea8' },
      ] : []),
      { label: 'Booster Debt', value: TL(debt), hint: `${boosters.filter((b) => b.debt > 0).length} boosters awaiting payment`, color: C.red, gradient: '160deg,#e25555,#a83c3c' },
    ] : []),
    ...(isAdmin && ext.length
      ? [{ label: 'Outsourcing Cost', value: TL(extCost), hint: `${ext.length} jobs outsourced · ${TL(extDebt)} owed to sellers`, color: C.text2, gradient: '160deg,#c7ccd4,#7e838a' }]
      : []),
  ];

  const gameQ = lens ? `&game=${lens}` : '';
  const alerts: Alert[] = [
    { text: 'Late job', sub: 'past due — ping the booster', count: orders.filter((o) => o.late).length, color: C.red, href: `/orders?late=1${gameQ}` },
    { text: 'Unassigned order', sub: 'waiting for a booster', count: orders.filter((o) => !o.booster && !isExternal(o)).length, color: C.amber, href: `/orders?status=yeni${gameQ}` },
    ...(isAdmin ? [{ text: 'Missing finance', sub: 'excluded from profit', count: orders.filter((o) => o.cost === 0).length, color: C.amber, href: `/orders?nofinance=1${gameQ}` }] : []),
    { text: 'Awaiting payment', sub: 'done, not paid', count: orders.filter((o) => o.status === 'tamam' && (isExternal(o) ? !o.vpaid : !o.paid)).length, color: C.blue, href: `/orders?status=tamam&unpaid=1${gameQ}` },
  ].filter((a) => a.count > 0);

  const statusCounts: Record<string, number> = {};
  STATUSES.forEach((k) => { statusCounts[k] = orders.filter((o) => o.status === k).length; });

  const gameStats: GameStat[] = GAME_KEYS.map((k) => {
    const list = all.filter((o) => o.game === k && o.cost > 0);
    return {
      key: k,
      jobs: all.filter((o) => o.game === k).length,
      net: list.reduce((a, o) => a + netRevenue(o), 0),
      profit: list.reduce((a, o) => a + profit(o), 0),
    };
  });

  const feed: FeedEntry[] = buildFeed(orders);

  // GameBoost (wholly ours) vs Eldorado (50/50 with TZX). Buckets with no
  // orders are dropped so the panel does not show an empty TZX row before
  // the first partnered job exists.
  const sharedPct = orders.find((o) => partnerBucket(o) === 'TZX')?.partnerPct ?? 50;
  const partnerStats: PartnerStat[] = [
    { key: 'own', label: 'Wholly yours', sub: '100% of the remaining profit', color: C.gold },
    { key: 'TZX', label: 'Shared with TZX', sub: `${sharedPct}% of the remaining profit goes to TZX`, color: C.blue },
  ]
    .map((b) => {
      const list = orders.filter((o) => partnerBucket(o) === b.key);
      const fin = list.filter((o) => o.cost > 0);
      return {
        ...b,
        jobs: list.length,
        net: fin.reduce((a, o) => a + netRevenue(o), 0),
        profit: fin.reduce((a, o) => a + profit(o), 0),
        own: fin.reduce((a, o) => a + ownProfit(o), 0),
        partner: fin.reduce((a, o) => a + partnerShare(o), 0),
        href: `/orders?partner=${b.key}${lens ? `&game=${lens}` : ''}`,
      };
    })
    .filter((s) => s.jobs > 0);

  return (
    <>
      <GameFilter counts={gameCounts} />
      <div className="page-pad">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14 }}>
            {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 18, alignItems: 'start' }}>
            <FunnelCard
              counts={statusCounts}
              total={orders.length}
              avgDelivery={avgDelivery}
            />
            <AlertsCard alerts={alerts} />
            {isAdmin && partnerStats.length > 0 && <PartnerCard stats={partnerStats} />}
            <GameBreakdownCard stats={gameStats} showFinance={isAdmin} />
            <FeedCard feed={feed} />
          </div>
        </div>
      </div>
    </>
  );
}

/** The five most recent activity entries across all orders. */
function buildFeed(orders: Order[]): FeedEntry[] {
  const colorOf = (k: string) =>
    k === 'warn' ? C.amber : k === 'note' ? C.text2 : (ST[k as keyof typeof ST]?.c ?? C.blue);

  return orders
    .flatMap((o) =>
      o.activity.slice(0, 2).map((a) => ({
        text: `${routeOf(o)} — ${a.text}`,
        time: a.time || ago(o.createdAt),
        color: colorOf(a.k),
        sort: o.createdAt ? new Date(o.createdAt).getTime() : 0,
      })),
    )
    .sort((a, b) => b.sort - a.sort)
    .slice(0, 5)
    .map(({ text, time, color }) => ({ text, time, color }));
}
