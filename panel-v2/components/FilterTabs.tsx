'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { C, pillGroup, segTab, statusTab } from '@/lib/ui';

export interface Tab {
  /** Empty string clears the parameter. */
  value: string;
  label: string;
  count?: number;
}

/** Tabs that write a single search param, so every view stays linkable and
    back/forward works. `variant` picks the gold-ring or plain treatment. */
export function FilterTabs({
  param, tabs, current, variant = 'seg', style,
}: {
  param: string;
  tabs: Tab[];
  current: string;
  variant?: 'seg' | 'status';
  style?: React.CSSProperties;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const href = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(param, value); else next.delete(param);
    // Any filter change invalidates the ad-hoc lenses the Overview links set.
    if (param === 'status') { next.delete('late'); next.delete('unpaid'); next.delete('nofinance'); }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <div style={{ ...pillGroup, ...style }}>
      {tabs.map((t) => {
        const on = current === t.value;
        return (
          <Link key={t.value || 'all'} href={href(t.value)} style={variant === 'status' ? statusTab(on) : segTab(on)}>
            {t.label}
            {t.count != null && <span style={{ opacity: .6, marginLeft: 6 }}>{t.count}</span>}
          </Link>
        );
      })}
    </div>
  );
}

/** Table / Cards / Board switcher. */
export function ViewSwitcher({ current }: { current: string }) {
  const pathname = usePathname();
  const params = useSearchParams();

  const href = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === 'table') next.delete('view'); else next.set('view', value);
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <div style={{ ...pillGroup, marginLeft: 'auto', flexWrap: 'nowrap' }}>
      {(['table', 'cards', 'board'] as const).map((v) => (
        <Link key={v} href={href(v)} style={{ ...segTab(current === v), textTransform: 'capitalize', color: current === v ? C.gold : C.muted }}>
          {v}
        </Link>
      ))}
    </div>
  );
}
