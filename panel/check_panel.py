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

    # --- Oyunlar ----------------------------------------------------------
    games = page.eval_on_selector_all("#gameSel option", "els => els.map(e => e.value)")
    check("oyun secenekleri dolduruldu",
          games == ["valorant", "ow2", "rivals", "rl", "wildrift"], str(games))

    check("valorant rank listesi 21",
          page.evaluate("ranksOfGame('valorant').length") == 21)
    check("ow2 Emerald tasiyor",
          page.evaluate("ranksOfGame('ow2').includes('Emerald 3')"))
    check("rl SSL ile bitiyor",
          page.evaluate("ranksOfGame('rl').at(-1)") == "Supersonic Legend")
    check("yalnizca valorant tracked",
          page.evaluate("GAMES.filter(g=>g.tracked).map(g=>g.id).join(',')") == "valorant")

    # Oyun degisince rank <select>'leri o oyunun merdiveniyle dolmali.
    page.evaluate("document.getElementById('gameSel').value='rl'; onGameChange();")
    opts = page.eval_on_selector_all("#baslangic option", "els => els.map(e => e.value)")
    check("oyun degisince rank listesi yenilendi",
          opts == page.evaluate("ranksOfGame('rl')"), str(opts[:4]))
    check("takip disi oyunda Riot ID gizlendi",
          page.eval_on_selector("#riotIdField", "el => el.classList.contains('hidden')"))

    page.evaluate("document.getElementById('gameSel').value='valorant'; onGameChange();")
    check("valorant'ta Riot ID geri geldi",
          not page.eval_on_selector("#riotIdField", "el => el.classList.contains('hidden')"))

    # Eski duz fiyat verisi valorant'a tasinmali (geriye donuk uyumluluk).
    nested = page.evaluate("JSON.stringify(unnest({'Gold 1':100,'Gold 2':120}))")
    check("eski duz fiyat verisi valorant'a tasindi",
          nested == '{"valorant":{"Gold 1":100,"Gold 2":120}}', nested)
    already = page.evaluate("JSON.stringify(unnest({valorant:{'Gold 1':100},rl:{}}))")
    check("yeni format oldugu gibi kaliyor", '"rl"' in already, already)

    # Fiyat motoru oyun bazli: RL adimlarini doldurup RL fiyati hesapliyoruz.
    total = page.evaluate("""
      STEP_PRICE = { rl: {'Gold I':50,'Gold II':60,'Gold III':70} };
      calcOffer('Gold I','Platinum I',{game:'rl',region:'TR'}).base;
    """)
    check("fiyat motoru oyunun adim fiyatlarini kullaniyor", total == 180, str(total))
    check("valorant fiyatlari RL'den etkilenmiyor",
          page.evaluate("calcOffer('Gold 1','Gold 3',{game:'valorant'}).base") == 0)

    # DOM id cakismasi: 'Champion' ve 'Grand Champion III' eski kisaltmada
    # ayni id'ye dusuyordu, fiyat kaydederken yanlis kutudan okunurdu.
    for gid in ["valorant", "ow2", "rivals", "rl", "wildrift"]:
        sm = page.evaluate(f"Object.values(shortMapOf(ranksOfGame('{gid}')))")
        dupes = sorted({x for x in sm if sm.count(x) > 1})
        check(f"{gid}: matris kisaltmalari cakismiyor", not dupes, str(dupes[:4]))
    # Valorant tek harfte kalmali (B1/S2/G3...), OW2 Gold-Grandmaster ayrimi
    # icin ikiye cikmali.
    check("valorant kisaltmasi tek harf",
          page.evaluate("shortMapOf(ranksOfGame('valorant'))['Bronze 1']") == "B1")
    check("ow2 Gold ve Grandmaster ayrisiyor",
          page.evaluate("shortMapOf(ranksOfGame('ow2'))['Gold 5']") == "Go5"
          and page.evaluate("shortMapOf(ranksOfGame('ow2'))['Grandmaster 5']") == "Gr5")

    # --- Kabuk (sidebar + topbar) -----------------------------------------
    # .shell display:flex ile .hidden ayni ozgullukte; .shell.hidden yazilmazsa
    # giris ekraninin arkasinda panel gorunur ve tiklamalari yutar. Bu tam
    # olarak drawer'da yasanan hata.
    check("giris ekraninda kabuk gercekten gizli",
          page.eval_on_selector("#app", "el => getComputedStyle(el).display") == "none")
    ust = page.evaluate(
        "(() => {const e=document.elementFromPoint(innerWidth/2,innerHeight/2);"
        " return e && e.closest('#app') ? 'panel' : 'giris';})()")
    check("gizli kabuk giris ekranini yutmuyor", ust == "giris", ust)

    check("#search tek", page.eval_on_selector_all("#search", "e => e.length") == 1)
    for gid in ["syncStatus", "tabBar", "statsRow", "whoAmI", "recordList", "priceTables"]:
        check(f"#{gid} korundu", page.eval_on_selector_all(f"#{gid}", "e => e.length") == 1)

    # Admin ve booster navigasyonu
    page.evaluate("me={id:'u1',role:'admin',display_name:'Rex'}; buildTabs(); renderMeCard();")
    admin_nav = page.eval_on_selector_all("#tabBar .nav-item", "els => els.map(e => e.dataset.tab)")
    check("admin navigasyonu tam",
          admin_nav == ["genel","siparis","rapor","arsiv","boosterlar","hesap","fiyat","profil"],
          str(admin_nav))
    check("admin avatari", page.eval_on_selector("#meInitial", "e => e.textContent") == "R")

    page.evaluate("me={id:'u2',role:'booster',display_name:'ali'}; buildTabs(); renderMeCard();")
    booster_nav = page.eval_on_selector_all("#tabBar .nav-item", "els => els.map(e => e.dataset.tab)")
    check("booster navigasyonu kisitli",
          booster_nav == ["siparis","fiyat","profil"], str(booster_nav))
    check("booster finans sekmelerini gormuyor",
          not ({"rapor","arsiv","boosterlar"} & set(booster_nav)))
    check("booster rol etiketi",
          page.eval_on_selector("#meRole", "e => e.textContent") == "Booster")
    # Rol degisince gecerli sekme o rolde yoksa ilkine dusmeli, yoksa bos ekran.
    check("rol degisince gecerli sekme duzeltildi",
          page.evaluate("currentTab") == "siparis", page.evaluate("currentTab"))

    page.evaluate("me={id:'u1',role:'admin',display_name:'Rex'}; buildTabs();")
    page.evaluate("switchTab('fiyat')")
    check("sekme degisince baslik guncellendi",
          page.eval_on_selector("#pageTitle", "e => e.textContent") == "Fiyat Listesi")
    check("aktif nav vurgusu tasindi",
          page.eval_on_selector("#tabBar .nav-item.active", "e => e.dataset.tab") == "fiyat")
    check("statsRow yalnizca siparislerde",
          page.eval_on_selector("#statsRow", "e => e.classList.contains('hidden')"))
    page.evaluate("switchTab('siparis')")
    check("siparislerde statsRow geri geldi",
          not page.eval_on_selector("#statsRow", "e => e.classList.contains('hidden')"))

    # --- Sahte veriyle tam senaryo ---------------------------------------
    page.evaluate("""
      me = { id:'admin1', role:'admin', display_name:'Rex' };
      people = [{id:'b1',display_name:'Ali',role:'booster',active:true},
                {id:'b2',display_name:'Veli',role:'booster',active:true}];
      const mk = (id,o) => Object.assign({
        id, game:'valorant', orderType:'rank', baslangic:'Gold 1', hedef:'Plat 1',
        winCount:0, jobDesc:'', startRR:0, region:'TR', riotId:'', extras:[],
        extraWin:false, durum:'yeni', tarih:'2026-08-16', not:'', image:null,
        boosterId:'b1', payout:500, paid:false, archived:false,
        created:'2026-08-15T10:00:00' }, o);
      records = [
        mk('o1',{durum:'atandi', boosterId:null}),   // celiskili: atanmis ama boostcu yok
        mk('o2',{durum:'atandi', riotId:'A#TR1'}),
        mk('o3',{durum:'devam', riotId:'B#TR1'}),
        mk('o4',{durum:'devam', game:'rl', baslangic:'Gold I', hedef:'Platinum I'}),
        mk('o5',{durum:'tamam', paid:false}),
        mk('o6',{durum:'tamam', paid:true, archived:true}),
      ];
      finance = { o2:{platform:'Eldorado',cost:20,costCur:'USD',feePct:10,costTL:800,rate:40},
                  o3:{platform:'Eldorado',cost:30,costCur:'USD',feePct:10,costTL:1200,rate:40} };
      tracker = { o3:{order_id:'o3',puuid:'p3',start_elo:900,current_elo:1000,target_elo:1100,
                      paused:false,last_poll_at:new Date(Date.now()-120000).toISOString(),
                      last_match_at:new Date(Date.now()-3600000).toISOString(),loss_streak:0} };
      buildTabs(); renderMeCard(); switchTab('siparis'); render();
    """)
    page.wait_for_timeout(150)

    # Durum sekmeleri ve sayaclari (#filterDurum artik yok)
    st = page.eval_on_selector_all("#statusTabs .st-tab", "els => els.map(e => e.textContent.trim())")
    check("durum sekmeleri sayacli", st[0].startswith("Tümü") and "5" in st[0], str(st))
    check("#filterDurum kaldirildi", page.eval_on_selector_all("#filterDurum", "e => e.length") == 0)

    page.evaluate("setOrdersDurum('devam')")
    check("durum sekmesi suzuyor", page.evaluate("filterRecords().length") == 2)
    page.evaluate("setOrdersDurum('')")

    # Uc gorunum
    page.evaluate("setOrdersView('tablo')")
    check("tablo cizildi", page.eval_on_selector_all(".otable tbody tr", "e => e.length") == 5)
    check("tablo modunda form gizli",
          page.eval_on_selector("#formPanel", "e => getComputedStyle(e).display") == "none")
    check("form DOM'da duruyor", page.eval_on_selector_all("#formPanel", "e => e.length") == 1)

    page.evaluate("setOrdersView('pano')")
    check("pano sutunlari", page.eval_on_selector_all(".bcol", "e => e.length") == 4)
    page.evaluate("setOrdersView('kart')")
    check("kart gorunumune donuldu", page.eval_on_selector_all(".rec", "e => e.length") == 5)
    check("kart modunda form geri geldi",
          page.eval_on_selector("#formPanel", "e => getComputedStyle(e).display") != "none")

    # newOrder tablo modundayken de forma goturmeli
    page.evaluate("setOrdersView('tablo'); newOrder();")
    check("yeni siparis butonu formu geri getiriyor",
          page.eval_on_selector("#formPanel", "e => getComputedStyle(e).display") != "none")
    page.evaluate("setOrdersView('kart')")

    # Toplu secim gorunur listeye kirpilmali
    page.evaluate("selAll(true)")
    check("hepsini sec", page.evaluate("ordersView.sel.size") == 5)
    page.evaluate("setOrdersDurum('yeni')")
    check("filtre degisince secim kirpildi", page.evaluate("ordersView.sel.size") <= 1,
          str(page.evaluate("ordersView.sel.size")))
    page.evaluate("setOrdersDurum(''); selAll(false)")

    # Uyari modeli tek kaynak: zil ve Genel Bakis ayni sayiyi vermeli
    page.evaluate("switchTab('genel')")
    page.wait_for_timeout(120)
    zil = page.evaluate("alertModel().length")
    kart = page.eval_on_selector(".ov-h .ov-n", "e => Number(e.textContent)")
    check("zil ve Genel Bakis ayni uyari sayisi", zil == kart, f"zil={zil} kart={kart}")
    check("uyari uretildi", zil > 0)
    check("celiskili atama uyarisi uretiliyor",
          page.evaluate("alertModel().some(a => a.tur === 'atanmadi' && a.id === 'o1')"))
    # 'yeni' durumdaki bir is henuz atanmamis olabilir - bu normal, uyari degil.
    check("yeni durumdaki is bosuna uyari uretmiyor",
          page.evaluate("(() => {records.push(Object.assign({},records[0],"
                        "{id:'oX',durum:'yeni',boosterId:null}));"
                        "const v = alertModel().some(a => a.id === 'oX');"
                        "records.pop(); return !v;})()"))
    check("RL siparisi takip uyarisi uretmiyor",
          page.evaluate("!alertModel().some(a => a.id === 'o4' && "
                        "['baglanmadi','takildi','kayip'].includes(a.tur))"))

    check("KPI kartlari cizildi", page.eval_on_selector_all(".ov-kpi", "e => e.length") == 4)
    check("huni durum sayisi", page.eval_on_selector_all(".ov-fun", "e => e.length") == 4)
    check("oyun kirilimi iki oyun", page.eval_on_selector_all(".ov-game", "e => e.length") == 2)
    check("bot kutusu calisiyor diyor", "çalışıyor" in page.inner_text("#botBox"))

    # Genel Bakis'tan siparislere filtreyle gitmek
    page.evaluate("setOrdersFilter({durum:'devam',archive:'active'})")
    check("filtre gecisi sekmeyi degistirdi", page.evaluate("currentTab") == "siparis")
    check("filtre gecisi durumu uyguladi", page.evaluate("ordersView.durum") == "devam")

    # Booster: finans hic gormemeli
    page.evaluate("me={id:'b1',role:'booster',display_name:'Ali'}; buildTabs(); applyRoleUI(); switchTab('siparis');")
    page.wait_for_timeout(120)
    check("booster finans uyarisi almiyor",
          page.evaluate("!alertModel().some(a => ['finansyok','odenmedi'].includes(a.tur))"))
    page.evaluate("setOrdersView('tablo')")
    basliklar = page.eval_on_selector_all(".otable th", "els => els.map(e => e.textContent.trim())")
    check("booster tablosunda kar sutunu yok", "Kâr" not in basliklar, str(basliklar))
    check("booster tablosunda booster sutunu yok", "Booster" not in basliklar, str(basliklar))
    page.evaluate("setOrdersView('kart')")

    # --- .hidden özgüllük tuzağı: GENEL kontrol ---------------------------
    # style.css'te .hidden{display:none} tek sınıf özgüllüğünde. Sonradan
    # eklenen her `display:` kuralı onu ezebiliyor. Bu hata üç kez yaşandı
    # (.shell, .drawer, .bulk-bar) — tek tek test etmek yerine sayfadaki
    # TÜM .hidden elemanlarının gerçekten gizli olduğunu doğruluyoruz.
    page.evaluate("switchTab('siparis'); setOrdersView('kart'); selAll(false);")
    page.wait_for_timeout(120)
    sizmis = page.evaluate("""
      [...document.querySelectorAll('.hidden')]
        .filter(e => getComputedStyle(e).display !== 'none')
        .map(e => e.id || e.className)
    """)
    check(".hidden tasiyan her eleman gercekten gizli", not sizmis, str(sizmis[:5]))

    browser.close()

print(f"\n{'BASARISIZ: ' + ', '.join(failures) if failures else 'panel kontrolleri gecti.'}")
sys.exit(1 if failures else 0)
