'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { C } from '@/lib/ui';

/** Search is URL state (`?q=`) so views stay linkable and back/forward work.
    Typing is debounced 300 ms before it touches the router. */
export function SearchField() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [value, setValue] = useState(params.get('q') ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const initial = useRef(true);

  // ⌘K / Ctrl+K focuses the field, as the hint chip promises.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (initial.current) { initial.current = false; return; }
    const id = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set('q', value); else next.delete('q');
      // Searching always lands on Orders — that is the only list it filters.
      const target = pathname.startsWith('/orders') ? pathname : '/orders';
      startTransition(() => router.replace(`${target}?${next.toString()}`));
    }, 300);
    return () => clearTimeout(id);
    // `params` is intentionally out: re-running on every URL change would
    // fight the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div style={{
      flex: '1 1 180px', display: 'flex', alignItems: 'center', gap: 8,
      background: C.surface0, border: `1px solid ${C.border2}`, borderRadius: 10,
      padding: '0 12px', maxWidth: 340,
    }}>
      <Search size={13} style={{ color: C.muted, flexShrink: 0 }} />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search job, booster, account…"
        aria-label="Search orders"
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          color: C.text, padding: '11px 0', fontSize: 13, minWidth: 0,
        }}
      />
      <span style={{ fontSize: 10, color: C.muted, border: `1px solid ${C.border2}`, borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap' }}>
        ⌘K
      </span>
    </div>
  );
}
