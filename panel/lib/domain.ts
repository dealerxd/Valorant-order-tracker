/* Games, ladders, statuses, extras.
   Ported from the prototype's GAMES/ST/EXTRAS tables and panel/js/domain.generated.js.
   The elo arithmetic mirrors tracker/ranks.py exactly — see ELO below. */

export type GameKey = 'valorant' | 'rivals' | 'rocket' | 'ow2';
/* What the DB stores in resells.game. `wildrift` is legacy and maps onto valorant. */
export type DbGame = 'valorant' | 'rivals' | 'rl' | 'ow2' | 'wildrift';
export type OrderType = 'rank' | 'netwin' | 'placement' | 'custom';
export type Status = 'yeni' | 'atandi' | 'devam' | 'tamam';
/* Legacy `odendi` rows are folded into `tamam` on read. */
export type DbStatus = Status | 'odendi';
export type Currency = '$' | '€' | '₺';
export type CurrencyCode = 'USD' | 'EUR' | 'TRY';

export const GAME_IN: Record<DbGame, GameKey> = {
  valorant: 'valorant',
  rivals: 'rivals',
  rl: 'rocket',
  ow2: 'ow2',
  wildrift: 'valorant',
};

export const GAME_OUT: Record<GameKey, DbGame> = {
  valorant: 'valorant',
  rivals: 'rivals',
  rocket: 'rl',
  ow2: 'ow2',
};

export const CUR: Record<CurrencyCode, Currency> = { USD: '$', EUR: '€', TRY: '₺' };
export const CUR_CODE: Record<Currency, CurrencyCode> = { '$': 'USD', '€': 'EUR', '₺': 'TRY' };

export const ST: Record<Status, { label: string; c: string; rgb: string }> = {
  yeni: { label: 'New', c: '#8b8b95', rgb: '139,139,149' },
  atandi: { label: 'Assigned', c: '#e0a534', rgb: '224,165,52' },
  devam: { label: 'In progress', c: '#5a9ded', rgb: '90,157,237' },
  tamam: { label: 'Done', c: '#3ecf8e', rgb: '62,207,142' },
};

export const STATUSES: Status[] = ['yeni', 'atandi', 'devam', 'tamam'];
export const NEXT: Partial<Record<Status, Status>> = { yeni: 'atandi', atandi: 'devam', devam: 'tamam' };

export const ORDER_LABEL: Record<OrderType, string> = {
  rank: 'Rank Boost',
  netwin: 'Net Win',
  placement: 'Placement',
  custom: 'Custom',
};

/* Valorant ladder as the panel labels it. Note "Plat" (not "Platinum") — the
   existing rows in `resells.baslangic`/`hedef` use the short form. */
const VAL_RANKS = [
  'Bronze 1', 'Bronze 2', 'Bronze 3',
  'Silver 1', 'Silver 2', 'Silver 3',
  'Gold 1', 'Gold 2', 'Gold 3',
  'Plat 1', 'Plat 2', 'Plat 3',
  'Diamond 1', 'Diamond 2', 'Diamond 3',
  'Ascendant 1', 'Ascendant 2', 'Ascendant 3',
  'Immortal 1', 'Immortal 2', 'Immortal 3',
];

const VAL_STEP: Record<string, number> = {
  Bronze: 180, Silver: 240, Gold: 320, Plat: 400, Diamond: 560, Ascendant: 760, Immortal: 980,
};

const divs = (bases: string[], tiers: string[]) =>
  bases.reduce<string[]>((a, b) => a.concat(tiers.map((t) => `${b} ${t}`)), []);

export interface GameDef {
  label: string;
  short: string;
  idLabel: string;
  idPh: string;
  /** Whether the Python tracker bot polls this game match by match. */
  tracker: boolean;
  color: string;
  ladder: string[];
  /** Price to climb one division, keyed by the first word of the rank. */
  step: Record<string, number>;
}

