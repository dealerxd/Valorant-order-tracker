import { redirect } from 'next/navigation';
import { GameFilter } from '@/components/GameFilter';
import { KpiCard } from '@/components/KpiCard';
import {
  AccountsCard, AlertsCard, FeedCard, FunnelCard, GameBreakdownCard,
  type AccountStat, type Alert, type FeedEntry, type GameStat,
} from '@/components/OverviewPanels';
import {
  loadPanel, adminShare, averageTurnaround, costTL, grossRevenue, isExternal,
  netRevenue, partnerShare, profit, routeOf, type Order,
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
  const net = withFinance.reduce((a, o) => a + profit(o), 0);
  // Eldorado kârı işi yapana göre paylaşılıyor; bu iki rakam onu ayırıyor.
  const mine = withFinance.reduce((a, o) => a + adminShare(o), 0);
  const partners = withFinance.reduce((a, o) => a + partnerShare(o), 0);
  const debt = orders.filter((o) => !o.paid && o.booster && o.status === 'tamam').reduce((a, o) => a + o.payout, 0);
  const open = orders.filter((o) => o.status !== 'tamam').length;

  const ext = orders.filter(isExternal);
  const extCost = ext.reduce((a, o) => a + costTL(o), 0);
  const extDebt = ext.filter((o) => !o.vpaid).reduce((a, o) => a + costTL(o), 0);

  const avgDelivery = averageTurnaround(orders.filter((o) => o.status === 'tamam'));

  // Calisan gorunumu: kendi parasi. RLS zaten yalnizca kendi siparislerini
  // verdigi icin bu toplamlar dogal olarak kisiye ozel.
  //   bekleyen = bitmis ama odenmemis
  //   toplam   = bugune kadar hak edilen (odenmisler dahil)
  const doneMine = orders.filter((o) => o.status === 'tamam');
  const pendingPay = doneMine.filter((o) => !o.paid).reduce((a, o) => a + o.payout, 0);
  const lifetimePay = doneMine.reduce((a, o) => a + o.payout, 0);

  const kpis = [
    { label: 'Open Jobs', value: String(open), hint: `${orders.length} active orders`, color: C.text, gradient: '160deg,#d4af37,#b8962f' },
    ...(isAdmin ? [
      { label: 'Gross Revenue (TL)', value: TL(gross), hint: `this period · ${withFinance.length} jobs with finance`, color: C.gold, gradient: '160deg,#d4af37,#b8962f' },
      { label: 'Net Profit', value: TL(net), hint: partners ? `${TL(mine)} yours · ${TL(partners)} partner` : 'after fees and payouts', color: C.green, gradient: '160deg,#3ecf8e,#2f9e6c' },
      ...(partners ? [
        { label: 'Partner Share', value: TL(partners), hint: 'Eldorado profit owed to the partner', color: C.blue, gradient: '160deg,#5a9ded,#3a6ea8' },
      ] : []),
      { label: 'Booster Debt', value: TL(debt), hint: `${boosters.filter((b) => b.debt > 0).length} boosters awaiting payment`, color: C.red, gradient: '160deg,#e25555,#a83c3c' },
    ] : []),
    ...(isAdmin && ext.length
      ? [{ label: 'Outsourcing Cost', value: TL(extCost), hint: `${ext.length} jobs outsourced · ${TL(extDebt)} owed to sellers`, color: C.text2, gradient: '160deg,#c7ccd4,#7e838a' }]
      : []),
    ...(isAdmin ? [] : [
      { label: 'Bekleyen', value: TL(pendingPay), hint: `${doneMine.filter((o) => !o.paid).length} bitmiş iş · ödeme bekliyor`, color: C.amber, gradient: '160deg,#e0a534,#a87a1f' },
      { label: 'Toplam kazanç', value: TL(lifetimePay), hint: `${doneMine.length} tamamlanmış iş`, color: C.gold, gradient: '160deg,#d4af37,#b8962f' },
    ]),
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

  // Ortak veri havuzu: hesap basina hareket. Iki ayri akis var --
  //   siparisin dustugu hesap (accountName)      -> +net gelir oraya
  //   resell odemesinin ciktigi hesap (resell...) -> -maliyet oradan
  // costPool = gelen icindeki kar olmayan kisim; bu hesaptan cikan resell
  // odemeleri onu azaltiyor. Boylece hesap basina denge tutuyor:
  //   gelen - giden = sen + ortak + maliyet karsiligi
  const byAccount = new Map<string, AccountStat>();
  const accOf = (name: string): AccountStat => {
    const a = byAccount.get(name) ?? { name, jobs: 0, inTl: 0, outTl: 0, mine: 0, partner: 0, costPool: 0 };
    byAccount.set(name, a);
    return a;
  };
  orders.forEach((o) => {
    if (o.accountName && o.cost > 0) {
      const a = accOf(o.accountName);
      a.jobs += 1;
      a.inTl += netRevenue(o);
      a.mine += adminShare(o);
      a.partner += partnerShare(o);
      a.costPool += costTL(o);
    }
    if (isExternal(o) && o.resellAccountName) {
      const b = accOf(o.resellAccountName);
      b.outTl += costTL(o);
      b.costPool -= costTL(o);
    }
  });
  const accountStats = [...byAccount.values()].sort((a, b) => (b.inTl - b.outTl) - (a.inTl - a.outTl));

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
            {/* Ortak veri havuzu: admin ve ortak gorur; calisanda RLS
                hesap listesini bosalttigi icin zaten hic olusmuyor. */}
            {(isAdmin || data.me.role === 'ortak') && accountStats.length > 0 && (
              <AccountsCard stats={accountStats} />
            )}
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
