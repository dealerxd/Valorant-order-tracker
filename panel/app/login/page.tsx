import { Suspense } from 'react';
import { LoginForm } from '@/components/LoginForm';
import { Logo } from '@/components/Logo';
import { C, FONT_DISPLAY } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div
      className="shell"
      style={{ alignItems: 'center', justifyContent: 'center', padding: 20, display: 'flex' }}
    >
      <div style={{ width: 400, maxWidth: '94vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, justifyContent: 'center' }}>
          <Logo size={44} />
          <div>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18, letterSpacing: '1.4px', textTransform: 'uppercase', lineHeight: 1 }}>
              RESELL<span style={{ color: C.gold }}>.</span>BOT
            </div>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: '2.6px', textTransform: 'uppercase', marginTop: 4 }}>
              HILL Boosting
            </div>
          </div>
        </div>

        <div style={{ background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: 16, padding: 26 }}>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
