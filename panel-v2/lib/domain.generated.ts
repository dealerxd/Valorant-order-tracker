/* ============================================================
   URETILMIS DOSYA - ELLE DUZENLEME
   Kaynak: shared/domain.json
   Yeniden uret: python shared/generate.py
   ============================================================ */

/* Bu dosya shared/domain.json'dan uretiliyor. Panele ozgu sunum
   detaylari (oyun renkleri, hesap alani etiketleri, basamak fiyatlari,
   ekstralar) sozlesmede degil — onlar lib/domain.ts icinde. */

export const TABLES = {"orders": "resells", "state": "tracker_state", "matches": "tracker_matches", "finance": "order_finance", "profiles": "profiles", "fx": "fx_rates", "comments": "resell_comments"} as const;

/** Oyun id'leri: resells.game bu degerleri tutuyor. */
export type GameId = "valorant" | "ow2" | "rivals" | "rl" | "wildrift";

export interface GameMeta {
  id: GameId;
  label: string;
  short: string;
  /** Takip botu bu oyunu maç maç yokluyor mu. Yalnizca Valorant. */
  tracked: boolean;
}

export const GAMES: readonly GameMeta[] = [{"id": "valorant", "label": "Valorant", "short": "VAL", "tracked": true}, {"id": "ow2", "label": "Overwatch 2", "short": "OW2", "tracked": false}, {"id": "rivals", "label": "Marvel Rivals", "short": "MR", "tracked": false}, {"id": "rl", "label": "Rocket League", "short": "RL", "tracked": false}, {"id": "wildrift", "label": "Wild Rift", "short": "WR", "tracked": false}];
export const GAME_RANKS: Record<GameId, string[]> = {"valorant": ["Bronze 1", "Bronze 2", "Bronze 3", "Silver 1", "Silver 2", "Silver 3", "Gold 1", "Gold 2", "Gold 3", "Plat 1", "Plat 2", "Plat 3", "Diamond 1", "Diamond 2", "Diamond 3", "Ascendant 1", "Ascendant 2", "Ascendant 3", "Immortal 1", "Immortal 2", "Immortal 3"], "ow2": ["Bronze 5", "Bronze 4", "Bronze 3", "Bronze 2", "Bronze 1", "Silver 5", "Silver 4", "Silver 3", "Silver 2", "Silver 1", "Gold 5", "Gold 4", "Gold 3", "Gold 2", "Gold 1", "Platinum 5", "Platinum 4", "Platinum 3", "Platinum 2", "Platinum 1", "Emerald 5", "Emerald 4", "Emerald 3", "Emerald 2", "Emerald 1", "Diamond 5", "Diamond 4", "Diamond 3", "Diamond 2", "Diamond 1", "Master 5", "Master 4", "Master 3", "Master 2", "Master 1", "Grandmaster 5", "Grandmaster 4", "Grandmaster 3", "Grandmaster 2", "Grandmaster 1", "Champion"], "rivals": ["Bronze III", "Bronze II", "Bronze I", "Silver III", "Silver II", "Silver I", "Gold III", "Gold II", "Gold I", "Platinum III", "Platinum II", "Platinum I", "Diamond III", "Diamond II", "Diamond I", "Grandmaster III", "Grandmaster II", "Grandmaster I", "Celestial III", "Celestial II", "Celestial I", "Eternity"], "rl": ["Bronze I", "Bronze II", "Bronze III", "Silver I", "Silver II", "Silver III", "Gold I", "Gold II", "Gold III", "Platinum I", "Platinum II", "Platinum III", "Diamond I", "Diamond II", "Diamond III", "Champion I", "Champion II", "Champion III", "Grand Champion I", "Grand Champion II", "Grand Champion III", "Supersonic Legend"], "wildrift": ["Iron IV", "Iron III", "Iron II", "Iron I", "Bronze IV", "Bronze III", "Bronze II", "Bronze I", "Silver IV", "Silver III", "Silver II", "Silver I", "Gold IV", "Gold III", "Gold II", "Gold I", "Platinum IV", "Platinum III", "Platinum II", "Platinum I", "Emerald IV", "Emerald III", "Emerald II", "Emerald I", "Diamond IV", "Diamond III", "Diamond II", "Diamond I", "Master", "Grandmaster", "Challenger"]};
export const DEFAULT_GAME: GameId = "valorant";

