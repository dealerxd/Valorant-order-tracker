'use server';

/* Every mutation the panel makes. Ported from sb-store.js's write half.

   Two rules hold throughout:
   - status changes always append an order_activity row, whichever of the
     three entry points (drawer, bulk bar, board drag) triggered them;
   - revalidatePath('/', 'layout') refreshes the shell too, because the
     sidebar badges and the notification bell are derived from orders. */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import { getProfile } from './orders';
import { CUR_CODE, GAME_OUT, NEXT, ST, type Currency, type GameKey, type Status } from './domain';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const ok: ActionResult = { ok: true };
const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

async function requireUser() {
  const me = await getProfile();
  if (!me) redirect('/login');
  return me;
}

async function log(orderIds: string[], kind: string, text: string, actorId: string) {
  const sb = await createClient();
  await sb.from('order_activity').insert(
    orderIds.map((order_id) => ({ order_id, actor_id: actorId, kind, text })),
  );
}

function refresh() {
  revalidatePath('/', 'layout');
}

/* ---- status ------------------------------------------------------------- */

export async function setStatus(ids: string[], status: Status, note?: string): Promise<ActionResult> {
  const me = await requireUser();
  const sb = await createClient();
  try {
    const { error } = await sb.from('resells').update({ durum: status }).in('id', ids);
    if (error) throw error;
    await log(ids, status, note ?? `Status set to ${ST[status].label}`, me.id);
    refresh();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/** Advance each order one step along yeni → atandi → devam → tamam.
    Orders already at `tamam` are left alone. */
export async function advance(orders: { id: string; status: Status }[]): Promise<ActionResult> {
  const me = await requireUser();
  const sb = await createClient();
  try {
    const moves = orders
      .map((o) => ({ id: o.id, next: NEXT[o.status] }))
      .filter((m): m is { id: string; next: Status } => !!m.next);
    if (!moves.length) return ok;

    // Group by target status so each distinct move is a single request.
    const byNext = new Map<Status, string[]>();
    moves.forEach((m) => byNext.set(m.next, [...(byNext.get(m.next) || []), m.id]));

    for (const [next, ids] of byNext) {
      const { error } = await sb.from('resells').update({ durum: next }).in('id', ids);
      if (error) throw error;
      await log(ids, next, `Advanced to ${ST[next].label}`, me.id);
    }
    refresh();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/* ---- assignment --------------------------------------------------------- */

export async function assign(ids: string[], boosterId: string): Promise<ActionResult> {
  const me = await requireUser();
  const sb = await createClient();
  try {
    const { data: p } = await sb.from('profiles').select('display_name').eq('id', boosterId).maybeSingle();
    const { error } = await sb.from('resells').update({ booster_id: boosterId, durum: 'atandi' }).in('id', ids);
    if (error) throw error;
    await log(ids, 'atandi', `Assigned to ${p?.display_name ?? 'booster'}`, me.id);
    refresh();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/* ---- money -------------------------------------------------------------- */

export async function setPaid(ids: string[], paid: boolean): Promise<ActionResult> {
  const me = await requireUser();
  const sb = await createClient();
  try {
    const { error } = await sb.from('resells').update({ paid }).in('id', ids);
    if (error) throw error;
    await log(ids, 'note', paid ? 'Marked paid' : 'Marked unpaid', me.id);
    refresh();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function setVendorPaid(ids: string[], paid: boolean): Promise<ActionResult> {
  const me = await requireUser();
  const sb = await createClient();
  try {
    const { error } = await sb.from('resells').update({ vendor_paid: paid }).in('id', ids);
    if (error) throw error;
    await log(ids, 'note', paid ? 'Seller paid' : 'Seller marked unpaid', me.id);
    refresh();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function archive(ids: string[]): Promise<ActionResult> {
  const me = await requireUser();
  const sb = await createClient();
  try {
    const { error } = await sb.from('resells').update({ archived: true }).in('id', ids);
    if (error) throw error;
    await log(ids, 'note', 'Archived', me.id);
    refresh();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/** Settle a payout period: record a `payouts` row per booster and flip `paid`
    on the completed orders it covers. */
export async function payBoosters(
  boosterIds: string[],
  vendorOrderIds: string[],
  period: { start: string; end: string },
): Promise<ActionResult> {
  const me = await requireUser();
  if (me.role !== 'admin') return { ok: false, error: 'admin only' };
  const sb = await createClient();

  try {
    for (const boosterId of boosterIds) {
      const { data: rows, error: readErr } = await sb
        .from('resells')
        .select('id,booster_payout')
        .eq('booster_id', boosterId)
        .eq('durum', 'tamam')
        .eq('paid', false)
        .eq('archived', false);
      if (readErr) throw readErr;

      const covered = (rows || []) as { id: string; booster_payout: number | null }[];
      if (!covered.length) continue;

      const amount = covered.reduce((a, r) => a + (Number(r.booster_payout) || 0), 0);

      const { error: payErr } = await sb.from('payouts').insert({
        booster_id: boosterId,
        period_start: period.start,
        period_end: period.end,
        amount_tl: amount,
        method: 'IBAN',
        paid_at: new Date().toISOString(),
      });
      if (payErr) throw payErr;

      const { error: flipErr } = await sb
        .from('resells')
        .update({ paid: true })
        .in('id', covered.map((r) => r.id));
      if (flipErr) throw flipErr;

      await log(covered.map((r) => r.id), 'note', `Payout sent · ₺${amount.toLocaleString('en-US')}`, me.id);
    }

    if (vendorOrderIds.length) {
      const { error } = await sb.from('resells').update({ vendor_paid: true }).in('id', vendorOrderIds);
      if (error) throw error;
      await log(vendorOrderIds, 'note', 'Seller paid', me.id);
    }

    refresh();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/* ---- notes -------------------------------------------------------------- */

/** Notes go to resell_comments, not order_activity. That table predates the
    activity log, already has its own policies (author must be the admin or
    the assigned booster) and is what the Python side reads. order_activity
    stays for status and system events; the drawer merges both streams. */
export async function addNote(orderId: string, text: string): Promise<ActionResult> {
  const me = await requireUser();
  const body = text.trim();
  if (!body) return ok;
  const sb = await createClient();
  try {
    const { error } = await sb.from('resell_comments').insert({
      order_id: orderId, author_id: me.id, body,
    });
    if (error) throw error;
    refresh();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/* ---- screenshots -------------------------------------------------------- */

/** Board drop zone: store the file, point resells.image at it and mark the
    job Done. Bucket `screenshots` must exist in Supabase Storage. */
export async function uploadScreenshot(orderId: string, form: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const file = form.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'no file' };

  const sb = await createClient();
  try {
    const ext = file.name.split('.').pop() || 'png';
    const path = `${orderId}/${Date.now()}.${ext}`;

    const { error: upErr } = await sb.storage.from('screenshots').upload(path, file, {
      contentType: file.type || 'image/png',
      upsert: false,
    });
    if (upErr) throw upErr;

    const { error } = await sb.from('resells').update({ image: path, durum: 'tamam' }).eq('id', orderId);
    if (error) throw error;

    await log([orderId], 'tamam', `Finish screenshot added (${file.name}) — job marked Done`, me.id);
    refresh();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/* ---- new order ---------------------------------------------------------- */

export interface NewOrderInput {
  game: GameKey;
  type: 'rank' | 'netwin' | 'placement' | 'custom';
  from: string;
  to: string;
  count: number;
  region: string;
  startRR: number;
  riotId: string;
  extras: string[];
  /** Admin-only finance block. */
  platform: string;
  cost: number;
  cur: Currency;
  feePct: number;
  rate: number;
  /** Who fulfils it. */
  fulfil: 'internal' | 'external';
  boosterId: string;
  vendor: string;
  vcost: number;
  vcur: Currency;
  vpaid: boolean;
  /** Booster fee in TL, computed from the price list. */
  payout: number;
}

export async function createOrder(input: NewOrderInput): Promise<ActionResult & { id?: string }> {
  const me = await requireUser();
  const isBooster = me.role !== 'admin';
  const external = !isBooster && input.fulfil === 'external';
  const sb = await createClient();

  try {
    const boosterId = isBooster ? me.id : external ? null : (input.boosterId || null);

    const row: Record<string, unknown> = {
      game: GAME_OUT[input.game] || 'valorant',
      order_type: input.type,
      baslangic: input.from,
      hedef: input.type === 'rank' ? input.to : '',
      win_count: input.type === 'rank' ? 0 : Number(input.count) || 0,
      start_rr: Number(input.startRR) || 0,
      region: input.region,
      riot_id: input.riotId || '',
      extras: input.extras || [],
      durum: boosterId || external ? 'atandi' : 'yeni',
      tarih: new Date().toISOString().slice(0, 10),
      booster_payout: external ? 0 : input.payout,
      paid: false,
      archived: false,
      booster_id: boosterId,
      vendor: external ? (input.vendor || 'seller') : null,
      vendor_cost: external ? Number(input.vcost) || 0 : null,
      vendor_currency: external ? CUR_CODE[input.vcur] : null,
      vendor_paid: external ? !!input.vpaid : false,
    };

    const { data, error } = await sb.from('resells').insert(row).select('id').single();
    if (error) throw error;
    const id = (data as { id: string }).id;

    // Boosters never enter finance; the admin fills it in later.
    const cost = isBooster ? 0 : Number(input.cost) || 0;
    if (cost > 0) {
      const rate = Number(input.rate) || 0;
      const { error: fe } = await sb.from('order_finance').upsert({
        order_id: id,
        platform: input.platform || '',
        platform_ref: '',
        cost,
        cost_currency: CUR_CODE[input.cur] || 'USD',
        fee_pct: Number(input.feePct) || 0,
        cost_tl: Math.round(cost * (input.cur === '₺' ? 1 : rate)),
        rate,
      });
      if (fe) throw fe;
    }

    const how = isBooster
      ? ' · booster added their own job'
      : external
        ? ` · outsourced: ${input.vendor || 'seller'} · ${input.vcur}${input.vcost || 0}`
        : ` · ${input.platform || 'manual'}`;
    await log([id], 'yeni', `Order created${how}`, me.id);

    refresh();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

/* ---- pricing ------------------------------------------------------------ */

/** Merge this game's step prices into the shared row — never overwrite the
    other games' maps. */
export async function saveStepPrices(game: GameKey, map: Record<string, number>): Promise<ActionResult> {
  const me = await requireUser();
  if (me.role !== 'admin') return { ok: false, error: 'admin only' };
  const sb = await createClient();

  try {
    const { data } = await sb.from('pricing').select('data').eq('id', 'step_prices').maybeSingle();
    const existing = (data?.data as Record<string, unknown>) || {};

    // A legacy flat map means Valorant; nest it before merging.
    const values = Object.values(existing);
    const nested = values.length > 0 && values.every((x) => x && typeof x === 'object' && !Array.isArray(x));
    const base = nested ? existing : { valorant: existing };

    const merged = { ...base, [GAME_OUT[game]]: map };

    const { error } = await sb.from('pricing').upsert({
      id: 'step_prices', data: merged, updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    refresh();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/* ---- auth --------------------------------------------------------------- */

export async function signIn(_prev: unknown, form: FormData): Promise<{ error?: string; message?: string }> {
  const email = String(form.get('email') || '');
  const password = String(form.get('password') || '');
  if (!email || !password) return { error: 'E-mail and password required.' };

  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  refresh();
  redirect(String(form.get('next') || '/overview'));
}

export async function signUp(_prev: unknown, form: FormData): Promise<{ error?: string; message?: string }> {
  const email = String(form.get('email') || '');
  const password = String(form.get('password') || '');
  const display_name = String(form.get('display_name') || '');
  const invite_code = String(form.get('invite_code') || '');

  if (!email || !password) return { error: 'E-mail and password required.' };
  if (!invite_code) return { error: 'An invite code from the admin is required.' };

  const sb = await createClient();
  const { error } = await sb.auth.signUp({
    email, password, options: { data: { display_name, invite_code } },
  });
  if (error) return { error: error.message };

  return { message: 'Account created — sign in now.' };
}

export async function signOut() {
  const sb = await createClient();
  await sb.auth.signOut();
  refresh();
  redirect('/login');
}
