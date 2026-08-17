import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { CUR_CODE, type Currency, type GameKey } from '@/lib/domain';
import { parsePaste } from '@/lib/parse';

/* Shared plumbing for the marketplace pull routes.

   The upsert half is real and finished. What each marketplace cannot yet
   provide is the list of *boosting* orders — see the note in each route. */

export interface IngestedOrder {
  /** Marketplace order id. Used to deduplicate across runs. */
  ref: string;
  platform: 'Eldorado' | 'GameBoost';
  game: GameKey;
  type: 'rank' | 'netwin' | 'placement' | 'custom';
  from: string;
  to: string;
  count: number;
  region: string;
  startRR: number;
  riotId: string;
  extras: string[];
  cost: number;
  cur: Currency;
  feePct: number;
  createdAt?: string;
}

/** Best-effort mapping of a free-text marketplace listing into an order.
    The same regex set the New Order paste box uses, so a marketplace that
    only exposes a title still yields structured fields. */
export function fromListingText(
  text: string,
  platform: IngestedOrder['platform'],
  ref: string,
  defaults: { feePct: number },
): IngestedOrder | null {
  const p = parsePaste(text);
  if (!p || !p.from) return null;

  return {
    ref,
    platform,
    game: p.game ?? 'valorant',
    type: p.type ?? 'rank',
    from: p.from,
    to: p.to ?? '',
    count: p.count ?? 0,
    region: p.region ?? 'TR',
    startRR: p.startRR ?? 0,
    riotId: p.riotId ?? '',
    extras: p.extras ?? [],
    cost: Number(p.cost) || 0,
    cur: p.cur ?? '$',
    feePct: defaults.feePct,
  };
}

export interface IngestResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

/** Insert the orders we have not seen before, keyed on
    order_finance.platform_ref. Runs with the service-role key, so RLS does
    not apply — keep the CRON_SECRET guard in front of it. */
export async function upsertOrders(orders: IngestedOrder[], rate: number): Promise<IngestResult> {
  const sb = createAdminClient();
  const result: IngestResult = { inserted: 0, skipped: 0, errors: [] };
  if (!orders.length) return result;

  const refs = orders.map((o) => o.ref);
  const { data: existing, error: refErr } = await sb
    .from('order_finance')
    .select('platform_ref')
    .in('platform_ref', refs);
  if (refErr) {
    result.errors.push(refErr.message);
    return result;
  }
  const seen = new Set(((existing as { platform_ref: string | null }[]) || []).map((r) => r.platform_ref));

  for (const o of orders) {
    if (seen.has(o.ref)) { result.skipped += 1; continue; }

    const { data, error } = await sb
      .from('resells')
      .insert({
        game: o.game,
        order_type: o.type,
        baslangic: o.from,
        hedef: o.type === 'rank' ? o.to : '',
        win_count: o.type === 'rank' ? 0 : o.count,
        start_rr: o.startRR,
        region: o.region,
        riot_id: o.riotId,
        extras: o.extras,
        durum: 'yeni',
        tarih: (o.createdAt ?? new Date().toISOString()).slice(0, 10),
        booster_payout: 0,
        paid: false,
        archived: false,
      })
      .select('id')
      .single();

    if (error) { result.errors.push(`${o.ref}: ${error.message}`); continue; }
    const id = (data as { id: string }).id;

    const { error: fe } = await sb.from('order_finance').insert({
      order_id: id,
      platform: o.platform,
      platform_ref: o.ref,
      cost: o.cost,
      cost_currency: CUR_CODE[o.cur] || 'USD',
      fee_pct: o.feePct,
      cost_tl: Math.round(o.cost * (o.cur === '₺' ? 1 : rate)),
      rate,
    });
    if (fe) { result.errors.push(`${o.ref} finance: ${fe.message}`); continue; }

    await sb.from('order_activity').insert({
      order_id: id,
      kind: 'yeni',
      text: `Pulled from ${o.platform} · ${o.ref}`,
    });

    result.inserted += 1;
  }

  return result;
}

/** Newest rate from fx_rates, for freezing cost_tl at import time. */
export async function currentRate(cur: Currency): Promise<number> {
  if (cur === '₺') return 1;
  const code = cur === '€' ? 'EUR' : 'USD';

  const sb = createAdminClient();
  const { data } = await sb
    .from('fx_rates')
    .select('rate')
    .eq('currency', code)
    .order('as_of', { ascending: false })
    .limit(1)
    .maybeSingle();

  return Number(data?.rate) || (code === 'EUR' ? 47 : 41);
}
