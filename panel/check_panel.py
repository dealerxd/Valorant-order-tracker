"""Paneli gercek tarayicida acip DOM tarafini dogrular.

    pip install playwright
    python panel/check_panel.py

tracker/test_smoke.py sozlesmenin Python tarafini ve uretilmis dosyanin guncel
olup olmadigini kontrol ediyor. Bu betik geri kalanini kontrol eder: uretilmis
dosya tarayiciya gercekten ulasiyor mu, script sirasi dogru mu, data-region /
data-status alanlari doluyor mu.

Aga cikmaz - Supabase CDN'i saplama (stub) ile degistirilir, digerleri kesilir.
Playwright kurulu degilse atlanabilir; zorunlu bir bagimlilik degil, o yuzden
requirements.txt'te yok.
"""
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

INDEX = pathlib.Path(__file__).resolve().parent / "index.html"

# window.supabase saplamasi - createClient zincirlenebilir bos bir istemci doner.
STUB = """
window.supabase = {
  createClient: () => {
    const q = new Proxy({}, { get: () => (...a) => q, apply: () => q });
    const thenable = { then: (r) => r({ data: [], error: null }) };
    const chain = new Proxy(thenable, {
      get: (t, k) => (k in t ? t[k] : (...a) => chain),
    });
    return {
      from: () => chain,
      channel: () => ({ on: () => ({ subscribe: () => {} }) }),
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        getUser: () => Promise.resolve({ data: { user: null } }),
      },
    };
  },
};
"""

errors = []
failures = []


def check(label, cond, detail=""):
    if cond:
        print(f"  ok  {label}")
    else:
        failures.append(label)
        print(f"  BASARISIZ  {label}  {detail}")


