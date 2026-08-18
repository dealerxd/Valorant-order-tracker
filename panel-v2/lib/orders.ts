import 'server-only';

/* Queries and row -> view mapping. Ported from sb-store.js almost 1:1.

   The view-model types and every derived value live in lib/model.ts, which
   the client components import too. This file is the only place that talks
   to Supabase.

   Changes from the prototype's data layer:
   - Outsourcing reads from the real vendor / vendor_cost / vendor_currency /
     vendor_paid columns. OUT_RX stays only as a fallback for rows written
     before the migration backfilled them.
   - Activity comes from order_activity. deriveActivity() is kept as the
     fallback for orders that predate that table.
   - Every read is scoped by RLS, so boosters get an empty order_finance set
     without the client having to ask for one. */

import { cache } from 'react';
import { createClient } from './supabase/server';
import {
  CUR, G, GAME_KEYS, GAMES, rankFromElo,
  type Currency, type GameKey, type OrderType, type Status,
} from './domain';
import { DAY, ago, shortDate } from './format';
import { unnest, type PricingTables } from './pricing';
import type { ActivityEntry, Booster, Notif, Order, Profile } from './model';

export * from './model';

const OUT_RX = /#outsourced\s+([^|\n]*)\|([0-9.]*)\|([^|\n]*)\|([01])/;

export interface PanelData {
  me: Profile;
  isAdmin: boolean;
  orders: Order[];
  boosters: Booster[];
  notifs: Notif[];
  pricing: PricingTables;
  /** Latest USD/EUR -> TRY rates, written by /api/fx. */
  fx: Record<string, number>;
  syncedAt: string;
}

interface ResellRow {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  game: GameKey | null;
  order_type: OrderType | null;
  baslangic: string | null;
  hedef: string | null;
  win_count: number | null;
  start_rr: number | null;
  region: string | null;
  riot_id: string | null;
  extras: string[] | null;
  durum: string | null;
  tarih: string | null;
  note: string | null;
  image: string | null;
  booster_id: string | null;
  booster_payout: number | null;
  paid: boolean | null;
  archived: boolean | null;
  vendor: string | null;
  vendor_cost: number | null;
  vendor_currency: string | null;
  vendor_paid: boolean | null;
  /** Marketplace, now stored on the order itself — see migration 007. */
  platform: string | null;
  /* Real lifecycle timestamps the database already keeps — preferred over
     guessing from created_at. */
  assigned_at: string | null;
  completed_at: string | null;
  paid_at: string | null;
  due_at: string | null;
}

/** Team-internal notes. Predates order_activity and has its own policies,
    so notes keep living here and the drawer merges the two streams. */
