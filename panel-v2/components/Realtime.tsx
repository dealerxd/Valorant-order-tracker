'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** One client-side subscription on `resells` and `tracker_state`. Any change
    triggers router.refresh(), debounced ~500 ms so a burst of tracker writes
    costs one re-render, not one per match. */
export function Realtime() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const ping = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 500);
    };

    const channel = supabase
      .channel('panel-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resells' }, ping)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracker_state' }, ping)
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      // Realtime may be disabled on the project; unsubscribing is still safe.
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
