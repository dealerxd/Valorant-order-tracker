"""Valorant rank/tier tablolari ve elo aritmetigi.

HenrikDev'in `elo` alani tier ve RR'i tek sayiya indiriyor:

    elo = (tier_id - 3) * 100 + rr

Dogrulama: Diamond 1 = tier 18, rr 38  ->  (18-3)*100 + 38 = 1538  (dokumandaki ornekle ayni)

Iron 1 (tier 3, rr 0) elo 0'a denk geliyor, yani tablo Iron 1'den basliyor.
Immortal+ tarafinda leaderboard sirasi da devreye girdigi icin Radiant hedefli
siparislerde elo tek basina yeterli olmuyor; PROGRESS_UNRELIABLE_ABOVE'a bak.
"""

from __future__ import annotations

import re
import unicodedata

# Valorant tier ID -> Ingilizce isim
TIERS: dict[int, str] = {
    0: "Unranked",
    3: "Iron 1", 4: "Iron 2", 5: "Iron 3",
    6: "Bronze 1", 7: "Bronze 2", 8: "Bronze 3",
    9: "Silver 1", 10: "Silver 2", 11: "Silver 3",
    12: "Gold 1", 13: "Gold 2", 14: "Gold 3",
    15: "Platinum 1", 16: "Platinum 2", 17: "Platinum 3",
    18: "Diamond 1", 19: "Diamond 2", 20: "Diamond 3",
    21: "Ascendant 1", 22: "Ascendant 2", 23: "Ascendant 3",
    24: "Immortal 1", 25: "Immortal 2", 26: "Immortal 3",
    27: "Radiant",
}

LOWEST_RANKED_TIER = 3
IMMORTAL_START_TIER = 24  # Immortal 1
RADIANT_TIER = 27

# Bu tier'in ustunde ilerleme yuzdesi leaderboard'a bagli oldugu icin guvenilmez.
PROGRESS_UNRELIABLE_ABOVE = 26

# Immortal 1 esigi. Immortal ve ustunde RR tier icinden degil buradan sayiliyor.
IMMORTAL_BASE_ELO = (IMMORTAL_START_TIER - LOWEST_RANKED_TIER) * 100  # 2100

# Rank gruplarinin Turkce ve kisa yazimlari. parse_rank bunlari cozuyor.
_GROUP_ALIASES: dict[str, int] = {
    "iron": 3, "demir": 3, "i": 3,
    "bronze": 6, "bronz": 6, "b": 6,
    "silver": 9, "gumus": 9, "s": 9,
    "gold": 12, "altin": 12, "g": 12,
    "platinum": 15, "platin": 15, "plat": 15, "p": 15,
    "diamond": 18, "elmas": 18, "dia": 18, "d": 18,
    "ascendant": 21, "yukselen": 21, "asc": 21, "a": 21,
    "immortal": 24, "olumsuz": 24, "imm": 24, "im": 24,
    "radiant": 27, "isikli": 27, "rad": 27, "r": 27,
}


def _normalize(text: str) -> str:
    """Turkce karakterleri ve buyuk/kucuk farkini temizler ('Altın' -> 'altin')."""
    text = text.strip().lower()
    text = text.replace("ı", "i").replace("İ", "i")
    text = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def parse_rank(text: str) -> int | None:
    """'Altın 2', 'gold 2', 'g2', 'Radiant' gibi girdileri tier ID'ye cevirir."""
    norm = _normalize(text)
    norm = re.sub(r"[^a-z0-9]+", " ", norm).strip()
    if not norm:
        return None

    match = re.match(r"^([a-z]+)\s*([1-3])?$", norm)
    if not match:
        return None

    group, division = match.group(1), match.group(2)
    base = _GROUP_ALIASES.get(group)
    if base is None:
        return None

    if base == RADIANT_TIER:
        return RADIANT_TIER
    if division is None:
        # Bolum verilmediyse grubun ilk basamagini hedef kabul et (ornek: "elmas" -> Diamond 1)
        return base
    return base + int(division) - 1


def tier_threshold_elo(tier_id: int) -> int:
    """Bir tier'e girmek icin gereken minimum elo. Hedef belirlerken bunu kullan.

    Her tier 100 elo genisliginde: Iron 1 = 0, Gold 1 = 900, Immortal 2 = 2200.
    """
    if tier_id < LOWEST_RANKED_TIER:
        return 0
    return (tier_id - LOWEST_RANKED_TIER) * 100


def elo_from(tier_id: int, rr: int) -> int:
    """Tier + RR -> elo. Yanittan elo alani eksik geldiginde kullanilir.

    Immortal ve ustunde HenrikDev'in `rr` alani tier icinden degil Immortal 1
    tabanindan sayiliyor (Immortal 2 / 191 RR -> elo 2291, 2200+91 degil).
    """
    if tier_id < LOWEST_RANKED_TIER:
        return 0
    if tier_id >= IMMORTAL_START_TIER:
        return IMMORTAL_BASE_ELO + rr
    return tier_threshold_elo(tier_id) + rr


def tier_from_elo(elo: int) -> tuple[int, int]:
    """Elo -> (tier_id, rr).

    RR, API'nin kullandigi konvansiyonla ayni doner: alt rank'larda tier ici
    0-99, Immortal ve ustunde Immortal 1 tabanindan kumulatif.
    """
    if elo < 0:
        return LOWEST_RANKED_TIER, 0
    tier_id = min(RADIANT_TIER, LOWEST_RANKED_TIER + elo // 100)
    if tier_id >= IMMORTAL_START_TIER:
        return tier_id, elo - IMMORTAL_BASE_ELO
    return tier_id, elo % 100


def tier_name(tier_id: int | None) -> str:
    if tier_id is None:
        return "Bilinmiyor"
    return TIERS.get(tier_id, f"Tier {tier_id}")


def format_rank(tier_id: int | None, rr: int | None = None) -> str:
    """'Diamond 1 (38 RR)' formatinda okunabilir metin."""
    name = tier_name(tier_id)
    if rr is None:
        return name
    return f"{name} ({rr} RR)"


def format_elo(elo: int | None) -> str:
    if elo is None:
        return "Bilinmiyor"
    tier_id, rr = tier_from_elo(elo)
    return format_rank(tier_id, rr)


def format_target(elo: int | None) -> str:
    """Hedef rank'i yazar. Hedef bir tier esigi oldugu icin '(0 RR)' gosterilmez."""
    if elo is None:
        return "Bilinmiyor"
    return tier_name(tier_from_elo(elo)[0])


def progress_ratio(start_elo: int, current_elo: int, target_elo: int) -> float:
    """0.0 - 1.0 arasi ilerleme orani. Hedef baslangica esitse tam kabul edilir."""
    span = target_elo - start_elo
    if span <= 0:
        return 1.0
    ratio = (current_elo - start_elo) / span
    return max(0.0, min(1.0, ratio))


def progress_bar(ratio: float, width: int = 10) -> str:
    filled = int(round(ratio * width))
    return "█" * filled + "░" * (width - filled)


def rr_needed(current_elo: int, target_elo: int) -> int:
    """Hedefe kalan RR. Hedef gecildiyse 0."""
    return max(0, target_elo - current_elo)
