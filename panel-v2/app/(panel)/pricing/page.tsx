import { redirect } from 'next/navigation';
import { GameFilter } from '@/components/GameFilter';
import { PriceEditor } from '@/components/PriceEditor';
import { QuoteCalculator } from '@/components/QuoteCalculator';
import { loadPanel } from '@/lib/orders';
import { stepRows } from '@/lib/pricing';
import { G, GAME_KEYS, type GameKey } from '@/lib/domain';
import { C } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const data = await loadPanel();
  if (!data) redirect('/login');

  if (!data.isAdmin) {
    return (
      <div className="page-pad" style={{ color: C.muted, fontSize: 13 }}>
        Pricing is editable by admins only.
      </div>
    );
  }

  const { game } = await searchParams;
  // "All games" has no ladder of its own — fall back to Valorant.
  const key: GameKey = game && game !== 'all' ? (game as GameKey) : 'valorant';

  const gameCounts: Record<string, number> = { all: data.orders.length };
  GAME_KEYS.forEach((k) => { gameCounts[k] = data.orders.filter((o) => o.game === k).length; });

  const rows = stepRows(key, data.pricing);
  const rate = Math.round(data.fx.USD ?? 41);

  return (
    <>
      <GameFilter counts={gameCounts} />
      <div className="page-pad">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 18, alignItems: 'start' }}>
          <PriceEditor
            game={key}
            gameLabel={G(key).label}
            rows={rows.map((r) => ({ rank: r.rank, label: r.label, value: r.value }))}
          />
          <QuoteCalculator game={key} pricing={data.pricing} rate={rate} />
        </div>
      </div>
    </>
  );
}