export const GAMES: Record<GameKey, GameDef> = {
  valorant: {
    label: 'Valorant', short: 'VAL', idLabel: 'Riot ID', idPh: 'isim#tag',
    tracker: true, color: '#d4af37', ladder: VAL_RANKS, step: VAL_STEP,
  },
  rivals: {
    label: 'Marvel Rivals', short: 'MR', idLabel: 'Rivals username', idPh: 'username',
    tracker: false, color: '#e25555',
    ladder: divs(['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Grandmaster', 'Celestial'], ['III', 'II', 'I'])
      .concat(['Eternity', 'One Above All']),
    step: { Bronze: 150, Silver: 200, Gold: 260, Platinum: 340, Diamond: 460, Grandmaster: 640, Celestial: 900, Eternity: 1400, One: 2200 },
  },
  rocket: {
    label: 'Rocket League', short: 'RL', idLabel: 'Epic / Steam ID', idPh: 'username',
    tracker: false, color: '#5a9ded',
    ladder: divs(['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Champion', 'Grand Champion'], ['I', 'II', 'III'])
      .concat(['Supersonic Legend']),
    step: { Bronze: 120, Silver: 160, Gold: 220, Platinum: 300, Diamond: 420, Champion: 620, Grand: 880, Supersonic: 1600 },
  },
  ow2: {
    label: 'Overwatch 2', short: 'OW2', idLabel: 'BattleTag', idPh: 'isim#1234',
    tracker: false, color: '#e0a534',
    ladder: divs(['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master'], ['5', '4', '3', '2', '1'])
      .concat(['Grandmaster 3', 'Grandmaster 2', 'Grandmaster 1', 'Champion']),
    step: { Bronze: 130, Silver: 170, Gold: 230, Platinum: 310, Diamond: 430, Master: 620, Grandmaster: 880, Champion: 1500 },
  },
};

export const GAME_KEYS = Object.keys(GAMES) as GameKey[];
export const G = (id: string | null | undefined): GameDef => GAMES[(id as GameKey) ?? 'valorant'] ?? GAMES.valorant;

/** Extras are payout multipliers, applied on top of the ladder step sum. */
export const EXTRAS: [string, number][] = [
  ['Duo Boost', 2], ['Stream', 1], ['Offline Mode', 1],
  ['Agent Selection', 1], ['No 5Q', 1], ['SoloQ', 1],
];

export const REGIONS = ['TR', 'EU', 'NA', 'Other'] as const;
export const PLATFORMS = ['Eldorado', 'GameBoost', 'Other'] as const;

/* ---- Valorant elo arithmetic -----------------------------------------
   Must stay byte-for-byte equivalent to tracker/ranks.py: tier width 100,
   lowest ranked tier 3 (Iron 1), Immortal starts at tier 24 and counts RR
   cumulatively from the Immortal 1 base, Radiant is 27. */
export const ELO = { base: 3, immortal: 24, radiant: 27, width: 100 } as const;
export const IMMORTAL_BASE_ELO = (ELO.immortal - ELO.base) * ELO.width; // 2100

/** Tier id -> the label the panel shows. Index is the Valorant tier id. */
export const TIERS = [
  'Unranked', '', '',
  'Iron 1', 'Iron 2', 'Iron 3',
  'Bronze 1', 'Bronze 2', 'Bronze 3',
  'Silver 1', 'Silver 2', 'Silver 3',
  'Gold 1', 'Gold 2', 'Gold 3',
  'Plat 1', 'Plat 2', 'Plat 3',
  'Diamond 1', 'Diamond 2', 'Diamond 3',
  'Ascendant 1', 'Ascendant 2', 'Ascendant 3',
  'Immortal 1', 'Immortal 2', 'Immortal 3',
  'Radiant',
];

export interface RankPoint {
  label: string;
  rr: number;
}

/** elo -> { label, rr }. RR follows the API convention: 0-99 inside a tier,
    cumulative from the Immortal 1 base at Immortal and above. */
export function rankFromElo(elo: number | null | undefined): RankPoint | null {
  if (elo == null) return null;
  const e = elo < 0 ? 0 : elo;
  const tier = Math.min(ELO.radiant, ELO.base + Math.floor(e / ELO.width));
  const rr = tier >= ELO.immortal ? e - IMMORTAL_BASE_ELO : e % ELO.width;
  return { label: TIERS[tier] || `Tier ${tier}`, rr };
}

/** tier + rr -> elo. Mirrors ranks.elo_from(). */
export function eloFrom(tierId: number, rr: number): number {
  if (tierId < ELO.base) return 0;
  if (tierId >= ELO.immortal) return IMMORTAL_BASE_ELO + rr;
  return (tierId - ELO.base) * ELO.width + rr;
}
