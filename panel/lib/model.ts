/* View-model types and the derived values built on them.

   Deliberately free of `server-only`: the table, board and drawer are client
   components and need the same arithmetic the server used. Anything that
   touches Supabase belongs in lib/orders.ts instead. */

import { G, NEXT, ST, type Currency, type GameKey, type OrderType, type Status } from './domain';

export interface ActivityEntry {
  text: string;
  who: string;
  time: string;
  k: Status | 'note' | 'warn';
}

export interface Order {
  id: string;
  game: GameKey;
  type: OrderType;
  from: string;
  to: string;
  count: number;
  current: string;
  currentRR: number;
  startRR: number;
  region: string;
  riotId: string;
  booster: string;
  boosterId: string | null;
  fulfil: 'internal' | 'external';
  vendor: string;
  vcost: number;
  vcur: Currency;
  vpaid: boolean;
  status: Status;
  cost: number;
  cur: Currency;
  feePct: number;
  rate: number;
  payout: number;
  paid: boolean;
  tarih: string;
  createdAt: string | null;
  /** Set once the job is delivered; drives the turnaround averages. */
  completedAt: string | null;
  platform: string;
  extras: string[];
  shot: string | null;
  due: string;
  late: boolean;
  tracked: boolean;
  /** 'W' / 'L' for the last 20 matches, oldest first. Loaded for the drawer only. */
  matches: ('W' | 'L')[];
  noteText: string;
  activity: ActivityEntry[];
  /** True when the signed-in user cannot see order_finance for this row. */
  financeHidden: boolean;
}

export interface Profile {
  id: string;
  display_name: string | null;
  role: 'admin' | 'booster';
  iban?: string | null;
  capacity?: number | null;
  active?: boolean | null;
  games?: string[] | null;
  note?: string | null;
}

export interface Booster {
  id: string;
  name: string;
  initial: string;
  rankRange: string;
  games: GameKey[];
  active: number;
  cap: number;
  done: number;
  avg: string;
  late: number;
  earned: number;
  debt: number;
  iban: string;
  on: boolean;
}

export interface Notif {
  id: string;
  icon: 'late' | 'unassigned' | 'payment' | 'finance';
  text: string;
  time: string;
  unread: boolean;
}

/* ---- derived values (all TL) ------------------------------------------- */

export const netRevenue = (o: Pick<Order, 'cost' | 'feePct' | 'cur' | 'rate'>) =>
  Math.round(o.cost * (1 - o.feePct / 100) * (o.cur === '₺' ? 1 : o.rate));

export const grossRevenue = (o: Pick<Order, 'cost' | 'cur' | 'rate'>) =>
  Math.round(o.cost * (o.cur === '₺' ? 1 : o.rate));

export const isExternal = (o: Pick<Order, 'fulfil'>) => o.fulfil === 'external';

/** What the job costs us: our booster's payout, or the seller amount in TL. */
export const costTL = (o: Pick<Order, 'fulfil' | 'vcost' | 'vcur' | 'rate' | 'payout'>) =>
  isExternal(o) ? Math.round((Number(o.vcost) || 0) * (o.vcur === '₺' ? 1 : (Number(o.rate) || 41))) : o.payout;

/** "Kalan kâr" — what is left after the marketplace commission and whoever
    fulfilled the job. This is the figure a partnership splits. */
export const profit = (o: Order) => netRevenue(o) - costTL(o);

/* ---- partnerships -------------------------------------------------------
   Orders are split two ways by where they came from:

     GameBoost  -> 100% reXs
     Eldorado   -> 50/50 reXs / TZX, on the remaining profit

   The partner is derived from the marketplace, not stored per order, so
   there is nothing to keep in sync. Adding a partner later means one entry
   here. A loss splits the same way a gain does. */

export interface PartnerRule {
  name: string;
  /** Percent of `profit` the partner takes. */
  sharePct: number;
}

export const PARTNERS: Record<string, PartnerRule> = {
  Eldorado: { name: 'TZX', sharePct: 50 },
};

