"""Tek hesap uzerinde okuma hattini uctan uca dogrular.

    python check_account.py Player#TR1 eu

Bot token'i gerekmez. Hesap arama -> guncel rank -> mac gecmisi ayristirmasi
zincirini calistirip sonucu ekrana basar. Botun gercek veride dogru calisip
calismadigini gormenin en hizli yolu bu.
"""

from __future__ import annotations

import asyncio
import os
import sys

from dotenv import load_dotenv

import henrik
import ranks

load_dotenv()


def usage() -> int:
    print(__doc__)
    print(f"Bolgeler: {', '.join(sorted(henrik.VALID_REGIONS))}")
    return 2


async def run(account: str, region: str, platform: str) -> int:
    if "#" not in account:
        print("Hesap adi 'isim#tag' formatinda olmali. Ornek: Player#TR1")
        return 2
    name, _, tag = account.partition("#")

    # Bot token'lari gerekmedigi icin load_config() yerine dogrudan env okunuyor
    api_key = os.getenv("HENRIK_API_KEY", "").strip()
    if not api_key:
        print("HENRIK_API_KEY tanimli degil. .env dosyasini kontrol et.")
        return 2
    try:
        rate_limit = int(os.getenv("HENRIK_RATE_LIMIT_PER_MIN", "30"))
    except ValueError:
        rate_limit = 30

    client = henrik.HenrikClient(api_key, rate_limit)

    try:
        print(f"\n[1/3] Hesap araniyor: {name}#{tag}")
        try:
            info = await client.get_account(name, tag)
        except henrik.AccountNotFound:
            print("  BULUNAMADI - isim ve tag'i kontrol et")
            return 1
        print(f"  puuid : {info.puuid}")
        print(f"  bolge : {info.region or '(donmedi)'}  seviye: {info.level or '?'}")
        print(f"  platform: {', '.join(info.platforms) if info.platforms else '(donmedi, pc varsayilir)'}")
        if info.platforms and platform not in info.platforms:
            print(f"  UYARI : hesap {info.platforms} platformunda, sen '{platform}' sorguladin")
        if info.region and info.region.lower() != region:
            print(f"  UYARI : API bolgeyi '{info.region}' olarak veriyor, sen '{region}' girdin")

        print(f"\n[2/3] Guncel rank ({region}/{platform})")
        snapshot = await client.get_mmr(region, platform, info.puuid)
        if snapshot.tier_id is None or snapshot.tier_id < ranks.LOWEST_RANKED_TIER:
            print("  Unranked gorunuyor - yerlestirme maclari bitmemis olabilir")
        else:
            computed = ranks.elo_from(snapshot.tier_id, snapshot.rr)
            print(f"  rank  : {snapshot.tier_name} ({snapshot.rr} RR)")
            print(f"  elo   : API={snapshot.elo}  hesaplanan={computed}", end="")
            if snapshot.elo is not None and snapshot.elo != computed:
                print("  <-- UYUSMUYOR, ranks.py gozden gecirilmeli")
            else:
                print("  (uyusuyor)")
            print(f"  son mac degisimi: {snapshot.last_change:+d} RR")
            if snapshot.leaderboard_placement:
                print(f"  leaderboard: #{snapshot.leaderboard_placement}")
        if snapshot.games_needed_for_rating:
            print(f"  yerlestirme: {snapshot.games_needed_for_rating} mac daha gerekiyor")

        print(f"\n[3/3] Mac gecmisi ayristirmasi")
        entries = await client.get_mmr_history(region, platform, info.puuid)
        if not entries:
            print("  Kayit donmedi. Hesap hic competitive oynamamis olabilir,")
            print("  ya da bolge/platform yanlis.")
            return 1

        print(f"  {len(entries)} kayit dondu (yeniden eskiye):\n")
        print(f"  {'RR':>5}  {'ELO':>5}  {'RANK':<14} {'HARITA':<10} TARIH")
        print(f"  {'-' * 5}  {'-' * 5}  {'-' * 14} {'-' * 10} {'-' * 19}")
        for entry in entries[:10]:
            date = (entry.played_at or "")[:19]
            flags = []
            if entry.derank_protected:
                flags.append("derank-korumali")
            if entry.refunded_rr:
                flags.append(f"iade:{entry.refunded_rr}")
            suffix = ("  " + " ".join(flags)) if flags else ""
            print(
                f"  {entry.rr_change:>+5}  {entry.elo if entry.elo is not None else '?':>5}  "
                f"{entry.tier_name:<14} {(entry.map_name or '?'):<10} {date}{suffix}"
            )

        seasons = sorted({e.season for e in entries if e.season})
        if seasons:
            print(f"\n  Sezonlar: {', '.join(seasons)}", end="")
            print("  (act degisimi tespiti calisir)" if len(seasons) > 1 else "")
        else:
            print("\n  NOT: sezon bilgisi donmedi, act degisimi tespit edilemez")

        missing_elo = sum(1 for e in entries if e.elo is None)
        missing_date = sum(1 for e in entries if not e.played_at)
        print()
        if missing_elo:
            print(f"  NOT: {missing_elo} kayitta elo yok, tier+RR'dan hesaplanacak")
        if missing_date:
            print(f"  NOT: {missing_date} kayitta tarih yok, siralama ters cevirmeye dusecek")
        if not missing_elo and not missing_date:
            print("  Tum alanlar dolu - ayristirma sorunsuz.")

        print("\nOkuma hatti calisiyor. Bot bu hesabi takip edebilir.")
        return 0

    except henrik.HenrikError as exc:
        print(f"\nAPI hatasi: {exc}")
        return 1
    finally:
        await client.aclose()


def main() -> int:
    args = [a for a in sys.argv[1:] if a]
    if len(args) < 2:
        return usage()

    region = args[1].lower()
    if region not in henrik.VALID_REGIONS:
        print(f"Gecersiz bolge '{region}'. Secenekler: {', '.join(sorted(henrik.VALID_REGIONS))}")
        return 2

    platform = args[2].lower() if len(args) > 2 else "pc"
    if platform not in henrik.VALID_PLATFORMS:
        print(f"Gecersiz platform '{platform}'. Secenekler: pc, console")
        return 2

    return asyncio.run(run(args[0], region, platform))


if __name__ == "__main__":
    raise SystemExit(main())
