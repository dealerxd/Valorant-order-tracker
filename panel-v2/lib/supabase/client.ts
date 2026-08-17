import { createBrowserClient } from '@supabase/ssr';

/** Browser client. Only used for the realtime subscription on `resells` and
    `tracker_state`; all reads and writes go through the server. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
