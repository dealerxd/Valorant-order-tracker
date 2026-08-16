"""shared/domain.json okuyucusu — panel ile paylasilan sozlesme.

Rank etiketleri, bolge kodlari, durum degerleri ve tablo isimleri burada tek
kaynaktan geliyor. Panel ayni dosyadan uretilen panel/js/domain.generated.js'i
okuyor, dolayisiyla iki taraf ayni listeyi gormek zorunda.

Bu modulun sabitleri import aninda kuruluyor: dosya bozuksa ya da beklenen
alanlar eksikse bot ayaga kalkmadan hata verir. Sessizce yanlis bir rank
tablosuyla calismasindansa aciktan patlamasi iyi.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DOMAIN_PATH = Path(__file__).resolve().parent.parent / "shared" / "domain.json"


def _load() -> dict[str, Any]:
    try:
        raw = DOMAIN_PATH.read_text(encoding="utf-8")
    except OSError as exc:
        raise RuntimeError(f"Ortak sozlesme okunamadi ({DOMAIN_PATH}): {exc}") from exc
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{DOMAIN_PATH} gecerli JSON degil: {exc}") from exc


DOMAIN = _load()

# --- Tablolar ----------------------------------------------------------------

TABLES: dict[str, str] = DOMAIN["tables"]
ORDERS_TABLE = TABLES["orders"]
STATE_TABLE = TABLES["state"]
MATCHES_TABLE = TABLES["matches"]

# --- Rank'lar ----------------------------------------------------------------

RANKS: list[dict[str, Any]] = DOMAIN["ranks"]

# tier ID -> HenrikDev'in Ingilizce ismi
TIERS: dict[int, str] = {r["tier"]: r["api"] for r in RANKS}

# Panelin `baslangic` / `hedef` alanina yazdigi etiket -> tier ID.
# Panel 'Plat 1' yaziyor, API 'Platinum 1' donuyor; eslesme isim tahminiyle
# degil bu tablodan yapiliyor.
PANEL_RANK_TO_TIER: dict[str, int] = {
    r["panel"]: r["tier"] for r in RANKS if r["panel"]
}

# Panelde secilebilen rank'lar, sirasiyla (Bronze 1 ... Immortal 3).
PANEL_RANK_ORDER: list[str] = [r["panel"] for r in RANKS if r["panel"]]

# --- Elo aritmetigi ----------------------------------------------------------

# ranks.py bu sabitleri okuyor; panel de ayni degerleri uretilmis dosyadan
# aliyor (rankFromElo). Formul iki dilde ayri yazili, sabitler tek yerde.
ELO: dict[str, int] = DOMAIN["elo"]

# --- Bolgeler ----------------------------------------------------------------

REGIONS: list[dict[str, Any]] = DOMAIN["regions"]
DEFAULT_REGION_API = "eu"

# Panel etiketi (buyuk harfe cevrilmis) -> HenrikDev bolge kodu.
# Turkce 'ğ' icin .upper() iki tarafta ayni sonucu vermedigi olmasin diye
# anahtarlari burada bir kez uretiyoruz.
PANEL_REGION_TO_API: dict[str, str] = {
    r["panel"].upper(): r["api"] for r in REGIONS
}

# --- Durumlar ----------------------------------------------------------------

STATUSES: list[dict[str, Any]] = DOMAIN["statuses"]

STATUS_LABEL: dict[str, str] = {s["key"]: s["label"] for s in STATUSES}

# Poll dongusunun yokladigi durumlar: is fiilen boostcuda.
ACTIVE_STATUSES: tuple[str, ...] = tuple(s["key"] for s in STATUSES if s["polled"])

# /liste ve /bagla'da gorunen durumlar. ACTIVE'i kapsar.
LISTABLE_STATUSES: tuple[str, ...] = tuple(s["key"] for s in STATUSES if s["listable"])


def _validate() -> None:
    """Sozlesmenin kendi icinde tutarli olduguna bakar."""
    if not ACTIVE_STATUSES:
        raise RuntimeError("domain.json: hicbir durum 'polled' degil, tracker bos donerdi.")
    missing = set(ACTIVE_STATUSES) - set(LISTABLE_STATUSES)
    if missing:
        raise RuntimeError(
            "domain.json: yoklanan ama listelenmeyen durum(lar) var: "
            f"{', '.join(sorted(missing))}. Takip ettigi siparisi /liste'de "
            "goremezsen kodu ogrenip komut veremezsin."
        )
    for s in STATUSES:
        nxt = s["next"]
        if nxt is not None and nxt not in STATUS_LABEL:
            raise RuntimeError(f"domain.json: '{s['key']}' bilinmeyen bir duruma gidiyor: '{nxt}'")
    if not PANEL_RANK_ORDER:
        raise RuntimeError("domain.json: panelde secilebilir rank yok.")


_validate()
