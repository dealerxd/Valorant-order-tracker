import { redirect } from 'next/navigation';
import { FilterTabs, type Tab } from '@/components/FilterTabs';
import { PaymentsView, type PayRow } from '@/components/PaymentsView';
import { loadPanel } from '@/lib/orders';
import { costTL, isExternal } from '@/lib/model';
import { createClient } from '@/lib/supabase/server';
import { C } from '@/lib/ui';

export const dynamic = 'force-dynamic';

/** Payout periods are calendar halves: the 1st–15th and the 16th–end. */
function periodBounds(which: string) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const firstHalf = now.getUTCDate() <= 15;

  const iso = (d: Date) => d.toISOString().slice(0, 10);

  if (which === 'all') {
    return { start: '1970-01-01', end: iso(new Date(Date.UTC(y, m + 1, 0))), label: 'All' };
  }

  if (which === 'last') {
    const start = firstHalf ? new Date(Date.UTC(y, m - 1, 16)) : new Date(Date.UTC(y, m, 1));
    const end = firstHalf ? new Date(Date.UTC(y, m, 0)) : new Date(Date.UTC(y, m, 15));
    return { start: iso(start), end: iso(end), label: 'Last period' };
  }

  const start = firstHalf ? new Date(Date.UTC(y, m, 1)) : new Date(Date.UTC(y, m, 16));
  const end = firstHalf ? new Date(Date.UTC(y, m, 15)) : new Date(Date.UTC(y, m + 1, 0));
  return { start: iso(start), end: iso(end), label: 'This period' };
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const data = await loadPanel();
  if (!data) redirect('/login');

  if (!data.isAdmin) {
    return (
      <div className="page-pad" style={{ color: C.muted, fontSize: 13 }}>
        Payouts are visible to admins only.
      </div>
    );
  }

  const sp = await searchParams;
  const which = sp.period ?? 'this';
  const period = periodBounds(which);

  const { orders, boosters } = data;

  const inPeriod = (o: { createdAt: string | null }) => {
    if (which === 'all' || !o.createdAt) return true;
    const d = o.createdAt.slice(0, 10);
    return d >= period.start && d <= period.end;
  };

  const scoped = orders.filter(inPeriod);

  const boosterRows: PayRow[] = boosters
    .filter((b) => b.debt > 0)
    .map((b) => {
      const mine = scoped.filter((o) => o.boosterId === b.id);
      return {
        key: b.id,
        kind: 'booster' as const,
        name: b.name,
        jobs: mine.filter((o) => !o.paid).length,
        method: b.iban ? 'IBAN' : 'not set',
        accountLabel: 'iban',
        account: b.iban || 'no IBAN on profile',
        unpaid: b.debt,
        periodTotal: mine.reduce((a, o) => a + o.payout, 0),
        orderIds: [],
      };
    });

  // Outsourced sellers get their own rows, grouped by vendor name.
  const vendorMap = new Map<string, PayRow>();
  scoped.filter((o) => isExternal(o) && !o.vpaid).forEach((o) => {
    const key = `v:${o.vendor}`;
    const row = vendorMap.get(key) ?? {
      key,
      kind: 'vendor' as const,
      name: o.vendor || 'external seller',
      jobs: 0,
      method: 'external seller',
      accountLabel: 'payment channel',
      account: o.vendor.includes('Eldorado') ? 'Eldorado balance' : 'Discord · USDT TRC20',
      unpaid: 0,
      periodTotal: 0,
      orderIds: [] as string[],
    };
    row.jobs += 1;
    row.unpaid += costTL(o);
    row.periodTotal += costTL(o);
    row.orderIds.push(o.id);
    vendorMap.set(key, row);
  });

  const rows = [...boosterRows, ...vendorMap.values()];

  // `paid` in the period comes from the settled payouts table, not from the
  // orders, so a re-opened order cannot silently reduce it.
  const sb = await createClient();
  const { data: settled } = await sb
    .from('payouts')
    .select('amount_tl')
    .gte('period_end', period.start)
    .lte('period_start', period.end);
  const paid = ((settled as { amount_tl: number | null }[]) || []).reduce((a, p) => a + (Number(p.amount_tl) || 0), 0);

  const outstanding = rows.reduce((a, r) => a + r.unpaid, 0);

  const tabs: Tab[] = [
    { value: '', label: `This period · ${period.start.slice(5)} – ${periodBounds('this').end.slice(5)}` },
    { value: 'last', label: 'Last period' },
    { value: 'all', label: 'All' },
  ];

  return (
    <div className="page-pad">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <FilterTabs param="period" tabs={tabs} current={which === 'this' ? '' : which} />
      </div>

      <PaymentsView
        rows={rows}
        period={{ start: period.start, end: period.end }}
        summary={{ accrued: paid + outstanding, paid, outstanding }}
      />
    </div>
  );
}
