/* Games, ladders, statuses, extras.

   The shared half — game ids, rank ladders, region values and multipliers,
   status keys and transitions, elo constants — comes from
   `domain.generated.ts`, which shared/generate.py emits from
   shared/domain.json. Do not hand-copy those lists back into this file:
   panel/, panel-v2/ and tracker/ all write the same `resells` rows, and a
   value that drifts here (a region spelled "Other" instead of "Diğer", say)
   does not fail loudly — the tracker just stops matching the row.

   What lives here is everything the contract deliberately leaves out,
   because it is presentation rather than shared meaning: game accent
   colours, account-field labels, division step prices, and the extras
   multipliers. */

import {
  ELO as ELO_C,
  GAMES as GAMES_C,
  GAME_RANKS,
  NEXT_STATUS,
  RANK_ORDER,
  REGION_MULT,
  REGION_VALUES,
  TIER_NAME,
  type GameId,
} from './domain.generated';

export { ELO_C as ELO, RANK_ORDER, REGION_MULT, REGION_VALUES, TIER_NAME };
export type { GameId };

/** Game ids are the contract's — the same strings `resells.game` stores, so
    nothing has to be translated on the way in or out. */
export type GameKey = GameId;

export type OrderType = 'rank' | 'netwin' | 'placement' | 'custom';
export type Status = 'yeni' | 'atandi' | 'devam' | 'tamam';
/** Legacy `odendi` rows are folded into `tamam` on read. */
export type DbStatus = Status | 'odendi';
export type Currency = '$' | '€' | '₺';
export type CurrencyCode = 'USD' | 'EUR' | 'TRY';

export const CUR: Record<CurrencyCode, Currency> = { USD: '$', EUR: '€', TRY: '₺' };
export const CUR_CODE: Record<Currency, CurrencyCode> = { '$': 'USD', '€': 'EUR', '₺': 'TRY' };

/** Status display. The keys and transitions are the contract's; only these
    English labels and colours are panel-v2's own, because the design
    handoff is in English while the contract labels are Turkish. */
export const ST: Record<Status, { label: string; c: string; rgb: string }> = {
  yeni: { label: 'New', c: '#8b8b95', rgb: '139,139,149' },
  atandi: { label: 'Assigned', c: '#e0a534', rgb: '224,165,52' },
  devam: { label: 'In progress', c: '#5a9ded', rgb: '90,157,237' },
  tamam: { label: 'Done', c: '#3ecf8e', rgb: '62,207,142' },
};

export const STATUSES: Status[] = ['yeni', 'atandi', 'devam', 'tamam'];

/** Advance order, straight from the contract. */
export const NEXT = NEXT_STATUS as Partial<Record<Status, Status>>;

export const ORDER_LABEL: Record<OrderType, string> = {
  rank: 'Rank Boost',
  netwin: 'Net Win',
  placement: 'Placement',
  custom: 'Custom',
};

/** Region values exactly as the contract spells them — note "Diğer", not
    "Other": this string is written to `resells.region` and the tracker
    resolves its API code from it. */
export const REGIONS = REGION_VALUES;
export const PLATFORMS = ['Eldorado', 'GameBoost', 'Other'] as const;

/** Price uplift per region, from the contract rather than guessed. */
export const regionMultiplier = (region: string) => REGION_MULT[region] ?? 1;

/** The catch-all form region — "Diğer" in the current contract. Derived so
    that renaming it in domain.json does not leave a stale literal here. */
export const FALLBACK_REGION =
  REGION_VALUES.find((r) => !['TR', 'EU', 'NA'].includes(r)) ?? REGION_VALUES[REGION_VALUES.length - 1];

/** A region token scraped from a marketplace listing -> a value the form can
    actually select. Regions the contract knows but hides from the form
    (AP, KR, LATAM, BR) collapse onto the catch-all. */
export function normalizeRegion(token: string): string {
  const t = token.toUpperCase();
  if (REGION_VALUES.includes(t)) return t;
  if (t === 'EUW' || t === 'EUNE') return 'EU';
  return FALLBACK_REGION;
}

/* ---- presentation, not contract ---------------------------------------- */

