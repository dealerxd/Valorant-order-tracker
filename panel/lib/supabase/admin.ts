import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** Service-role client — bypasses RLS. Only for cron and ingest routes that
    run without a user session. Never import this from a component. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled runs.
    Returns null when the caller is allowed, or a 401 Response when not. */
export function guardCron(req: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
