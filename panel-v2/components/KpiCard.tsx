import { C, FONT_DISPLAY } from '@/lib/ui';

export interface Kpi {
  label: string;
  value: string;
  hint: string;
  /** Value colour. */
  color: string;
  /** The two stops of the 3px edge bar. */
  gradient: string;
}

export function KpiCard({ label, value, hint, color, gradient }: Kpi) {
  return (
    <div style={{
      background: 'linear-gradient(160deg,#121214,#16161a)',
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: '18px 18px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, width: 3, height: '100%',
        background: `linear-gradient(${gradient})`,
      }} />
      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
        {label}
      </div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 600, marginTop: 7, color }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>{hint}</div>
    </div>
  );
}