export const partnerOf = (o: Pick<Order, 'platform'>): PartnerRule | null =>
  PARTNERS[o.platform] ?? null;

/** The partner's cut of this order, 0 when it is wholly ours. */
export function partnerShare(o: Order): number {
  const p = partnerOf(o);
  return p ? Math.round(profit(o) * p.sharePct / 100) : 0;
}

/** What actually lands with reXs after the partner takes their cut. */
export const ownProfit = (o: Order) => profit(o) - partnerShare(o);

/** Bucket label for grouping and filtering. */
export const partnerBucket = (o: Pick<Order, 'platform'>) => partnerOf(o)?.name ?? 'own';

/** 0-100. Tracked rank jobs use the ladder position; everything else falls
    back to the status, because nobody reports partial progress there. */
export function progress(o: Order): number {
  if (o.status === 'tamam') return 100;
  if (o.type !== 'rank') return o.status === 'devam' ? 50 : o.status === 'atandi' ? 10 : 0;

  const R = G(o.game).ladder;
  const a = R.indexOf(o.from);
  const b = R.indexOf(o.to);
  const c = R.indexOf(o.current);
  if (a < 0 || b <= a) return 0;
  return Math.max(0, Math.min(100, Math.round(((c - a) + o.currentRR / 100) / (b - a) * 100)));
}

export function routeOf(o: Pick<Order, 'type' | 'from' | 'to' | 'count'>): string {
  if (o.type === 'netwin') return `${o.from} · ${o.count} Net Win`;
  if (o.type === 'placement') return `${o.from} · ${o.count} Placement`;
  return `${o.from} → ${o.to}`;
}

/** Who is doing the job: our booster, the outsourced seller, or nobody yet. */
export const doerOf = (o: Order) => (isExternal(o) ? `↗ ${o.vendor}` : o.booster || '⚠ unassigned');

export const nextStatus = (s: Status) => NEXT[s];
export const statusLabel = (s: Status) => ST[s].label;

/** Table / card sub-line: marketplace · outsourced · late · extras or region. */
export const subLine = (o: Order) =>
  `${o.platform}${isExternal(o) ? ' · outsourced' : ''}${o.late ? ' · late' : ''} · ${o.extras.length ? o.extras.join(', ') : o.region}`;

/** "Plat 2 · 61 RR · %48" for rank jobs, "8 matches, 4 done" otherwise. */
export function progressLabel(o: Order): string {
  const p = progress(o);
  if (o.status === 'tamam') return 'delivered';
  if (o.type === 'rank') {
    return `${o.current}${o.tracked ? ` · ${o.currentRR} RR` : ''} · %${p}`;
  }
  return `${o.count} matches, ${Math.round(o.count * p / 100)} done`;
}

export interface OrderFilters {
  status?: string;
  game?: string;
  src?: string;
  q?: string;
  /** Partner bucket: 'own' (GameBoost) or a partner name such as 'TZX'. */
  partner?: string;
  /** Extra lenses the Overview alert rows link into. */
  late?: boolean;
  unpaid?: boolean;
  nofinance?: boolean;
}

export function filterOrders(orders: Order[], f: OrderFilters): Order[] {
  const q = (f.q || '').trim().toLowerCase();
  return orders.filter((o) => {
    if (f.status && o.status !== f.status) return false;
    if (f.game && f.game !== 'all' && o.game !== f.game) return false;
    if (f.src === 'internal' && isExternal(o)) return false;
    if (f.src === 'external' && !isExternal(o)) return false;
    if (f.partner && partnerBucket(o) !== f.partner) return false;
    if (f.late && !o.late) return false;
    if (f.unpaid && (isExternal(o) ? o.vpaid : o.paid)) return false;
    if (f.nofinance && o.cost !== 0) return false;
    if (!q) return true;
    return [routeOf(o), o.booster, o.vendor, o.riotId, o.platform].join(' ').toLowerCase().includes(q);
  });
}
