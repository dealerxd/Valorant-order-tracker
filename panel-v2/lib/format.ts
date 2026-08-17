/* Formatting helpers. All money in the panel is Turkish lira unless the
   symbol says otherwise, and every number uses the en-US grouping the
   prototype used (1,234) so the Oswald digits line up. */

export const TL = (n: number | null | undefined) => `₺${Number(n || 0).toLocaleString('en-US')}`;

const DAY = 86_400_000;

/** "18 min ago" / "3 h ago" / "yesterday" / "4 days ago". */
export function ago(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const ms = now - new Date(iso).getTime();
  if (ms < 36e5) return `${Math.max(1, Math.round(ms / 6e4))} min ago`;
  if (ms < DAY) return `${Math.round(ms / 36e5)} h ago`;
  if (ms < 2 * DAY) return 'yesterday';
  return `${Math.round(ms / DAY)} days ago`;
}

/** "14 Aug" — the compact date used in table sub-lines and chips. */
export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : '';

export const clockTime = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

export { DAY };