/** Panelde secilebilen Valorant rank'lari, dusukten yuksege.
    Iron ve Radiant bilincli olarak disarida — bkz. shared/domain.json */
export const RANK_ORDER: string[] = ["Bronze 1", "Bronze 2", "Bronze 3", "Silver 1", "Silver 2", "Silver 3", "Gold 1", "Gold 2", "Gold 3", "Plat 1", "Plat 2", "Plat 3", "Diamond 1", "Diamond 2", "Diamond 3", "Ascendant 1", "Ascendant 2", "Ascendant 3", "Immortal 1", "Immortal 2", "Immortal 3"];
export const RANK_TIER: Record<string, number> = {"Bronze 1": 6, "Bronze 2": 7, "Bronze 3": 8, "Silver 1": 9, "Silver 2": 10, "Silver 3": 11, "Gold 1": 12, "Gold 2": 13, "Gold 3": 14, "Plat 1": 15, "Plat 2": 16, "Plat 3": 17, "Diamond 1": 18, "Diamond 2": 19, "Diamond 3": 20, "Ascendant 1": 21, "Ascendant 2": 22, "Ascendant 3": 23, "Immortal 1": 24, "Immortal 2": 25, "Immortal 3": 26};
export const TIER_NAME: Record<number, string> = {"0": "Unranked", "3": "Iron 1", "4": "Iron 2", "5": "Iron 3", "6": "Bronze 1", "7": "Bronze 2", "8": "Bronze 3", "9": "Silver 1", "10": "Silver 2", "11": "Silver 3", "12": "Gold 1", "13": "Gold 2", "14": "Gold 3", "15": "Plat 1", "16": "Plat 2", "17": "Plat 3", "18": "Diamond 1", "19": "Diamond 2", "20": "Diamond 3", "21": "Ascendant 1", "22": "Ascendant 2", "23": "Ascendant 3", "24": "Immortal 1", "25": "Immortal 2", "26": "Immortal 3", "27": "Radiant"};

/** Bolgeler. `panel` degeri resells.region'a yazilan degerdir —
    tracker ayni etiketten API kodunu cozuyor, uydurma bir deger
    yazilirsa sessizce eslesmez. */
export const REGION_VALUES: string[] = ["TR", "EU", "NA", "Diğer"];
export const REGION_MULT: Record<string, number> = {"TR": 1.0, "EU": 1.0, "NA": 1.05, "Diğer": 1.1, "AP": 1.1, "KR": 1.1, "LATAM": 1.1, "BR": 1.1};
export const REGION_API: Record<string, string> = {"TR": "eu", "EU": "eu", "NA": "na", "Diğer": "eu", "AP": "ap", "KR": "kr", "LATAM": "latam", "BR": "br"};

/** Siparis durumlari. Etiketler sozlesmenin Turkce'si; panel-v2
    tasarimi Ingilizce gosteriyor (lib/domain.ts ST). Gecisler ve
    anahtarlar buradan gelmeli. */
export type StatusKey = "yeni" | "atandi" | "devam" | "tamam" | "odendi";
export const STATUS_LABEL_TR: Record<string, string> = {"yeni": "Yeni", "atandi": "Atandı", "devam": "Devam", "tamam": "Tamam", "odendi": "Ödendi"};
export const NEXT_STATUS: Record<string, string> = {"yeni": "atandi", "atandi": "devam", "devam": "tamam"};
export const FORM_STATUSES: string[] = ["yeni", "atandi", "devam", "tamam"];
export const LISTABLE_STATUSES: string[] = ["yeni", "atandi", "devam"];

/** Elo sabitleri. tracker/ranks.py ayni degerleri okuyor. */
export const ELO = {"lowest_ranked_tier": 3, "immortal_start_tier": 24, "radiant_tier": 27, "tier_width": 100, "progress_unreliable_above": 26} as const;
