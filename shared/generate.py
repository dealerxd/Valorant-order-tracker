#!/usr/bin/env python3
"""shared/domain.json -> panel/js/domain.generated.js
                      -> panel-v2/lib/domain.generated.ts

Iki panel var: `panel/` statik site (derleme adimi yok, Cloudflare Pages
dosyalari oldugu gibi yayinliyor), `panel-v2/` Next.js uygulamasi. Ikisi de
ayni sozlesmeyi okumak zorunda, yoksa `resells` satirlarina birbiriyle
uyusmayan bolge/rank/durum degerleri yazilir.

Sozlesmeyi tarayicida fetch ile okumak yerine duz dosyaya yaziyoruz —
uretilen dosyalar repoya commit'leniyor, panelin acilisi ek bir istege
bagli kalmiyor.

    python shared/generate.py            # uret
    python shared/generate.py --check    # senkron mu? degilse cikis kodu 1

--check test_smoke.py icinde de calisiyor: domain.json'a dokunup generate'i
unutursan test patlar.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "shared" / "domain.json"
TARGET = ROOT / "panel" / "js" / "domain.generated.js"
TARGET_TS = ROOT / "panel-v2" / "lib" / "domain.generated.ts"

HEADER = """/* ============================================================
   URETILMIS DOSYA - ELLE DUZENLEME
   Kaynak: shared/domain.json
   Yeniden uret: python shared/generate.py
   ============================================================ */
