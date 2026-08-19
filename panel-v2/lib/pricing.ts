/* Step prices and the quote calculator.

   `suggestPayout` is the prototype's function verbatim: walk the ladder from
   `from` to `to`, sum the per-division step price, subtract the slice of the
   first division the account has already climbed (startRR), then apply the
   extras multiplier and the region uplift. */

import { EXTRAS, G, regionMultiplier, type GameKey } from './domain';

export interface PricingTables {
  /** step_prices: { [dbGame]: { [rank]: price } } */
  step: Record<string, Record<string, number>>;
  /** net_win: { [dbGame]: { [rank]: pricePerWin } } */
  netWin: Record<string, Record<string, number>>;
  settings: Record<string, unknown>;
}

export const EMPTY_PRICING: PricingTables = { step: {}, netWin: {}, settings: {} };

/** Legacy rows stored a flat { rank: price } object, meaning Valorant.
    Nest those under `valorant` so every read can assume the per-game shape. */
export function unnest(d: unknown): Record<string, Record<string, number>> {
  const obj = (d ?? {}) as Record<string, unknown>;
  const v = Object.values(obj);
  const nested = v.length > 0 && v.every((x) => x && typeof x === 'object' && !Array.isArray(x));
  return nested
    ? (obj as Record<string, Record<string, number>>)
    : { valorant: obj as Record<string, number> };
}

export interface PayoutInput {
  game: GameKey;
  type: string;
  from: string;
  to: string;
  count: number | string;
  startRR: number | string;
  region: string;
  extras: string[];
}

export const extrasMultiplier = (extras: string[] | undefined) =>
  (extras || []).reduce((m, l) => m * ((EXTRAS.find((e) => e[0] === l) || ['', 1])[1] as number), 1);

/** Booster fee in TL, from the price list. */
export function suggestPayout(f: PayoutInput): number {
  const g = G(f.game);
  const L = g.ladder;
  const S = g.step;

  if (f.type === 'netwin' || f.type === 'placement') {
    // A net win is worth ~45% of a full division at that rank; a placement
    // match is worth half of a net win.
    const unit = Math.round((S[(f.from || '').split(' ')[0]] || 300) * 0.45 * (f.type === 'placement' ? 0.5 : 1));
    return Math.round(unit * Math.max(1, Number(f.count) || 1) * extrasMultiplier(f.extras));
  }

  const a = L.indexOf(f.from);
  const b = L.indexOf(f.to);
  if (a < 0 || b <= a) return 0;

  let sum = 0;
  for (let i = a; i < b; i++) sum += S[L[i].split(' ')[0]] || 300;
  sum -= Math.round((S[L[a].split(' ')[0]] || 300) * (Number(f.startRR) || 0) / 100);

  const regionMult = regionMultiplier(f.region);
  return Math.round(sum * extrasMultiplier(f.extras) * regionMult);
}

/** Booster fee taken from the saved price list when the game has one, falling
    back to the built-in ladder defaults. */
export function payoutFromTables(f: PayoutInput, tables: PricingTables): number {
  const map = tables.step[f.game];
  if (!map || !Object.keys(map).length) return suggestPayout(f);

  const L = G(f.game).ladder;
  const a = L.indexOf(f.from);
  const b = L.indexOf(f.to);

  if (f.type === 'netwin' || f.type === 'placement') {
    const perWin = tables.netWin[f.game]?.[f.from];
    if (perWin == null) return suggestPayout(f);
    const unit = Number(perWin) * (f.type === 'placement' ? 0.5 : 1);
    return Math.round(unit * Math.max(1, Number(f.count) || 1) * extrasMultiplier(f.extras));
  }

  if (a < 0 || b <= a) return 0;
  let sum = 0;
  for (let i = a; i < b; i++) {
    const priced = map[L[i]];
    sum += priced != null ? Number(priced) : (G(f.game).step[L[i].split(' ')[0]] || 300);
  }
  const first = map[L[a]] != null ? Number(map[L[a]]) : (G(f.game).step[L[a].split(' ')[0]] || 300);
  sum -= Math.round(first * (Number(f.startRR) || 0) / 100);

  const regionMult = regionMultiplier(f.region);
  return Math.round(sum * extrasMultiplier(f.extras) * regionMult);
}

export interface Quote {
  boosterFee: number;
  marginPct: number;
  margin: number;
  marketFeePct: number;
  marketFee: number;
  /** Price to list, in TL. */
  totalTL: number;
  /** Same, converted with `rate` and rounded to a listable figure. */
  listed: number;
}

/** Booster fee + target margin, then gross up for the marketplace cut so the
    listed price still nets the margin after the platform takes its slice. */
export function quote(
  boosterFee: number,
  { marginPct = 45, marketFeePct = 10, rate = 41 } = {},
): Quote {
  const margin = Math.round(boosterFee * marginPct / 100);
  const net = boosterFee + margin;
  const marketFee = Math.round(net * marketFeePct / (100 - marketFeePct));
  const totalTL = net + marketFee;
  return {
    boosterFee,
    marginPct,
    margin,
    marketFeePct,
    marketFee,
    totalTL,
    listed: rate > 0 ? Math.round(totalTL / rate) : totalTL,
  };
}

/** Rows for the Division Prices editor: every ladder step that has a price. */
export function stepRows(game: GameKey, tables: PricingTables) {
  const L = G(game).ladder;
  const map = tables.step[game] || {};
  return L.slice(0, -1).map((rank, i) => ({
    rank,
    label: `${rank} → ${L[i + 1]}`,
    value: map[rank] != null ? Number(map[rank]) : (G(game).step[rank.split(' ')[0]] || 300),
    saved: map[rank] != null,
  }));
}
