import { guardCron } from '@/lib/supabase/admin';
import { currentRate, upsertOrders, type IngestedOrder } from '../_shared';

export const dynamic = 'force-dynamic';

/* Eldorado pull.

   STATUS: not wired up. Eldorado has no public seller API documented, and
   no credentials were supplied, so the request shape cannot be guessed.

   To finish it: fill in fetchOrders() so it returns the seller's boosting
   orders. Everything downstream is done — upsertOrders() in _shared.ts
   inserts the resells + order_finance pair, deduplicates on
   order_finance.platform_ref so re-runs are safe, and logs an
   order_activity row per import. fromListingText() will map a free-text
   order title through the same parser the New Order paste box uses, if the
   API turns out to expose little more than a title. */
export async function GET(req: Request) {
  const denied = guardCron(req);
  if (denied) return denied;

  if (!process.env.ELDORADO_API_KEY) {
    return Response.json({ error: 'ELDORADO_API_KEY is not set' }, { status: 503 });
  }

  const orders = await fetchOrders();
  if (orders === null) {
    return Response.json(
      { error: 'not implemented: no Eldorado seller API endpoint configured — see the note in this file' },
      { status: 501 },
    );
  }

  const rate = await currentRate('$');
  const result = await upsertOrders(orders, rate);
  return Response.json({ ok: true, ...result });
}

/** Returns null while the endpoint is unknown. */
async function fetchOrders(): Promise<IngestedOrder[] | null> {
  return null;
}