"""


def _js(value: object) -> str:
    """Python degerini JS literaline cevirir (JSON ikisinde de gecerli)."""
    return json.dumps(value, ensure_ascii=False)


def render(domain: dict) -> str:
    ranks = domain["ranks"]
    regions = domain["regions"]
    statuses = domain["statuses"]
    tables = domain["tables"]

    panel_ranks = [r["panel"] for r in ranks if r["panel"]]
    # Panel etiketi -> tier ID. Panel bunu su an kullanmiyor ama rank'i API
    # ismine cevirmesi gerektiginde (ornegin ilerleme gostermek icin) elinde olsun.
    panel_to_tier = {r["panel"]: r["tier"] for r in ranks if r["panel"]}
    region_mult = {r["panel"]: r["mult"] for r in regions}
    # Formda yalnizca form=true olanlar cikar; digerleri tracker'in cozebilmesi
    # icin sozlesmede duruyor ama panelde secilemez.
    region_values = [r["panel"] for r in regions if r["form"]]
    status_label = {s["key"]: s["label"] for s in statuses}
    next_status = {s["key"]: s["next"] for s in statuses if s["next"]}
    form_statuses = [s["key"] for s in statuses if s["form"]]

    elo = domain["elo"]
    # tier ID -> gosterilecek isim. Panel `tracker_matches.tier_id` ve
    # `tracker_state.current_elo` alanlarini rank adina cevirmek icin kullaniyor.
    tier_name = {r["tier"]: (r["panel"] or r["api"]) for r in ranks}

    # Oyun -> satilabilir rank merdiveni. Valorant'inki ayri `ranks` tablosundan
    # geliyor (tier ID'leri var), digerleri duz etiket listesi.
    games = domain["games"]
    game_ranks = {
        g["id"]: (panel_ranks if g["ranks"] is None else g["ranks"]) for g in games
    }
    game_meta = [
        {"id": g["id"], "label": g["label"], "short": g["short"], "tracked": g["tracked"]}
        for g in games
    ]

    lines = [
        HEADER,
        "/* Tablo isimleri (tracker ayni dosyadan okuyor) */",
        f"const TABLES = {_js(tables)};",
        "",
        "/* ---- Oyunlar ---- */",
        "/* tracked=false olanlarin takip botu yok; panel yine de siparis, fiyat",
        "   ve booster yonetimi yapiyor. Bkz. shared/domain.json */",
        f"const GAMES = {_js(game_meta)};",
        f"const GAME_RANKS = {_js(game_ranks)};",
        f"const DEFAULT_GAME = {_js(games[0]['id'])};",
        "const gameOf = id => GAMES.find(g => g.id === id) || GAMES[0];",
        "const ranksOfGame = id => GAME_RANKS[id] || GAME_RANKS[DEFAULT_GAME];",
        "const isTrackedGame = id => gameOf(id).tracked;",
        "",
        "/* Panelde secilebilen rank'lar, dusukten yuksege.",
        "   Iron ve Radiant bilincli olarak yok - bkz. shared/domain.json */",
        f"const RANK_ORDER = {_js(panel_ranks)};",
        f"const RANK_TIER = {_js(panel_to_tier)};",
        "",
        "/* Bolgeler */",
        f"const REGION_VALUES = {_js(region_values)};",
        f"const REGION_MULT = {_js(region_mult)};",
        "",
        "/* Siparis durumlari */",
        f"const STATUS_LABEL = {_js(status_label)};",
        f"const NEXT_STATUS = {_js(next_status)};",
        f"const FORM_STATUSES = {_js(form_statuses)};",
        "",
        "/* Bolge <select>'lerini doldurur. Secenekler HTML'e gomulu degil ki",
        "   liste degistiginde tek yerden guncellensin. */",
        "function fillRegionSelects(){",
        "  document.querySelectorAll('select[data-region]').forEach(sel=>{",
        "    const keep = sel.value;",
        "    sel.innerHTML = REGION_VALUES.map(r=>`<option value=\"${r}\">${r}</option>`).join('');",
        "    sel.value = REGION_VALUES.includes(keep) ? keep : REGION_VALUES[0];",
        "  });",
        "}",
        "",
        "/* ---- Elo aritmetigi (takip drawer'i icin) ----",
        "   Sabitler shared/domain.json'dan; tracker/ranks.py ayni degerleri okuyor. */",
        f"const ELO = {_js(elo)};",
        f"const TIER_NAME = {_js(tier_name)};",
        "",
        "/* elo -> {tier, rr, label}. Immortal ve ustunde RR tier icinden degil",
        "   Immortal 1 tabanindan kumulatif sayilir - ranks.py ile ayni kural. */",
        "function rankFromElo(elo){",
        "  if(elo==null) return null;",
        "  if(elo < 0) elo = 0;",
        "  const immortalBase = (ELO.immortal_start_tier - ELO.lowest_ranked_tier) * ELO.tier_width;",
        "  const tier = Math.min(ELO.radiant_tier, ELO.lowest_ranked_tier + Math.floor(elo / ELO.tier_width));",
        "  const rr = tier >= ELO.immortal_start_tier ? elo - immortalBase : elo % ELO.tier_width;",
        "  return { tier, rr, label: TIER_NAME[tier] || ('Tier ' + tier) };",
        "}",
        "",
        "/* Hedefe ilerleme orani (0-1). Hedef baslangica esitse tam kabul edilir. */",
        "function eloProgress(startElo, currentElo, targetElo){",
        "  const span = targetElo - startElo;",
        "  if(!(span > 0)) return 1;",
        "  return Math.max(0, Math.min(1, (currentElo - startElo) / span));",
        "}",
        "",
        "/* Immortal 3'un ustunde siralama leaderboard'a bagli, yuzde yaklasiktir. */",
        "const eloProgressReliable = tier => tier == null || tier <= ELO.progress_unreliable_above;",
        "",
        "/* Durum <select>'ini doldurur (formda secilebilir olanlar). */",
        "function fillStatusSelects(){",
        "  document.querySelectorAll('select[data-status]').forEach(sel=>{",
        "    const keep = sel.value;",
        "    sel.innerHTML = FORM_STATUSES.map(s=>`<option value=\"${s}\">${STATUS_LABEL[s]}</option>`).join('');",
        "    if(FORM_STATUSES.includes(keep)) sel.value = keep;",
        "  });",
        "}",
        "",
    ]
    return "\n".join(lines)


def render_ts(domain: dict) -> str:
    """Ayni sozlesme, panel-v2 (Next.js) icin TypeScript olarak.

    Yalnizca veriyi disari veriyor; panel/js surumundeki DOM yardimcilari
    (fillRegionSelects vb.) burada anlamsiz — Next.js tarafi React ile
    render ediyor. Elo aritmetigi de panel-v2/lib/domain.ts icinde, cunku
    orasi sabitleri buradan okuyor.
    """
    ranks = domain["ranks"]
    regions = domain["regions"]
    statuses = domain["statuses"]
    games = domain["games"]

    panel_ranks = [r["panel"] for r in ranks if r["panel"]]
    game_ranks = {
        g["id"]: (panel_ranks if g["ranks"] is None else g["ranks"]) for g in games
    }
    game_meta = [
        {"id": g["id"], "label": g["label"], "short": g["short"], "tracked": g["tracked"]}
        for g in games
    ]
    tier_name = {r["tier"]: (r["panel"] or r["api"]) for r in ranks}

    return "\n".join([
        HEADER,
        "/* Bu dosya shared/domain.json'dan uretiliyor. Panele ozgu sunum",
        "   detaylari (oyun renkleri, hesap alani etiketleri, basamak fiyatlari,",
        "   ekstralar) sozlesmede degil — onlar lib/domain.ts icinde. */",
        "",
        f"export const TABLES = {_js(domain['tables'])} as const;",
        "",
        "/** Oyun id'leri: resells.game bu degerleri tutuyor. */",
        f"export type GameId = {' | '.join(_js(g['id']) for g in games)};",
        "",
        "export interface GameMeta {",
        "  id: GameId;",
        "  label: string;",
        "  short: string;",
        "  /** Takip botu bu oyunu maç maç yokluyor mu. Yalnizca Valorant. */",
        "  tracked: boolean;",
        "}",
        "",
        f"export const GAMES: readonly GameMeta[] = {_js(game_meta)};",
        f"export const GAME_RANKS: Record<GameId, string[]> = {_js(game_ranks)};",
        f"export const DEFAULT_GAME: GameId = {_js(games[0]['id'])};",
        "",
        "/** Panelde secilebilen Valorant rank'lari, dusukten yuksege.",
        "    Iron ve Radiant bilincli olarak disarida — bkz. shared/domain.json */",
        f"export const RANK_ORDER: string[] = {_js(panel_ranks)};",
        f"export const RANK_TIER: Record<string, number> = {_js({r['panel']: r['tier'] for r in ranks if r['panel']})};",
        f"export const TIER_NAME: Record<number, string> = {_js(tier_name)};",
        "",
        "/** Bolgeler. `panel` degeri resells.region'a yazilan degerdir —",
        "    tracker ayni etiketten API kodunu cozuyor, uydurma bir deger",
        "    yazilirsa sessizce eslesmez. */",
        f"export const REGION_VALUES: string[] = {_js([r['panel'] for r in regions if r['form']])};",
        f"export const REGION_MULT: Record<string, number> = {_js({r['panel']: r['mult'] for r in regions})};",
        f"export const REGION_API: Record<string, string> = {_js({r['panel']: r['api'] for r in regions})};",
        "",
        "/** Siparis durumlari. Etiketler sozlesmenin Turkce'si; panel-v2",
        "    tasarimi Ingilizce gosteriyor (lib/domain.ts ST). Gecisler ve",
        "    anahtarlar buradan gelmeli. */",
        f"export type StatusKey = {' | '.join(_js(s['key']) for s in statuses)};",
        f"export const STATUS_LABEL_TR: Record<string, string> = {_js({s['key']: s['label'] for s in statuses})};",
        f"export const NEXT_STATUS: Record<string, string> = {_js({s['key']: s['next'] for s in statuses if s['next']})};",
        f"export const FORM_STATUSES: string[] = {_js([s['key'] for s in statuses if s['form']])};",
        f"export const LISTABLE_STATUSES: string[] = {_js([s['key'] for s in statuses if s['listable']])};",
        "",
        "/** Elo sabitleri. tracker/ranks.py ayni degerleri okuyor. */",
        f"export const ELO = {_js(domain['elo'])} as const;",
        "",
    ])


def main(argv: list[str]) -> int:
    check = "--check" in argv

    try:
        domain = json.loads(SOURCE.read_text(encoding="utf-8"))
    except OSError as exc:
        print(f"HATA: {SOURCE} okunamadi: {exc}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as exc:
        print(f"HATA: {SOURCE} gecerli JSON degil: {exc}", file=sys.stderr)
        return 2

    outputs = [(TARGET, render(domain)), (TARGET_TS, render_ts(domain))]

    if check:
        stale = [
            path for path, output in outputs
            if (path.read_text(encoding="utf-8") if path.exists() else None) != output
        ]
        if not stale:
            return 0
        listed = "\n".join(f"    {p.relative_to(ROOT)}" for p in stale)
        print(
            "HATA: uretilmis dosya(lar) guncel degil:\n"
            f"{listed}\n"
            "  shared/domain.json degismis ama uretilmis dosya yenilenmemis.\n"
            "  Duzeltmek icin: python shared/generate.py",
            file=sys.stderr,
        )
        return 1

    for path, output in outputs:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(output, encoding="utf-8")
        print(f"yazildi: {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