with sync_playwright() as p:
    # Normalde `playwright install` ile gelen tarayici kullanilir; hazir
    # Chromium'u olan ortamlarda CHROMIUM_PATH ile yol verilebilir.
    exe = os.getenv("CHROMIUM_PATH") or None
    browser = p.chromium.launch(executable_path=exe)
    page = browser.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    # Kendi route.abort()'umuzun urettigi ag gurultusu sayilmaz; JS hatasi ariyoruz.
    page.on("console", lambda m: errors.append(m.text)
            if m.type == "error" and "Failed to load resource" not in m.text else None)

    # Supabase CDN'ini saplamayla degistir; disari cikma.
    page.route("**/supabase-js@2**", lambda route: route.fulfill(
        status=200, content_type="application/javascript", body=STUB))
    page.route("https://**", lambda route: route.abort())

    page.goto(INDEX.as_uri(), wait_until="load")
    page.wait_for_timeout(400)

    print("[panel tarayicida]")
    check("sayfa JS hatasiz yuklendi", not errors, "; ".join(errors[:3]))

    regions = page.eval_on_selector_all(
        "#region option", "els => els.map(e => e.value)")
    check("form bolge secenekleri dolduruldu",
          regions == ["TR", "EU", "NA", "Diğer"], str(regions))

    calc_regions = page.eval_on_selector_all(
        "#cRegion option", "els => els.map(e => e.value)")
    check("hesaplayici bolge secenekleri dolduruldu",
          calc_regions == ["TR", "EU", "NA", "Diğer"], str(calc_regions))

    statuses = page.eval_on_selector_all(
        "#durum option", "els => els.map(e => e.value)")
    check("durum secenekleri dolduruldu (odendi haric)",
          statuses == ["yeni", "atandi", "devam", "tamam"], str(statuses))

    labels = page.eval_on_selector_all(
        "#durum option", "els => els.map(e => e.textContent)")
    check("durum etiketleri sozlesmeden",
          labels == ["Yeni", "Atandı", "Devam", "Tamam"], str(labels))

    check("RANK_ORDER uretilmis dosyadan geldi",
          page.evaluate("RANK_ORDER.length") == 21
          and page.evaluate("RANK_ORDER[0]") == "Bronze 1"
          and page.evaluate("RANK_ORDER[9]") == "Plat 1")
    check("TABLES sozlesmeden", page.evaluate("TABLES.orders") == "resells")
    check("NEXT_STATUS akisi", page.evaluate("NEXT_STATUS.atandi") == "devam")
    check("REGION_MULT panelde secilemeyenleri de tasiyor",
          page.evaluate("REGION_MULT.NA") == 1.05 and page.evaluate("REGION_MULT.AP") == 1.1)

    # Fiyat motoru rank listesiyle hala calisiyor mu (STEP_PRICE bos ama
    # calcOffer indeks aritmetigi RANK_ORDER'a bagli).
    offer = page.evaluate(
        "JSON.stringify(calcOffer('Gold 1','Plat 1',{region:'NA'}))")
    check("calcOffer rank listesiyle calisiyor", offer != "null", offer)

    # --- Detay drawer'i ---------------------------------------------------
    # Elo -> rank cevirimi tarayicida da dogru mu (test_smoke.py bunu node ile
    # kontrol ediyor, burada gercek sayfada calistigini dogruluyoruz).
    check("rankFromElo tarayicida calisiyor",
          page.evaluate("rankFromElo(1538).label") == "Diamond 1"
          and page.evaluate("rankFromElo(1538).rr") == 38)
    check("Immortal ustu RR kumulatif",
          page.evaluate("rankFromElo(2291).rr") == 191)
    check("eloProgress orani",
          abs(page.evaluate("eloProgress(900,1000,1100)") - 0.5) < 1e-9)
    check("hedef gecilince oran 1'de kaliyor",
          page.evaluate("eloProgress(900,9999,1100)") == 1)

    check("drawer basta gercekten gizli",
          page.eval_on_selector("#drawer", "el => getComputedStyle(el).display") == "none")
    # Karartma tiklamalari yutmamali: sayfanin ortasindaki eleman drawer
    # olmamali, yoksa panel kullanilamaz hale gelir.
    top = page.evaluate(
        "(() => {const e=document.elementFromPoint(innerWidth/2,innerHeight/2);"
        " return e ? (e.closest('#drawer') ? 'drawer' : 'sayfa') : 'yok';})()")
    check("kapali drawer tiklamalari yutmuyor", top == "sayfa", top)

    # Drawer'i sahte bir siparisle ac: records/tracker global'lerini doldurup
    # openDetail cagiriyoruz. Supabase saplama oldugu icin mac sorgusu bos doner,
    # yuklenemedi yolunun da cizildigini gormus oluyoruz.
    page.evaluate("""
      me = { id:'u1', display_name:'Test', role:'admin' };
      records = [{ id:'o1', orderType:'rank', baslangic:'Gold 1', hedef:'Plat 1',
        winCount:0, jobDesc:'', startRR:0, region:'TR', riotId:'Boost#TR1',
        extras:[], extraWin:false, durum:'devam', tarih:'2026-08-16', not:'',
        image:null, boosterId:null, payout:500, paid:false, archived:false, created:'' }];
      tracker = { o1: { order_id:'o1', start_elo:900, current_elo:1000,
        target_elo:1100, paused:false } };
      openDetail('o1');
    """)
    page.wait_for_timeout(200)

    check("drawer acildi",
          page.eval_on_selector("#drawer", "el => getComputedStyle(el).display") == "flex")
    body = page.inner_text("#drawerBody")
    check("drawer ilerleme yuzdesi gosteriyor", "%50" in body, body[:200])
    check("drawer baslangic rank'i gosteriyor", "Gold 1" in body, body[:200])
    check("drawer hedef rank'i gosteriyor", "Plat 1" in body, body[:200])
    check("drawer guncel rank'i gosteriyor", "Gold 2" in body, body[:200])
    check("drawer kalan RR'i gosteriyor", "100 RR" in body, body[:200])
    # Inline style yerine gercek genisligi olcuyoruz: tarayici "50.0%" degerini
    # "50%"e normalize ediyor, string karsilastirmasi kirilgan olurdu.
    fill_ratio = page.evaluate(
        "document.querySelector('.d-fill').getBoundingClientRect().width"
        " / document.querySelector('.d-bar').getBoundingClientRect().width")
    check("ilerleme cubugu gorsel olarak yarida", abs(fill_ratio - 0.5) < 0.02,
          f"olculen oran {fill_ratio:.3f}")

    page.evaluate("closeDetail()")
    check("drawer kapandi",
          page.eval_on_selector("#drawer", "el => getComputedStyle(el).display") == "none")
    check("kapaninca sayfa yine tiklanabilir",
          page.evaluate(
            "(() => {const e=document.elementFromPoint(innerWidth/2,innerHeight/2);"
            " return !e || !e.closest('#drawer');})()"))

    browser.close()

print(f"\n{'BASARISIZ: ' + ', '.join(failures) if failures else 'panel kontrolleri gecti.'}")
sys.exit(1 if failures else 0)
