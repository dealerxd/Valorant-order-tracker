import { guardCron } from '@/lib/supabase/admin';
import { currentRate, upsertOrders, type IngestedOrder } from '../_shared';

export const dynamic = 'force-dynamic';

/* GameBoost pull.

   STATUS: not wired up, and not for want of plumbing.

   GameBoost's public API (https://api.gameboost.com/v2, Bearer auth with
   GAMEBOOST_API_KEY) exposes account-orders, currency-orders, item-orders
   and gift-card-orders. It has no endpoint for *boosting service* orders,
   which is the only kind this panel tracks. Checked against the published
   OpenAPI spec — /v2/{account,currency,item,gift-card}-orders is the
   complete order surface.

   So there are two ways forward, neither of which can be guessed here:
     a) if GameBoost exposes boosting orders on a partner/seller endpoint
        that is not in the public docs, fill in fetchOrders() below — the
        upsert half in _shared.ts is finished and deduplicates on
        order_finance.platform_ref;
     b) use the webhook instead. GameBoost documents order-purchased
        webhooks; a POST handler here would beat a 15-minute poll anyway.

   Until then this returns 501 rather than pretending to sync. The New Order
   paste parser stays the working path, which is what it was built for. */
export async function GET(req: Request) {
  const denied = guardCron(req);
  if (denied) return denied;

  if (!process.env.GAMEBOOST_API_KEY) {
    return Response.json({ error: 'GAMEBOOST_API_KEY is not set' }, { status: 503 });
  }

  const orders = await fetchOrders();
  if (orders === null) {
    return Response.json(
      { error: 'not implemented: GameBoost has no public boosting-order endpoint — see the note in this file' },
      { status: 501 },
    );
  }

  const rate = await currentRate('€');
  const result = await upsertOrders(orders, rate);
  return Response.json({ ok: true, ...result });
}

/** Returns null while the endpoint is unknown. */
async function fetchOrders(): Promise<IngestedOrder[] | null> {
  return null;
}
