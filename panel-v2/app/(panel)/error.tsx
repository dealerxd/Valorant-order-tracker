'use client';

import { useEffect } from 'react';
import { C, FONT_DISPLAY, ghostButton } from '@/lib/ui';

export default function PanelError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="page-pad">
      <div style={{
        background: C.surface3, border: '1px solid rgba(226,85,85,.35)', borderRadius: 14,
        padding: 22, maxWidth: 560,
      }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, letterSpacing: '1px', textTransform: 'uppercase', color: C.red }}>
          Could not load
        </div>
        <p style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, marginTop: 10 }}>
          {error.message || 'The database request failed.'}
        </p>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          If this is a fresh deploy, check that the migrations in <code>shared/migrations/</code> have
          been applied and the Supabase env vars are set.
        </p>
        <button onClick={reset} className="hover-gold" style={{ ...ghostButton, marginTop: 12 }}>
          Try again
        </button>
      </div>
    </div>
  );
}