interface CommentRow {
  order_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

interface FinanceRow {
  order_id: string;
  platform: string | null;
  platform_ref: string | null;
  cost: number | null;
  cost_currency: 'USD' | 'EUR' | 'TRY' | null;
  fee_pct: number | null;
  cost_tl: number | null;
  rate: number | null;
}

interface TrackerRow {
  order_id: string;
  current_elo: number | null;
  start_elo: number | null;
  target_elo: number | null;
  last_match_at: string | null;
  paused: boolean | null;
}

interface ActivityRow {
  order_id: string;
  kind: string | null;
  text: string | null;
  created_at: string;
  actor_id: string | null;
}

/* ---- mapping ------------------------------------------------------------ */

function mapOrder(
  r: ResellRow,
  profiles: Record<string, Profile>,
  f: FinanceRow | undefined,
  t: TrackerRow | undefined,
  acts: ActivityRow[] | undefined,
  comments: CommentRow[] | undefined,
  isAdmin: boolean,
  now: number,
): Order {
  const fin = f ?? ({} as FinanceRow);
  const note = r.note || '';

  // Prefer the real columns; fall back to the legacy note tag for rows the
  // migration has not touched.
  const legacy = OUT_RX.exec(note);
  const hasVendorCol = !!(r.vendor && r.vendor.trim());
  const external = hasVendorCol || !!legacy;

  // resells.game already stores the contract's ids, so there is nothing to
  // translate — only guard against a value the contract does not know.
  const game: GameKey = r.game && GAMES[r.game] ? r.game : 'valorant';
  const tracked = G(game).tracker;

  const rate = Number(fin.rate) || 0;
  const cur = CUR[fin.cost_currency || 'USD'] || '$';

  const nowRank = t && t.current_elo != null ? rankFromElo(t.current_elo) : null;
  const created = r.created_at || null;
  const ageDays = created ? (now - new Date(created).getTime()) / DAY : 0;

  const doneStatus = r.durum === 'tamam' || r.durum === 'odendi';
  const staleDays = t && t.last_match_at ? (now - new Date(t.last_match_at).getTime()) / DAY : null;

  // Prefer the real due date when the order carries one; the handoff's
  // "older than 5 days" rule is the fallback for rows without it.
  const dueAt = r.due_at ? new Date(`${r.due_at}T23:59:59Z`).getTime() : null;
  const overdue = dueAt != null ? now > dueAt : ageDays > 5;
  const late = !doneStatus && (overdue || (staleDays != null && staleDays > 2));

  const daysLeft = dueAt != null ? (dueAt - now) / DAY : 5 - ageDays;
  const dueLabel = doneStatus
    ? 'delivered'
    : late
      ? `${Math.max(1, Math.ceil(-daysLeft))} days late`
      : `${Math.max(1, Math.ceil(daysLeft))} days left`;

  const o: Order = {
    id: r.id,
    game,
    type: r.order_type || 'rank',
    from: r.baslangic || '',
    to: r.order_type === 'rank' ? (r.hedef || '') : '',
    count: Number(r.win_count) || 0,
    current: nowRank ? nowRank.label : (doneStatus && r.hedef ? r.hedef : r.baslangic || ''),
    currentRR: nowRank ? nowRank.rr : Number(r.start_rr) || 0,
    startRR: Number(r.start_rr) || 0,
    region: r.region || 'TR',
    riotId: r.riot_id || '—',
    booster: r.booster_id && profiles[r.booster_id] ? (profiles[r.booster_id].display_name || '') : '',
    boosterId: r.booster_id || null,
    // Who actually did it decides who owns the Eldorado profit.
    doerRole: r.booster_id && profiles[r.booster_id] ? profiles[r.booster_id].role : null,
    fulfil: external ? 'external' : 'internal',
    vendor: hasVendorCol ? r.vendor!.trim() : legacy ? legacy[1].trim() : '',
    vcost: hasVendorCol ? Number(r.vendor_cost) || 0 : legacy ? Number(legacy[2]) || 0 : 0,
    vcur: hasVendorCol
      ? (CUR[(r.vendor_currency as 'USD' | 'EUR' | 'TRY') || 'USD'] || '$')
      : legacy
        ? ((legacy[3].trim() || '$') as Currency)
        : '$',
    vpaid: hasVendorCol ? !!r.vendor_paid : legacy ? legacy[4] === '1' : false,
    status: (r.durum === 'odendi' ? 'tamam' : (r.durum || 'yeni')) as Status,
    cost: Number(fin.cost) || 0,
    cur,
    feePct: Number(fin.fee_pct) || 0,
    rate: rate || 41,
    payout: Number(r.booster_payout) || 0,
    paid: !!r.paid,
    tarih: r.tarih ? shortDate(r.tarih) : shortDate(created),
    createdAt: created,
    completedAt: r.completed_at,
    // resells.platform is the source of truth; order_finance.platform is kept
    // for finance reporting and only used as a fallback for legacy rows.
    platform: r.platform || fin.platform || 'Other',
    extras: Array.isArray(r.extras) ? r.extras : [],
    shot: r.image ? 'screenshot' : null,
    due: dueLabel,
    late,
    tracked,
    matches: [],
    noteText: note.replace(OUT_RX, '').trim(),
    activity: [],
    financeHidden: !isAdmin,
  };

  const who = (id: string | null) =>
    (id && profiles[id] ? (profiles[id].display_name || 'user') : 'system');

  // Two streams, newest first: status events from order_activity and notes
  // from resell_comments, which predates it and is still where notes live.
  const merged = [
    ...(acts || []).map((a) => ({
      at: a.created_at,
      entry: {
        text: a.text || '',
        who: who(a.actor_id),
        time: ago(a.created_at, now),
        k: (a.kind || 'note') as ActivityEntry['k'],
      },
    })),
    ...(comments || []).map((c) => ({
      at: c.created_at,
      entry: {
        text: c.body,
        who: who(c.author_id),
        time: ago(c.created_at, now),
        k: 'note' as const,
      },
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  o.activity = merged.length ? merged.map((m) => m.entry) : deriveActivity(o, r, t, now);

  return o;
}

/** Fallback timeline for orders written before order_activity existed. */
function deriveActivity(o: Order, r: ResellRow, t: TrackerRow | undefined, now: number): ActivityEntry[] {
  const a: ActivityEntry[] = [];
  if (o.status === 'tamam' && o.paid) {
    a.push({ text: `Payment sent · ₺${o.payout.toLocaleString('en-US')}`, who: 'admin', time: ago(r.updated_at || r.created_at, now), k: 'tamam' });
  }
  if (t && t.current_elo != null && t.last_match_at) {
    a.push({ text: `${o.current} · ${o.currentRR} RR`, who: 'tracker bot', time: ago(t.last_match_at, now), k: o.status === 'tamam' ? 'tamam' : 'devam' });
  }
  if (o.noteText) a.push({ text: o.noteText, who: 'note', time: '', k: 'note' });
  if (o.fulfil === 'external') a.push({ text: `Outsourced to ${o.vendor} · ${o.vcur}${o.vcost}`, who: 'admin', time: '', k: 'atandi' });
  if (!o.booster && o.fulfil !== 'external') a.push({ text: 'Waiting for a booster', who: 'system', time: '', k: 'warn' });
  else if (o.booster) a.push({ text: `Assigned to ${o.booster}`, who: 'admin', time: '', k: 'atandi' });
  if (!o.cost && !o.financeHidden) a.push({ text: 'Boost price missing — profit cannot be computed', who: 'system', time: '', k: 'warn' });
  a.push({ text: `Order created${o.platform && o.platform !== 'Other' ? ` · ${o.platform}` : ''}`, who: '', time: ago(r.created_at, now), k: 'yeni' });
  return a;
}

/** Mean created_at -> completed_at over the jobs that actually finished.
    Orders without a completion timestamp are excluded rather than measured
    against "now", which would inflate the figure every time the page loads. */
export function averageTurnaround(orders: Order[]): string {
  const spans = orders
    .map((o) => (o.createdAt && o.completedAt
      ? (new Date(o.completedAt).getTime() - new Date(o.createdAt).getTime()) / DAY
      : null))
    .filter((x): x is number => x != null && x >= 0);

  return spans.length ? `${(spans.reduce((s, x) => s + x, 0) / spans.length).toFixed(1)} d` : '—';
}

function mapBoosters(profiles: Record<string, Profile>, orders: Order[]): Booster[] {
  return Object.values(profiles)
    .filter((p) => p.role !== 'admin')
    .map((p) => {
      const mine = orders.filter((o) => o.boosterId === p.id);
      const open = mine.filter((o) => o.status !== 'tamam');
      const done = mine.filter((o) => o.status === 'tamam');
      const played = [...new Set(mine.map((o) => o.game))];

      // profiles.games holds the games this booster covers; fall back to the
      // games they have actually worked, then to Valorant.
      const declared = (p.games || []).filter((g): g is GameKey => GAME_KEYS.includes(g as GameKey));
      const games: GameKey[] = declared.length ? declared : played.length ? played : ['valorant'];

      const avg = averageTurnaround(done);

      return {
        id: p.id,
        name: p.display_name || '—',
        initial: (p.display_name || '?')[0].toUpperCase(),
        rankRange: played.length ? `${played.length} games` : '—',
        games,
        active: open.length,
        cap: Number(p.capacity) || 3,
        done: done.length,
        avg,
        late: mine.filter((o) => o.late).length,
        earned: mine.reduce((a, o) => a + o.payout, 0),
        debt: mine.filter((o) => !o.paid && o.status === 'tamam').reduce((a, o) => a + o.payout, 0),
        iban: p.iban || '',
        on: p.active !== false,
      };
    });
}

function mapNotifs(orders: Order[], isAdmin: boolean): Notif[] {
  const n: Notif[] = [];
  const route = (o: Order) => `${o.from} → ${o.to || o.count}`;

  orders.filter((o) => o.late).forEach((o) =>
    n.push({ id: `l${o.id}`, icon: 'late', text: `${route(o)} is late — ${o.due}`, time: '', unread: true }));

  orders.filter((o) => !o.booster && o.fulfil !== 'external').forEach((o) =>
    n.push({ id: `u${o.id}`, icon: 'unassigned', text: `${route(o)} has no booster assigned`, time: o.tarih, unread: true }));

  orders.filter((o) => o.status === 'tamam' && !o.paid && o.payout > 0).forEach((o) =>
    n.push({ id: `p${o.id}`, icon: 'payment', text: `${o.booster} is owed ₺${o.payout.toLocaleString('en-US')} for ${route(o)}`, time: o.tarih, unread: true }));

  if (isAdmin) {
    orders.filter((o) => !o.cost).forEach((o) =>
      n.push({ id: `f${o.id}`, icon: 'finance', text: `${route(o)} has no finance entered`, time: o.tarih, unread: false }));
  }

  return n.slice(0, 20);
}

/* ---- queries ------------------------------------------------------------ */

export const getProfile = cache(async (): Promise<Profile | null> => {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return (data as Profile) ?? { id: user.id, display_name: user.email ?? null, role: 'booster' };
});

/** Everything the panel shell and all five sections need, in one round trip.
    Wrapped in cache() so the layout and the page it renders share a single
    execution per request instead of querying twice. */
export const loadPanel = cache(async (): Promise<PanelData | null> => {
  const sb = await createClient();

  const me = await getProfile();
  if (!me) return null;
  const isAdmin = me.role === 'admin';

  const [oRes, pRes, fRes, tRes, aRes, cRes, priceRes, fxRes] = await Promise.all([
    sb.from('resells').select('*').eq('archived', false).order('created_at', { ascending: false }),
    sb.from('profiles').select('*').order('display_name'),
    // RLS already hides this from boosters; skipping the request saves a hop.
    isAdmin ? sb.from('order_finance').select('*') : Promise.resolve({ data: [], error: null }),
    sb.from('tracker_state').select('order_id,current_elo,start_elo,target_elo,last_match_at,paused'),
    sb.from('order_activity').select('order_id,kind,text,created_at,actor_id').order('created_at', { ascending: false }).limit(400),
    sb.from('resell_comments').select('order_id,author_id,body,created_at').order('created_at', { ascending: false }).limit(400),
    sb.from('pricing').select('*'),
    // fx_rates is the tracker bot's daily write — the panel is a reader.
    sb.from('fx_rates').select('currency,rate,as_of').order('as_of', { ascending: false }),
  ]);

  if (oRes.error) throw new Error(oRes.error.message);

  const profiles: Record<string, Profile> = {};
  ((pRes.data as Profile[]) || []).forEach((p) => { profiles[p.id] = p; });

  const finance: Record<string, FinanceRow> = {};
  ((fRes.data as FinanceRow[]) || []).forEach((f) => { finance[f.order_id] = f; });

  const tracker: Record<string, TrackerRow> = {};
  ((tRes.data as TrackerRow[]) || []).forEach((t) => { tracker[t.order_id] = t; });

  const activity: Record<string, ActivityRow[]> = {};
  ((aRes.data as ActivityRow[]) || []).forEach((a) => {
    (activity[a.order_id] ||= []).push(a);
  });

  const comments: Record<string, CommentRow[]> = {};
  ((cRes.data as CommentRow[]) || []).forEach((c) => {
    (comments[c.order_id] ||= []).push(c);
  });

  const pricing: PricingTables = { step: {}, netWin: {}, settings: {} };
  ((priceRes.data as { id: string; data: unknown }[]) || []).forEach((p) => {
    if (p.id === 'step_prices') pricing.step = unnest(p.data);
    if (p.id === 'net_win') pricing.netWin = unnest(p.data);
    if (p.id === 'settings') pricing.settings = (p.data as Record<string, unknown>) || {};
  });

  // Rows come newest-first, so the first sighting of each currency wins.
  const fx: Record<string, number> = { TRY: 1 };
  ((fxRes.data as { currency: string; rate: number }[]) || []).forEach((row) => {
    if (fx[row.currency] == null) fx[row.currency] = Number(row.rate);
  });

  const now = Date.now();
  const orders = ((oRes.data as ResellRow[]) || []).map((r) =>
    mapOrder(r, profiles, finance[r.id], tracker[r.id], activity[r.id], comments[r.id], isAdmin, now));

  return {
    me,
    isAdmin,
    orders,
    boosters: mapBoosters(profiles, orders),
    notifs: mapNotifs(orders, isAdmin),
    pricing,
    fx,
    syncedAt: new Date(now).toISOString(),
  };
});

/** Last 20 match results for the drawer, oldest first. */
export async function loadMatches(orderId: string): Promise<('W' | 'L')[]> {
  const sb = await createClient();
  const { data } = await sb
    .from('tracker_matches')
    .select('rr_change,played_at')
    .eq('order_id', orderId)
    .order('played_at', { ascending: false })
    .limit(20);

  return ((data as { rr_change: number | null }[]) || [])
    .map((m) => ((Number(m.rr_change) || 0) >= 0 ? 'W' : 'L') as 'W' | 'L')
    .reverse();
}
