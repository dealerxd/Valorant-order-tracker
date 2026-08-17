import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { C, FONT_DISPLAY } from '@/lib/ui';

export default function NotFound() {
  return (
    <div className="shell" style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ textAlign: 'center' }}>
        <Logo size={44} />
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, letterSpacing: '1px', textTransform: 'uppercase', marginTop: 14 }}>
          Not found
        </div>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>
          That order or page does not exist.
        </p>
        <Link href="/overview" style={{ fontSize: 13, color: C.gold, marginTop: 14, display: 'inline-block' }}>
          ← back to the panel
        </Link>
      </div>
    </div>
  );
}