/** Price to climb one division, keyed by the first word of the rank. */
const STEP: Record<GameId, Record<string, number>> = {
  valorant: { Bronze: 180, Silver: 240, Gold: 320, Plat: 400, Diamond: 560, Ascendant: 760, Immortal: 980 },
  ow2: { Bronze: 130, Silver: 170, Gold: 230, Platinum: 310, Diamond: 430, Master: 620, Grandmaster: 880, Champion: 1500 },
  rivals: { Bronze: 150, Silver: 200, Gold: 260, Platinum: 340, Diamond: 460, Grandmaster: 640, Celestial: 900, Eternity: 1400 },
  rl: { Bronze: 120, Silver: 160, Gold: 220, Platinum: 300, Diamond: 420, Champion: 620, Grand: 880, Supersonic: 1600 },
  wildrift: { Iron: 110, Bronze: 140, Silver: 180, Gold: 240, Platinum: 320, Emerald: 420, Diamond: 560, Master: 780, Grandmaster: 1100, Challenger: 1600 },
};

const LOOK: Record<GameId, { color: string; idLabel: string; idPh: string }> = {
  valorant: { color: '#d4af37', idLabel: 'Riot ID', idPh: 'isim#tag' },
  ow2: { color: '#e0a534', idLabel: 'BattleTag', idPh: 'isim#1234' },
  rivals: { color: '#e25555', idLabel: 'Rivals username', idPh: 'username' },
  rl: { color: '#5a9ded', idLabel: 'Epic / Steam ID', idPh: 'username' },
  wildrift: { color: '#a06ee0', idLabel: 'Riot ID', idPh: 'isim#tag' },
};

export interface GameDef {
  id: GameId;
  label: string;
  short: string;
  /** Whether the Python tracker bot polls this game match by match. */
  tracker: boolean;
  color: string;
  idLabel: string;
  idPh: string;
  ladder: string[];
  step: Record<string, number>;
}

export const GAMES: Record<GameId, GameDef> = Object.fromEntries(
  GAMES_C.map((g) => [
    g.id,
    {
      id: g.id,
      label: g.label,
      short: g.short,
      tracker: g.tracked,
      ladder: GAME_RANKS[g.id],
      step: STEP[g.id],
      ...LOOK[g.id],
    },
  ]),
) as Record<GameId, GameDef>;

export const GAME_KEYS = GAMES_C.map((g) => g.id);

export const G = (id: string | null | undefined): GameDef => GAMES[(id as GameId)] ?? GAMES.valorant;

/** Extras are payout multipliers, applied on top of the ladder step sum. */
export const EXTRAS: [string, number][] = [
  ['Duo Boost', 2], ['Stream', 1], ['Offline Mode', 1],
  ['Agent Selection', 1], ['No 5Q', 1], ['SoloQ', 1],
];

/* ---- Valorant elo arithmetic -------------------------------------------
   The constants come from the contract; tracker/ranks.py reads the same
   values. Tier width 100, lowest ranked tier 3, Immortal starts at tier 24
   and counts RR cumulatively from the Immortal 1 base, Radiant is 27. */

export const IMMORTAL_BASE_ELO =
  (ELO_C.immortal_start_tier - ELO_C.lowest_ranked_tier) * ELO_C.tier_width; // 2100

export interface RankPoint {
  label: string;
  rr: number;
}

/** elo -> { label, rr }. RR follows the API convention: 0-99 inside a tier,
    cumulative from the Immortal 1 base at Immortal and above. */
export function rankFromElo(elo: number | null | undefined): RankPoint | null {
  if (elo == null) return null;
  const e = elo < 0 ? 0 : elo;
  const tier = Math.min(
    ELO_C.radiant_tier,
    ELO_C.lowest_ranked_tier + Math.floor(e / ELO_C.tier_width),
  );
  const rr = tier >= ELO_C.immortal_start_tier ? e - IMMORTAL_BASE_ELO : e % ELO_C.tier_width;
  return { label: TIER_NAME[tier] || `Tier ${tier}`, rr };
}

/** tier + rr -> elo. Mirrors ranks.elo_from(). */
export function eloFrom(tierId: number, rr: number): number {
  if (tierId < ELO_C.lowest_ranked_tier) return 0;
  if (tierId >= ELO_C.immortal_start_tier) return IMMORTAL_BASE_ELO + rr;
  return (tierId - ELO_C.lowest_ranked_tier) * ELO_C.tier_width + rr;
}

/** Above Immortal 3 the standing depends on the leaderboard, so a percentage
    is approximate. The contract carries the threshold. */
export const eloProgressReliable = (tier: number | null) =>
  tier == null || tier <= ELO_C.progress_unreliable_above;
