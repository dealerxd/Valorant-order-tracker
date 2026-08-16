/* ============================================================
   URETILMIS DOSYA - ELLE DUZENLEME
   Kaynak: shared/domain.json
   Yeniden uret: python shared/generate.py
   ============================================================ */

/* Tablo isimleri (tracker ayni dosyadan okuyor) */
const TABLES = {"orders": "resells", "state": "tracker_state", "matches": "tracker_matches"};

/* Panelde secilebilen rank'lar, dusukten yuksege.
   Iron ve Radiant bilincli olarak yok - bkz. shared/domain.json */
const RANK_ORDER = ["Bronze 1", "Bronze 2", "Bronze 3", "Silver 1", "Silver 2", "Silver 3", "Gold 1", "Gold 2", "Gold 3", "Plat 1", "Plat 2", "Plat 3", "Diamond 1", "Diamond 2", "Diamond 3", "Ascendant 1", "Ascendant 2", "Ascendant 3", "Immortal 1", "Immortal 2", "Immortal 3"];
const RANK_TIER = {"Bronze 1": 6, "Bronze 2": 7, "Bronze 3": 8, "Silver 1": 9, "Silver 2": 10, "Silver 3": 11, "Gold 1": 12, "Gold 2": 13, "Gold 3": 14, "Plat 1": 15, "Plat 2": 16, "Plat 3": 17, "Diamond 1": 18, "Diamond 2": 19, "Diamond 3": 20, "Ascendant 1": 21, "Ascendant 2": 22, "Ascendant 3": 23, "Immortal 1": 24, "Immortal 2": 25, "Immortal 3": 26};

/* Bolgeler */
const REGION_VALUES = ["TR", "EU", "NA", "Diğer"];
const REGION_MULT = {"TR": 1.0, "EU": 1.0, "NA": 1.05, "Diğer": 1.1, "AP": 1.1, "KR": 1.1, "LATAM": 1.1, "BR": 1.1};

/* Siparis durumlari */
const STATUS_LABEL = {"yeni": "Yeni", "atandi": "Atandı", "devam": "Devam", "tamam": "Tamam", "odendi": "Ödendi"};
const NEXT_STATUS = {"yeni": "atandi", "atandi": "devam", "devam": "tamam"};
const FORM_STATUSES = ["yeni", "atandi", "devam", "tamam"];

/* Bolge <select>'lerini doldurur. Secenekler HTML'e gomulu degil ki
   liste degistiginde tek yerden guncellensin. */
function fillRegionSelects(){
  document.querySelectorAll('select[data-region]').forEach(sel=>{
    const keep = sel.value;
    sel.innerHTML = REGION_VALUES.map(r=>`<option value="${r}">${r}</option>`).join('');
    sel.value = REGION_VALUES.includes(keep) ? keep : REGION_VALUES[0];
  });
}

/* ---- Elo aritmetigi (takip drawer'i icin) ----
   Sabitler shared/domain.json'dan; tracker/ranks.py ayni degerleri okuyor. */
const ELO = {"lowest_ranked_tier": 3, "immortal_start_tier": 24, "radiant_tier": 27, "tier_width": 100, "progress_unreliable_above": 26};
const TIER_NAME = {"0": "Unranked", "3": "Iron 1", "4": "Iron 2", "5": "Iron 3", "6": "Bronze 1", "7": "Bronze 2", "8": "Bronze 3", "9": "Silver 1", "10": "Silver 2", "11": "Silver 3", "12": "Gold 1", "13": "Gold 2", "14": "Gold 3", "15": "Plat 1", "16": "Plat 2", "17": "Plat 3", "18": "Diamond 1", "19": "Diamond 2", "20": "Diamond 3", "21": "Ascendant 1", "22": "Ascendant 2", "23": "Ascendant 3", "24": "Immortal 1", "25": "Immortal 2", "26": "Immortal 3", "27": "Radiant"};

/* elo -> {tier, rr, label}. Immortal ve ustunde RR tier icinden degil
   Immortal 1 tabanindan kumulatif sayilir - ranks.py ile ayni kural. */
function rankFromElo(elo){
  if(elo==null) return null;
  if(elo < 0) elo = 0;
  const immortalBase = (ELO.immortal_start_tier - ELO.lowest_ranked_tier) * ELO.tier_width;
  const tier = Math.min(ELO.radiant_tier, ELO.lowest_ranked_tier + Math.floor(elo / ELO.tier_width));
  const rr = tier >= ELO.immortal_start_tier ? elo - immortalBase : elo % ELO.tier_width;
  return { tier, rr, label: TIER_NAME[tier] || ('Tier ' + tier) };
}

/* Hedefe ilerleme orani (0-1). Hedef baslangica esitse tam kabul edilir. */
function eloProgress(startElo, currentElo, targetElo){
  const span = targetElo - startElo;
  if(!(span > 0)) return 1;
  return Math.max(0, Math.min(1, (currentElo - startElo) / span));
}

/* Immortal 3'un ustunde siralama leaderboard'a bagli, yuzde yaklasiktir. */
const eloProgressReliable = tier => tier == null || tier <= ELO.progress_unreliable_above;

/* Durum <select>'ini doldurur (formda secilebilir olanlar). */
function fillStatusSelects(){
  document.querySelectorAll('select[data-status]').forEach(sel=>{
    const keep = sel.value;
    sel.innerHTML = FORM_STATUSES.map(s=>`<option value="${s}">${STATUS_LABEL[s]}</option>`).join('');
    if(FORM_STATUSES.includes(keep)) sel.value = keep;
  });
}
