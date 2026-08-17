import { createAdminClient, guardCron } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Daily USD/EUR -> TRY refresh, written to the existing `fx_rates` table
    (one row per currency per day) that the Python tracker also writes. The
    New Order form and the quote calculator read the newest row as their
    default rate; historic orders keep theirs frozen in order_finance.rate.

    Note this route is redundant if the Python bot's daily FX write is still
    running — it is here so the panel does not depend on the bot being up.
    Both are idempotent per (currency, as_of). */
export async function GET(req: Request) {
  const denied = guardCron(req);
  if (denied) return denied;

  try {
    const rates = await fetchRates();
    if (!rates.USD || !rates.EUR) {
      return Response.json({ error: 'provider returned no TRY rate' }, { status: 502 });
    }

    const asOf = new Date().toISOString().slice(0, 10);
    const source = process.env.FX_API_KEY ? 'exchangerate-api' : 'open.er-api.com';

    const sb = createAdminClient();
    const { error } = await sb.from('fx_rates').upsert(
      (['USD', 'EUR'] as const).map((currency) => ({
        currency, as_of: asOf, rate: rates[currency], source,
      })),
      { onConflict: 'currency,as_of' },
    );
    if (error) throw error;

    return Response.json({ ok: true, as_of: asOf, rates });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** open.er-api.com needs no key. If FX_API_KEY is set, exchangerate-api's
    keyed endpoint is used instead — same response shape. */
async function fetchRates(): Promise<Record<string, number>> {
  const key = process.env.FX_API_KEY;

  const url = key
    ? `https://v6.exchangerate-api.com/v6/${key}/latest/TRY`
    : 'https://open.er-api.com/v6/latest/TRY';

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`FX provider returned ${res.status}`);

  const body = (await res.json()) as { rates?: Record<string, number>; conversion_rates?: Record<string, number> };
  // Both endpoints quote *from* TRY, so invert to get "1 unit in TRY".
  const perTry = body.conversion_rates ?? body.rates ?? {};

  const invert = (code: string) => (perTry[code] ? Math.round((1 / perTry[code]) * 100) / 100 : 0);

  return { USD: invert('USD'), EUR: invert('EUR'), TRY: 1 };
}
