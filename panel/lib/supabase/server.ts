import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — copy .env.example to .env.local`);
  return v;
}

/** Cookie-bound client for server components, server actions and route
    handlers. Every read goes through this so RLS applies to the signed-in
    user — boosters must never see order_finance. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a server component — middleware already refreshed
            // the session cookie, so this is safe to ignore.
          }
        },
      },
    },
  );
}
