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
          admin_nav == ["genel","siparis","arsiv","odeme","rapor","hesap","fiyat","boosterlar","profil"],
          str(admin_nav))
    # Nav gruplu: dokuz duz satir taranamiyordu.
    check("nav uc grupta",
          page.eval_on_selector_all("#tabBar .nav-group", "e => e.length") == 3)
    check("grup basliklari",
          page.eval_on_selector_all("#tabBar .nav-group-h", "e => e.map(x => x.textContent.trim())")
          == ["İŞLER", "PARA", "EKİP"],
          str(page.eval_on_selector_all("#tabBar .nav-group-h", "e => e.map(x => x.textContent.trim())")))
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
      people = [{id:'admin1',display_name:'Rex',role:'admin',active:true},
                {id:'b1',display_name:'Ali',role:'booster',active:true},
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
    # Form artik modalda: gorunum modu ne olursa olsun liste tam genislikte,
    # form yalnizca acildiginda ustte cikiyor.
    check("form modali basta kapali",
          page.eval_on_selector("#formModal", "e => getComputedStyle(e).display") == "none")
    check("form DOM'da duruyor", page.eval_on_selector_all("#formPanel", "e => e.length") == 1)
    check("kapali modal tiklamalari yutmuyor",
          page.evaluate(
            "(() => {const e=document.elementFromPoint(innerWidth/2,innerHeight/2);"
            " return !e || !e.closest('#formModal');})()"))

    page.evaluate("setOrdersView('pano')")
    check("pano sutunlari", page.eval_on_selector_all(".bcol", "e => e.length") == 4)
    page.evaluate("setOrdersView('kart')")
    check("kart gorunumune donuldu", page.eval_on_selector_all(".rec", "e => e.length") == 5)

    # newOrder her gorunum modunda formu acmali
    page.evaluate("setOrdersView('tablo'); newOrder();")
    check("yeni siparis butonu formu aciyor",
          page.eval_on_selector("#formModal", "e => getComputedStyle(e).display") != "none")
    page.evaluate("hideForm(); setOrdersView('kart')")

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

    check("KPI kartlari cizildi", page.eval_on_selector_all(".ov-kpi", "e => e.length") == 5)
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

    # --- Doğrulama turunda bulunan hataların regresyon testleri -----------
    page.evaluate("""
      me = { id:'admin1', role:'admin', display_name:'Rex' };
      records = [
        {id:'A',game:'valorant',orderType:'rank',baslangic:'Gold 1',hedef:'Plat 1',winCount:0,
         jobDesc:'',startRR:0,region:'TR',riotId:'',extras:[],extraWin:false,durum:'devam',
         tarih:'2026-08-16',not:'',image:null,boosterId:'b1',payout:400,paid:false,
         archived:false,created:'2026-08-15T10:00:00'},
        {id:'B',game:'valorant',orderType:'rank',baslangic:'Gold 1',hedef:'Plat 1',winCount:0,
         jobDesc:'',startRR:0,region:'TR',riotId:'',extras:[],extraWin:false,durum:'tamam',
         tarih:'2026-08-16',not:'',image:null,boosterId:'b1',payout:800,paid:false,
         archived:false,created:'2026-08-15T10:00:00'},
        {id:'C',game:'valorant',orderType:'rank',baslangic:'Gold 1',hedef:'Plat 1',winCount:0,
         jobDesc:'',startRR:0,region:'TR',riotId:'',extras:[],extraWin:false,durum:'devam',
         tarih:'2026-08-16',not:'',image:null,boosterId:'b1',payout:500,paid:false,
         archived:false,created:'2026-08-15T10:00:00'}
      ];
      finance = { A:{platform:'E',cost:25,costCur:'USD',feePct:10,costTL:1000,rate:40},
                  B:{platform:'E',cost:50,costCur:'USD',feePct:0, costTL:2000,rate:40} };
      tracker = {};
      switchTab('siparis'); render();
    """)
    page.wait_for_timeout(120)

    # Aynı etiket, aynı sayı: Siparişler stat satırı ile Genel Bakış KPI'ı
    stat_kar = page.eval_on_selector_all("#statsRow .stat",
        "els => { const e = els.find(x => x.textContent.includes('Net Kâr'));"
        " return e ? e.querySelector('.value').textContent.trim() : null; }")
    page.evaluate("switchTab('genel')"); page.wait_for_timeout(120)
    ov_kar = page.eval_on_selector_all(".ov-kpi",
        "els => { const e = els.find(x => x.textContent.includes('Net kâr'));"
        " return e ? e.querySelector('.ov-kpi-v').textContent.trim() : null; }")
    check("Net kâr iki ekranda ayni", stat_kar == ov_kar, f"siparisler={stat_kar} genel={ov_kar}")

    # Booster'in ILK isi: form varsayilanlari giris YAPILMADAN kuruluyor
    # (me=null), o an durum 'yeni'ye dusuyordu. Bot 'yeni' siparisleri
    # yoklamiyor -> ilk is sessizce takipsiz kalirdi. afterLogin artik rol
    # belli olduktan sonra resetForm() cagiriyor.
    page.evaluate("me = { id:'b9', role:'booster', display_name:'Yeni' };"
                  "buildTabs(); applyRoleUI(); resetForm();")
    check("booster girisinden sonra form varsayilani 'atandi'",
          page.eval_on_selector("#durum", "e => e.value") == "atandi",
          page.eval_on_selector("#durum", "e => e.value"))
    page.evaluate("me = { id:'admin1', role:'admin', display_name:'Rex' };"
                  "buildTabs(); applyRoleUI(); resetForm();")
    check("admin girisinden sonra form varsayilani 'yeni'",
          page.eval_on_selector("#durum", "e => e.value") == "yeni")
    page.evaluate("switchTab('siparis'); render();")

    page.evaluate("switchTab('siparis'); render();")
    stat_borc = page.eval_on_selector_all("#statsRow .stat",
        "els => { const e = els.find(x => x.textContent.includes('Booster Borcu'));"
        " return e ? e.querySelector('.value').textContent.trim() : null; }")
    page.evaluate("switchTab('genel')"); page.wait_for_timeout(120)
    ov_borc = page.eval_on_selector_all(".ov-kpi",
        "els => { const e = els.find(x => x.textContent.includes('Booster borcu'));"
        " return e ? e.querySelector('.ov-kpi-v').textContent.trim() : null; }")
    check("Booster borcu iki ekranda ayni", stat_borc == ov_borc, f"{stat_borc} / {ov_borc}")

    # Finans kaydi olmayan is varsa Net kar ipucu bunu SOYLEMELI
    check("finanssiz is ipucta belirtiliyor",
          "girilmemiş" in page.eval_on_selector_all(".ov-kpi",
            "els => { const e = els.find(x => x.textContent.includes('Net kâr'));"
            " return e ? e.querySelector('.ov-kpi-h').textContent : ''; }"))

    # Zarar kirmizi gosterilmeli
    page.evaluate("records.forEach(r => r.payout = 99999); render(); renderOverview();")
    check("zarar kirmizi gosteriliyor",
          page.eval_on_selector_all(".ov-kpi",
            "els => { const e = els.find(x => x.textContent.includes('Net kâr'));"
            " return e ? e.className : ''; }").find("red") >= 0)
    page.evaluate("records.forEach((r,i) => r.payout = [400,800,500][i]);")

    # 'Acik siparis' KPI'i tiklayinca AYNI sayiyi gostermeli
    page.evaluate("switchTab('genel')"); page.wait_for_timeout(120)
    kpi_acik = page.eval_on_selector_all(".ov-kpi",
        "els => { const e = els.find(x => x.textContent.includes('Açık sipariş'));"
        " return e ? Number(e.querySelector('.ov-kpi-v').textContent) : -1; }")
    page.evaluate("setOrdersFilter({durum:'acik',archive:'active'})")
    check("Acik siparis KPI'i tiklayinca ayni sayi",
          page.evaluate("filterRecords().length") == kpi_acik,
          f"kpi={kpi_acik} liste={page.evaluate('filterRecords().length')}")
    page.evaluate("setOrdersDurum('')")

    # Yeni baglanan siparis aninda 'takildi' uyarisi uretmemeli
    page.evaluate("tracker = { A:{order_id:'A',puuid:'p',start_elo:900,current_elo:900,"
                  "target_elo:1100,paused:false,last_poll_at:new Date().toISOString(),"
                  "last_match_at:null,loss_streak:0} };")
    check("yeni baglanan siparis 'takildi' uyarisi uretmiyor",
          page.evaluate("!alertModel().some(a => a.tur === 'takildi')"))
    page.evaluate("tracker = {};")

    # Bildirim noktasi SAYI degil KIMLIK karsilastirmali
    page.evaluate("markNotifSeen();")
    check("okundu isaretlenince nokta sonuyor",
          page.eval_on_selector("#notifDot", "e => e.classList.contains('hidden')"))
    page.evaluate("records[2].durum='devam'; records[2].boosterId=null; renderNotifDot();")
    check("uyari sayisi artmasa da YENI uyari bildiriliyor",
          not page.eval_on_selector("#notifDot", "e => e.classList.contains('hidden')"))

    # Hayalet drawer: olmayan kayit drawer'i acmamali
    page.evaluate("closeDetail(); openDetail('YOK-BOYLE-BIR-ID');")
    check("olmayan kayit drawer'i acmiyor",
          page.eval_on_selector("#drawer", "e => getComputedStyle(e).display") == "none")

    # Acik form render() ile kaybolmamali (realtime tazelemesi yazilan veriyi silmesin)
    page.evaluate("setOrdersView('tablo'); newOrder();")
    page.evaluate("document.getElementById('not').value='yazmakta oldugum not'; render();")
    check("render acik formu gizlemiyor",
          page.eval_on_selector("#formModal", "e => getComputedStyle(e).display") != "none")
    check("formdaki yazi korundu",
          page.eval_on_selector("#not", "e => e.value") == "yazmakta oldugum not")
    page.evaluate("resetForm(); render();")
    check("form kapandi",
          page.eval_on_selector("#formModal", "e => getComputedStyle(e).display") == "none")
    # Escape zinciri: modal en ustteki katman.
    page.evaluate("newOrder()")
    page.keyboard.press("Escape")
    check("Escape modali kapatiyor",
          page.eval_on_selector("#formModal", "e => getComputedStyle(e).display") == "none")
    check("modal kapaninca sayfa kaydirmasi geri geldi",
          page.evaluate("document.body.style.overflow") == "")
    page.evaluate("setOrdersView('kart')")

    # Eski 'odendi' kayitlari panoda gorunmeli
    page.evaluate("records.push(Object.assign({},records[0],{id:'D',durum:'odendi'}));"
                  "setOrdersView('pano'); render();")
    check("odendi kaydi panoda sutun buluyor",
          page.evaluate("[...document.querySelectorAll('.bcard')].length") == 4,
          str(page.evaluate("[...document.querySelectorAll('.bcard')].length")))
    check("odendi durum sekmesi cikti",
          "Ödendi" in page.eval_on_selector("#statusTabs", "e => e.textContent"))
    page.evaluate("records.pop(); setOrdersView('kart'); render();")

    # XSS: durum ve metin alanlari attribute'a escape edilerek giriyor
    # Payload argüman olarak geçiyor — kaynak dosyada tırnak kaçışıyla uğraşmamak için.
    page.evaluate("p => { records[0].durum = p; render(); }",
                  'x" onmouseover="window.__xss=1')
    page.evaluate("setOrdersView('tablo'); render();")
    check("tabloda attribute enjeksiyonu yok",
          page.evaluate("window.__xss === undefined"))
    page.evaluate("setOrdersView('pano'); render();")
    check("panoda attribute enjeksiyonu yok", page.evaluate("window.__xss === undefined"))
    page.evaluate("records[0].durum='devam'; setOrdersView('kart'); render();")

    # Booster panoda diger boosterlarin adini gormemeli
    page.evaluate("me={id:'b1',role:'booster',display_name:'Ali'}; applyRoleUI();"
                  "setOrdersView('pano'); render();")
    check("booster panoda booster adi gormuyor",
          page.eval_on_selector_all(".bcard .chip.booster", "e => e.length") == 0)
    page.evaluate("me={id:'admin1',role:'admin',display_name:'Rex'}; setOrdersView('kart'); render();")

    # --- Dış kaynak + Ödemeler --------------------------------------------
    # Dış kaynak bilgisi `note` alanına gömülüydü (yüklenen paneldeki hata):
    # notu düzenlemek borcu siliyordu ve bot notu müşteriye "Panel notu:" diye
    # iletince satıcı maliyeti sızıyordu. Artık kendi kolonlarında.
    page.evaluate("""
      me = { id:'admin1', role:'admin', display_name:'Rex' };
      records = [
        {id:'A',game:'valorant',orderType:'rank',baslangic:'Gold 1',hedef:'Plat 1',winCount:0,
         jobDesc:'',startRR:0,region:'TR',riotId:'',extras:[],extraWin:false,durum:'tamam',
         tarih:'2026-08-16',not:'',image:null,boosterId:'b1',payout:400,paid:false,
         archived:false,created:'2026-08-15T10:00:00',
         vendor:'',vendorCost:0,vendorCur:'USD',vendorPaid:false},
        {id:'B',game:'valorant',orderType:'rank',baslangic:'Gold 1',hedef:'Plat 1',winCount:0,
         jobDesc:'',startRR:0,region:'TR',riotId:'',extras:[],extraWin:false,durum:'devam',
         tarih:'2026-08-16',not:'',image:null,boosterId:null,payout:0,paid:false,
         archived:false,created:'2026-08-15T10:00:00',
         vendor:'Mert',vendorCost:20,vendorCur:'USD',vendorPaid:false},
        {id:'C',game:'valorant',orderType:'rank',baslangic:'Gold 1',hedef:'Plat 1',winCount:0,
         jobDesc:'',startRR:0,region:'TR',riotId:'',extras:[],extraWin:false,durum:'devam',
         tarih:'2026-08-16',not:'',image:null,boosterId:null,payout:0,paid:false,
         archived:false,created:'2026-08-15T10:00:00',
         vendor:'Mert',vendorCost:300,vendorCur:'TRY',vendorPaid:false}
      ];
      finance = { A:{platform:'E',cost:25,costCur:'USD',feePct:0,costTL:1000,rate:40},
                  B:{platform:'E',cost:50,costCur:'USD',feePct:0,costTL:2000,rate:40},
                  C:{platform:'E',cost:50,costCur:'USD',feePct:0,costTL:2000,rate:40} };
      tracker = {}; switchTab('siparis'); render();
    """)
    page.wait_for_timeout(120)

    check("dis kaynak isi isDis ile taniniyor",
          page.evaluate("isDis(records[1]) && !isDis(records[0])"))
    # 20 USD, siparişin kendi kurundan (40) → 800 TL. TRY olan çevrilmez.
    check("dis maliyet siparisin kurundan TL'ye ceevriliyor",
          page.evaluate("disMaliyetTL(records[1])") == 800,
          str(page.evaluate("disMaliyetTL(records[1])")))
    check("TRY maliyet oldugu gibi kaliyor",
          page.evaluate("disMaliyetTL(records[2])") == 300)
    check("dis gider kardan dusuluyor",
          page.evaluate("paraOzeti().disGider") == 1100,
          str(page.evaluate("paraOzeti().disGider")))
    check("kar = net gelir - ucret - dis gider",
          page.evaluate("(P => P.kar === P.netGelir - P.ucret - P.disGider)(paraOzeti())"))

    # Kuru bilinmeyen döviz maliyeti sessizce 0 sayılmamalı, ekranda söylenmeli.
    page.evaluate("delete finance.B.rate;")
    check("kuru olmayan dis maliyet 0 sayiliyor",
          page.evaluate("disMaliyetTL(records[1])") == 0)
    check("kuru olmayan is sayiliyor", page.evaluate("paraOzeti().kurYok") == 1)
    page.evaluate("finance.B.rate = 40;")

    # Ödemeler ekranı
    page.evaluate("switchTab('odeme')"); page.wait_for_timeout(150)
    odeme = page.inner_text("#odemeBody")
    check("odeme ekrani satici grubunu gosteriyor", "Mert" in odeme, odeme[:200])
    check("odeme ekrani booster borcunu gosteriyor",
          page.evaluate("paraOzeti().borc") == 400)
    check("satici borcu iki isi topluyor",
          page.evaluate("paraOzeti().disBorc") == 1100,
          str(page.evaluate("paraOzeti().disBorc")))
    check("satici gruplari tek satici altinda birlesti",
          page.evaluate("odemeSaticiGruplari().length") == 1)
    # Satıcıya kendi para biriminde ödeniyor: iki döviz ayrı ayrı görünmeli.
    check("satici dovizleri ayri tutuluyor",
          page.evaluate("JSON.stringify(odemeSaticiGruplari()[0].dovizler)")
          == '{"USD":20,"TRY":300}',
          page.evaluate("JSON.stringify(odemeSaticiGruplari()[0].dovizler)"))
    # Dışarıya verilen işin booster ücreti yok — booster listesine düşmemeli.
    check("dis kaynak isi booster borcuna girmiyor",
          page.evaluate("odemeBoosterGruplari().every(g => g.isler.every(r => !isDis(r)))"))
    check("odeme rozeti borclu sayisini veriyor",
          page.evaluate("navBadge('odeme')") == 2, str(page.evaluate("navBadge('odeme')")))
    # Ödemeler admin ekranı: booster kendi ekibinin borcunu görmemeli.
    page.evaluate("me={id:'b1',role:'booster',display_name:'Ali'}; renderPayments();")
    check("booster odeme ekranini goremiyor",
          "yalnızca admin" in page.inner_text("#odemeBody"))
    check("booster odeme rozeti gormuyor", page.evaluate("navBadge('odeme')") == 0)
    page.evaluate("me={id:'admin1',role:'admin',display_name:'Rex'}; buildTabs(); applyRoleUI();")

    # Form: iç/dış alanları birbirinin alternatifi. applyRoleUI() tüm
    # .admin-only kutularını birden açtığı için ikisi aynı anda görünüyordu.
    page.evaluate("switchTab('siparis'); newOrder();")
    check("varsayilan ic kaynak: satici alanlari gizli",
          page.eval_on_selector("#disAlan", "e => getComputedStyle(e).display") == "none")
    check("varsayilan ic kaynak: booster alani acik",
          page.eval_on_selector("#icAlan", "e => getComputedStyle(e).display") != "none")
    page.evaluate("document.getElementById('fulfil').value='dis'; onFulfilChange();")
    check("dis secilince satici alanlari acildi",
          page.eval_on_selector("#disAlan", "e => getComputedStyle(e).display") != "none")
    check("dis secilince booster alani gizlendi",
          page.eval_on_selector("#icAlan", "e => getComputedStyle(e).display") == "none")
    # İş içeri alınırsa satıcı kaydı temizlenmeli — ödemeler ekranında hayalet
    # borç satırı kalmasın.
    page.evaluate("document.getElementById('vendor').value='Mert';"
                  "document.getElementById('vendorCost').value='20';"
                  "document.getElementById('fulfil').value='ic'; onFulfilChange();")
    check("is iceri alininca satici kaydi temizleniyor",
          page.evaluate("JSON.stringify(disAlanlari())")
          == '{"vendor":null,"vendor_cost":0,"vendor_currency":"USD","vendor_paid":false}',
          page.evaluate("JSON.stringify(disAlanlari())"))
    page.evaluate("resetForm(); render();")

    # --- Panoda sürükle-bırak ---------------------------------------------
    # bulkPatch Supabase'e gidiyor; saplama başarılı dönüyor, biz çağrının
    # doğru id ve durumla yapıldığını doğruluyoruz.
    page.evaluate("""
      window.__patch = [];
      window.__realPatch = bulkPatch;
      bulkPatch = (ids, alan, etiket) => { window.__patch.push([ids, alan]); };
      setOrdersView('pano'); render();
    """)
    check("pano kartlari suruklenebilir",
          page.eval_on_selector_all(".bcard[draggable='true']", "e => e.length") > 0)
    page.evaluate("""
      boardDragStart({dataTransfer:{setData(){},}, currentTarget:{classList:{add(){}}}}, 'B');
      boardDrop({preventDefault(){}, currentTarget:{classList:{remove(){}}}}, 'tamam');
    """)
    check("birakilan kart durum degistiriyor",
          page.evaluate("JSON.stringify(window.__patch)") == '[[["B"],{"durum":"tamam"}]]',
          page.evaluate("JSON.stringify(window.__patch)"))
    # Zaten o sütunda olan kart boşuna yazma yapmamalı.
    page.evaluate("""
      window.__patch = [];
      boardDragStart({dataTransfer:{setData(){},}, currentTarget:{classList:{add(){}}}}, 'A');
      boardDrop({preventDefault(){}, currentTarget:{classList:{remove(){}}}}, 'tamam');
    """)
    check("ayni sutuna birakma bosuna yazmiyor",
          page.evaluate("window.__patch.length") == 0)
    page.evaluate("bulkPatch = window.__realPatch; setOrdersView('kart'); render();")

    # --- Oyun şeridi ------------------------------------------------------
    # Şerit tek filtre: Genel Bakış ile Sipariş listesini BİRLİKTE daraltmalı,
    # yoksa "Valorant"a bakarken KPI'lar hepsini sayar.
    page.evaluate("""
      records[2].game = 'rl';
      me = { id:'admin1', role:'admin', display_name:'Rex' };
      setGameScope(''); switchTab('siparis'); render();
    """)
    page.wait_for_timeout(150)
    check("serit 'Tumu' + iki oyun",
          page.eval_on_selector_all("#gameStrip .gs", "e => e.length") == 3,
          str(page.eval_on_selector_all("#gameStrip .gs", "e => e.map(x=>x.textContent.trim())")))
    hepsi = page.evaluate("filterRecords().length")
    page.evaluate("setGameScope('rl')"); page.wait_for_timeout(150)
    check("serit sipariş listesini daraltiyor",
          page.evaluate("filterRecords().length") == 1,
          f"hepsi={hepsi} rl={page.evaluate('filterRecords().length')}")
    check("serit Genel Bakis'i da daraltiyor",
          page.evaluate("scopeRecs().length") == 1)
    check("kapsam disi is KPI'a girmiyor",
          page.evaluate("paraOzeti().ucret") == page.evaluate(
            "records.filter(r=>r.game==='rl'&&!r.archived).reduce((a,r)=>a+r.payout,0)"))
    # Borç şeritten etkilenmemeli: filtre yüzünden ödeme unutulmasın.
    page.evaluate("switchTab('odeme')"); page.wait_for_timeout(150)
    check("odemeler seritten etkilenmiyor",
          page.evaluate("odemeSaticiGruplari().length") == 1
          and "Mert" in page.inner_text("#odemeBody"))
    check("odeme ekraninda serit gizli",
          page.eval_on_selector("#gameStrip", "e => getComputedStyle(e).display") == "none")
    # Zil de kapsam dışı: filtreliyken kritik uyarıyı kaçırmamalı.
    page.evaluate("switchTab('genel')"); page.wait_for_timeout(150)
    check("zil seritten etkilenmiyor",
          page.evaluate("alertModel().length")
          == page.eval_on_selector(".ov-h .ov-n", "e => Number(e.textContent)"))
    page.evaluate("setGameScope('')")
    # Tek oyun kalırsa şerit gürültü; hiç çizilmemeli.
    page.evaluate("records.forEach(r => r.game='valorant'); switchTab('siparis'); render();")
    page.wait_for_timeout(150)
    check("tek oyunda serit gizli",
          page.eval_on_selector("#gameStrip", "e => getComputedStyle(e).display") == "none")
    page.evaluate("records[2].game='rl'; render();")

    # --- İlerleme çubuğu --------------------------------------------------
    # Takip verisi olan iş GERÇEK elo ilerlemesini, olmayan iş akıştaki adımı
    # gösteriyor. İkisi karışırsa "%60" maç sonucu sanılır.
    page.evaluate("""
      tracker = { A:{order_id:'A',puuid:'p',start_elo:900,current_elo:1000,target_elo:1100,
                     paused:false,last_poll_at:new Date().toISOString(),
                     last_match_at:new Date().toISOString(),loss_streak:0} };
    """)
    check("takipli iste gercek elo ilerlemesi",
          abs(page.evaluate("ilerleme(records[0]).oran") - 0.5) < 1e-9
          and page.evaluate("ilerleme(records[0]).takip") is True)
    check("takipli isin etiketi guncel rank'i yaziyor",
          "Gold 2" in page.evaluate("ilerleme(records[0]).etiket"),
          page.evaluate("ilerleme(records[0]).etiket"))
    check("takipsiz iste adim ilerlemesi",
          page.evaluate("ilerleme(records[1]).takip") is False
          and abs(page.evaluate("ilerleme(records[1]).oran") - 0.6) < 1e-9)
    check("takipsiz isin etiketi takip olmadigini soyluyor",
          "takip" in page.evaluate("ilerleme(records[1]).etiket"),
          page.evaluate("ilerleme(records[1]).etiket"))
    page.evaluate("render()"); page.wait_for_timeout(120)
    check("kartta ilerleme cubugu var",
          page.eval_on_selector_all(".rec .rec-prog-bar", "e => e.length") == 3,
          str(page.eval_on_selector_all(".rec .rec-prog-bar", "e => e.length")))
    check("canli cubuk yalnizca takipli iste",
          page.eval_on_selector_all(".rec .rec-prog-bar.canli", "e => e.length") == 1)
    # Duraklatılmış takip canlı sayılmamalı — bar donmuş veriyi göstermesin.
    page.evaluate("tracker.A.paused = true;")
    check("duraklatilan takip canli degil",
          page.evaluate("ilerleme(records[0]).takip") is False)
    page.evaluate("tracker.A.paused = false;")

    # --- Kart eylem menüsü ------------------------------------------------
    # Yedi buton kartı üç satır uzatıyordu; "⋯" ile açılıyor ama HİÇBİRİ
    # kaybolmadı — kaybolsaydı silme/arşivleme panelden erişilemez olurdu.
    page.evaluate("acikEylem = null; render();"); page.wait_for_timeout(120)
    check("ek eylemler basta kapali",
          page.eval_on_selector_all(".rec-more",
            "e => e.every(x => getComputedStyle(x).display === 'none')"))
    page.evaluate("toggleEylem(records[0].id)")
    acik = page.eval_on_selector_all(".rec-more",
        "e => e.filter(x => getComputedStyle(x).display !== 'none').length")
    check("bir kartin eylemleri acildi", acik == 1, str(acik))
    etiketler = page.eval_on_selector_all(
        f".rec-more[data-acts='{page.evaluate('records[0].id')}'] .icon-btn",
        "e => e.map(x => x.textContent.trim())")
    for gereken in ["Düzenle", "Ödendi", "Arşivle", "Sil"]:
        check(f"'{gereken}' eylemi hala erisilebilir",
              any(gereken in t for t in etiketler), str(etiketler))
    page.evaluate("toggleEylem(records[0].id)")
    check("ikinci tikla kapaniyor",
          page.eval_on_selector_all(".rec-more",
            "e => e.every(x => getComputedStyle(x).display === 'none')"))

    # Kâr kartta da dış kaynak giderini düşmeli (ekranlar ayrışmasın).
    page.evaluate("""
      finance.C = {platform:'E',cost:50,costCur:'USD',feePct:0,costTL:2000,rate:40};
      setGameScope('rl'); render();
    """)
    page.wait_for_timeout(150)
    kart_kar = page.eval_on_selector_all(".rec .rec-f",
        "els => { const e = els.find(x => x.textContent.includes('kâr'));"
        " return e ? e.querySelector('.rec-f-v').textContent.trim() : null; }")
    check("kart kari dis gideri dusuyor",
          kart_kar == page.evaluate(
            "fmt(netGelirTLof('C') - records[2].payout - disMaliyetTL(records[2]),'TRY')"),
          f"kart={kart_kar}")
    page.evaluate("setGameScope(''); delete finance.C; render();")

    # --- Yapıştır-çözümle -------------------------------------------------
    # Rank adları oyunlar arası çakışıyor; oyun ÖNCE tespit edilmezse
    # "Platinum II" hem Rivals hem Rocket League merdiveninde bulunur.
    p1 = page.evaluate("JSON.stringify(pasteParse("
                       "'Valorant Gold 1 to Diamond 1 boost, 120$, Sylas#TR1, TR, 42 RR, Eldorado'))")
    import json as _json
    d1 = _json.loads(p1)
    check("yapistir: oyun", d1.get("game") == "valorant", p1)
    check("yapistir: rank araligi",
          d1.get("baslangic") == "Gold 1" and d1.get("hedef") == "Diamond 1", p1)
    check("yapistir: fiyat ve birim", d1.get("cost") == 120 and d1.get("currency") == "USD", p1)
    check("yapistir: Riot ID", d1.get("riotId") == "Sylas#TR1", p1)
    check("yapistir: bolge", d1.get("region") == "TR", p1)
    check("yapistir: RR", d1.get("startRR") == 42, p1)
    check("yapistir: pazaryeri", d1.get("platform") == "Eldorado", p1)

    d2 = _json.loads(page.evaluate(
        "JSON.stringify(pasteParse('Rocket League Platinum II -> Diamond II, 64 EUR, GameBoost'))"))
    check("yapistir: RL oyunu taniniyor", d2.get("game") == "rl", str(d2))
    check("yapistir: RL rankleri kendi merdiveninden",
          d2.get("baslangic") == "Platinum II" and d2.get("hedef") == "Diamond II", str(d2))
    check("yapistir: EUR", d2.get("currency") == "EUR" and d2.get("cost") == 64, str(d2))
    # Takip edilmeyen oyunda Riot ID alanı yok — bot o siparişi yoklamıyor.
    d3 = _json.loads(page.evaluate(
        "JSON.stringify(pasteParse('Marvel Rivals Gold I to Diamond I, Strange#TR1'))"))
    check("yapistir: takipsiz oyunda Riot ID yazilmiyor", "riotId" not in d3, str(d3))

    d4 = _json.loads(page.evaluate(
        "JSON.stringify(pasteParse('Ascendant 2 8 net win soloq duo, 1.250 TL'))"))
    check("yapistir: net win turu", d4.get("orderType") == "netwin", str(d4))
    check("yapistir: adet", d4.get("unitCount") == 8, str(d4))
    check("yapistir: binlik ayraci", d4.get("cost") == 1250 and d4.get("currency") == "TRY", str(d4))
    check("yapistir: extralar", sorted(d4.get("extras", [])) == ["duo", "soloq"], str(d4))

    # En uzun rank eşleşmesi kazanmalı: "Grand Champion III" içinde
    # "Champion III" de var, kısası seçilirse iş bir kademe aşağı iner.
    d5 = _json.loads(page.evaluate(
        "JSON.stringify(pasteParse('rocket league Champion I to Grand Champion III'))"))
    check("yapistir: en uzun rank eslesmesi kazaniyor",
          d5.get("hedef") == "Grand Champion III", str(d5))

    check("yapistir: bos metin cozumlenmiyor", page.evaluate("pasteParse('   ') === null"))
    check("yapistir: alakasiz metin cozumlenmiyor",
          page.evaluate("pasteParse('merhaba nasilsin') === null"),
          page.evaluate("JSON.stringify(pasteParse('merhaba nasilsin'))"))

    # Forma yazma: SESSİZ değil, ayrı bir onay adımı var.
    page.evaluate("me={id:'admin1',role:'admin',display_name:'Rex'}; buildTabs(); applyRoleUI(); newOrder();")
    page.evaluate("""
      document.getElementById('pasteBox').value =
        'Valorant Gold 1 to Diamond 1 boost, 120$, Sylas#TR1, TR, 42 RR, Eldorado';
      onPasteChange();
    """)
    page.wait_for_timeout(120)
    check("yapistir: cipler cizildi",
          page.eval_on_selector_all("#pasteOut .chip", "e => e.length") >= 6,
          str(page.eval_on_selector_all("#pasteOut .chip", "e => e.length")))
    check("yapistir: onaydan once form bos",
          page.eval_on_selector("#riotId", "e => e.value") == "")
    page.evaluate("pasteUygula()")
    check("yapistir: rank alanlari dolduruldu",
          page.eval_on_selector("#baslangic", "e => e.value") == "Gold 1"
          and page.eval_on_selector("#hedef", "e => e.value") == "Diamond 1")
    check("yapistir: Riot ID dolduruldu",
          page.eval_on_selector("#riotId", "e => e.value") == "Sylas#TR1")
    check("yapistir: fiyat dolduruldu",
          page.eval_on_selector("#cost", "e => e.value") == "120"
          and page.eval_on_selector("#currency", "e => e.value") == "USD")
    check("yapistir: RR dolduruldu", page.eval_on_selector("#startRR", "e => e.value") == "42")
    # Düzenlemede yapıştır kutusu olmamalı: kayıtlı alanları sessizce ezerdi.
    page.evaluate("hideForm(); editRecord(records[0].id);")
    check("duzenlemede yapistir kutusu gizli",
          page.eval_on_selector(".paste-box", "e => getComputedStyle(e).display") == "none")
    page.evaluate("resetForm(); render();")

    # --- Kaynak sekmeleri -------------------------------------------------
    page.evaluate("me={id:'admin1',role:'admin',display_name:'Rex'}; applyRoleUI(); render();")
    page.wait_for_timeout(120)
    check("kaynak sekmeleri cizildi",
          page.eval_on_selector_all("#srcTabs .st-tab", "e => e.length") == 3,
          str(page.eval_on_selector_all("#srcTabs .st-tab", "e => e.map(x=>x.textContent.trim())")))
    hepsi = page.evaluate("filterRecords().length")
    page.evaluate("setOrdersSrc('dis')")
    check("dis kaynak sekmesi suzuyor",
          page.evaluate("filterRecords().every(isDis)")
          and page.evaluate("filterRecords().length") == 2,
          str(page.evaluate("filterRecords().length")))
    page.evaluate("setOrdersSrc('ic')")
    check("ic kaynak sekmesi suzuyor",
          page.evaluate("filterRecords().every(r => !isDis(r))"))
    page.evaluate("setOrdersSrc('')")
    check("kaynak sekmesi temizlenince hepsi geri geldi",
          page.evaluate("filterRecords().length") == hepsi)
    # Booster dış kaynak diye bir şey bilmiyor.
    page.evaluate("me={id:'b1',role:'booster',display_name:'Ali'}; applyRoleUI(); render();")
    check("booster kaynak sekmelerini gormuyor",
          page.eval_on_selector_all("#srcTabs .st-tab", "e => e.length") == 0)
    page.evaluate("me={id:'admin1',role:'admin',display_name:'Rex'}; buildTabs(); applyRoleUI(); render();")

    # --- Teslim tarihi ve gecikme -----------------------------------------
    # Tarih GÜN bazında: bugüne söz verilen iş bugün boyunca geç değil.
    page.evaluate("""
      const g = n => new Date(Date.now() + n*86400000).toISOString().slice(0,10);
      records[0].dueAt = g(-3); records[0].durum = 'devam';
      records[1].dueAt = g(0);
      records[2].dueAt = g(2);
      window.__g = g;
    """)
    check("gecmis tarih geciken sayiliyor", page.evaluate("teslim(records[0]).gec") is True)
    check("gecikme gun sayisi", page.evaluate("teslim(records[0]).gun") == 3,
          page.evaluate("JSON.stringify(teslim(records[0]))"))
    check("bugun teslim henuz geç degil",
          page.evaluate("teslim(records[1]).gec") is False
          and page.evaluate("teslim(records[1]).metin") == "bugün teslim")
    check("ileri tarih kalan gunu veriyor",
          page.evaluate("teslim(records[2]).metin") == "2 gün kaldı")
    check("tarihsiz is suresiz",
          page.evaluate("(r => { const d=r.dueAt; r.dueAt=''; const v=teslim(r); r.dueAt=d; return v; })(records[0]) === null"))
    # Kapanmış işin gecikmesi yok — teslim edildiyse konu kapanmıştır.
    check("kapanan isin gecikmesi yok",
          page.evaluate("(r => { const d=r.durum; r.durum='tamam'; const v=teslim(r); r.durum=d; return v; })(records[0]) === null"))
    check("geciken is uyari uretiyor",
          page.evaluate("alertModel().some(a => a.tur === 'gecikti' && a.id === 'A')"))
    check("geciken uyarisi en agir",
          page.evaluate("alertModel()[0].tur") == "gecikti",
          page.evaluate("alertModel()[0].tur"))
    page.evaluate("render()"); page.wait_for_timeout(120)
    check("geciken kart isaretlendi",
          page.eval_on_selector_all(".rec.gec", "e => e.length") == 1,
          str(page.eval_on_selector_all(".rec.gec", "e => e.length")))
    check("kartta teslim cipi var",
          "gün geç" in page.eval_on_selector("#recordList", "e => e.textContent"))
    # Dışarıya verilmiş iş de gecikebilir: satıcı gecikirse müşteri seni arar.
    check("dis kaynak isi de gecikebiliyor",
          page.evaluate("(r => { r.dueAt = window.__g(-5); return isDis(r) && isGec(r); })(records[1])"))
    page.evaluate("records.forEach(r => r.dueAt=''); render();")

    # --- Ödemeler: seçim ve toplam ----------------------------------------
    page.evaluate("""
      people = [{id:'b1',display_name:'Ali',role:'booster',active:true,
                 iban:'TR33 0006 1005 1978 6457 8413 26',capacity:2}];
      records[0].durum='tamam'; records[0].boosterId='b1'; records[0].paid=false;
      records[0].payout=400; records[0].vendor='';
      odemeSecim.clear(); switchTab('odeme');
    """)
    page.wait_for_timeout(150)
    check("odeme satirinda IBAN gorunuyor",
          "TR33" in page.inner_text("#odemeBody"))
    check("seçim yokken cubuk yok",
          page.eval_on_selector_all(".pay-bar", "e => e.length") == 0)
    page.evaluate("odemeSec('b:b1', true)"); page.wait_for_timeout(120)
    check("secim cubugu cikti", page.eval_on_selector_all(".pay-bar", "e => e.length") == 1)
    check("secim toplami dogru",
          page.eval_on_selector(".pay-bar-t", "e => e.textContent.trim()")
          == page.evaluate("fmt(400,'TRY')"),
          page.eval_on_selector(".pay-bar-t", "e => e.textContent.trim()"))
    page.evaluate("odemeSec('v:Mert', true)"); page.wait_for_timeout(120)
    check("satici da secime giriyor", page.evaluate("odemeSecim.size") == 2)
    # Ödenmiş bir satır listeden düşünce seçim toplamı şişmemeli.
    page.evaluate("records[0].paid = true; renderPayments();")
    page.wait_for_timeout(120)
    check("kaybolan satirin secimi kirpildi",
          page.evaluate("odemeSecim.has('b:b1')") is False,
          str(page.evaluate("[...odemeSecim]")))
    page.evaluate("odemeSecTemizle(); records[0].paid = false;")

    # --- Boosterlar: doluluk ----------------------------------------------
    page.evaluate("""
      records[0].durum='devam'; records[0].boosterId='b1';
      records[1].boosterId='b1'; records[1].durum='atandi'; records[1].vendor='';
      switchTab('boosterlar');
    """)
    page.wait_for_timeout(150)
    check("doluluk cubugu cizildi",
          page.eval_on_selector_all(".bs-load-bar", "e => e.length") == 1)
    check("doluluk orani dolu",
          page.eval_on_selector(".bs-load-bar span", "e => e.className") == "full",
          page.eval_on_selector(".bs-load-bar span", "e => e.className"))
    check("doluluk etiketi 2/2",
          "2 / 2" in page.eval_on_selector("#boosterList", "e => e.textContent"))
    check("mesgul rozeti", "meşgul" in page.eval_on_selector("#boosterList", "e => e.textContent"))
    # Kapasite girilmemişse uydurma tavan koymuyoruz.
    page.evaluate("people[0].capacity = null; renderBoosters();")
    check("kapasitesiz boosterda cubuk yok",
          page.eval_on_selector_all(".bs-load-bar", "e => e.length") == 0)
    check("kapasitesiz boosterda aciklama var",
          "kapasite girilmemiş" in page.eval_on_selector("#boosterList", "e => e.textContent"))
    page.evaluate("people[0].capacity = 2;")

    # --- Drawer zaman çizelgesi -------------------------------------------
    page.evaluate("""
      tracker = { A:{order_id:'A',puuid:'p',start_elo:900,current_elo:1000,target_elo:1100,
                     paused:false,last_poll_at:new Date().toISOString(),
                     last_match_at:new Date().toISOString(),loss_streak:0} };
      openDetail('A');
    """)
    # openDetail async mac yuklemesi baslatiyor; saplama bos donup drawerMatches'i
    # eziyor. Once o tamamlansin, maclari SONRA koyalim.
    page.wait_for_timeout(200)
    page.evaluate("""
      drawerMatches = { rows:[
        {rr_change: 21, map_name:'Ascent', played_at:new Date(Date.now()-3600000).toISOString()},
        {rr_change:-14, map_name:'Bind',   played_at:new Date(Date.now()-7200000).toISOString()}
      ], error:null };
      renderDetail();
    """)
    page.wait_for_timeout(150)
    check("zaman cizelgesi cizildi",
          page.eval_on_selector_all(".tl-row", "e => e.length") == 3,
          str(page.eval_on_selector_all(".tl-row", "e => e.map(x=>x.textContent.trim())")))
    check("cizelge en yeniden eskiye",
          "+21" in page.eval_on_selector(".tl-row", "e => e.textContent"))
    check("kazanilan mac yesil, kaybedilen kirmizi",
          page.eval_on_selector_all(".tl-dot.tamam", "e => e.length") == 1
          and page.eval_on_selector_all(".tl-dot.kayip", "e => e.length") == 1)
    # Olmayan denetim kaydını varmış gibi göstermiyoruz.
    check("cizelge eksigini soyluyor",
          "zaman kaydı tutulmuyor" in page.inner_text("#drawerBody"))
    page.evaluate("closeDetail(); drawerMatches = { rows:null, error:null }; tracker = {};")

    # --- Panoda görsel bırakma --------------------------------------------
    # Kart sürüklemesi ile dosya bırakma karışmamalı: sürüklenen kartken
    # tetiklenirse iş yanlışlıkla Tamam'a geçerdi.
    check("kart suruklemesi gorsel hedefi acmiyor",
          page.evaluate("""(() => {
            let onlendi = false;
            const e = { dataTransfer:{types:['text/plain']},
                        preventDefault:()=>{onlendi=true}, stopPropagation(){},
                        currentTarget:{classList:{add(){},remove(){}}} };
            shotDragOver(e); return !onlendi;
          })()"""))
    check("dosya suruklemesi gorsel hedefini aciyor",
          page.evaluate("""(() => {
            let onlendi = false;
            const e = { dataTransfer:{types:['Files']},
                        preventDefault:()=>{onlendi=true}, stopPropagation(){},
                        currentTarget:{classList:{add(){},remove(){}}} };
            shotDragOver(e); return onlendi;
          })()"""))
    # Görsel olmayan dosya reddedilmeli.
    page.evaluate("""
      window.__toast = '';
      window.__realToast = toast; toast = (m,t) => { window.__toast = m; };
      shotDrop({ dataTransfer:{types:['Files'], files:[{type:'application/pdf'}]},
                 preventDefault(){}, stopPropagation(){},
                 currentTarget:{classList:{remove(){}}} }, 'A');
    """)
    page.wait_for_timeout(120)
    check("gorsel olmayan dosya reddediliyor",
          "görsel" in page.evaluate("window.__toast"), page.evaluate("window.__toast"))
    page.evaluate("toast = window.__realToast;")

    # --- Sıralama ---------------------------------------------------------
    # Asil aci: cok siparis olunca liste taranamiyor. Cevap tablo + siralama.
    check("varsayilan gorunum tablo",
          page.evaluate("lsGet('ordersMode','tablo')") in ("tablo", "kart", "pano"))
    page.evaluate("""
      me = { id:'admin1', role:'admin', display_name:'Rex' };
      const g = n => new Date(Date.now() + n*86400000).toISOString().slice(0,10);
      records = [
        {id:'S1',game:'valorant',orderType:'rank',baslangic:'Gold 1',hedef:'Plat 1',winCount:0,jobDesc:'',
         startRR:0,region:'TR',riotId:'',extras:[],extraWin:false,durum:'devam',tarih:'2026-08-10',
         dueAt:g(5),not:'',image:null,boosterId:'b1',payout:100,paid:false,archived:false,
         created:'2026-08-10T10:00:00',vendor:'',vendorCost:0,vendorCur:'USD',vendorPaid:false},
        {id:'S2',game:'valorant',orderType:'rank',baslangic:'Bronze 1',hedef:'Silver 1',winCount:0,jobDesc:'',
         startRR:0,region:'TR',riotId:'',extras:[],extraWin:false,durum:'yeni',tarih:'2026-08-12',
         dueAt:g(1),not:'',image:null,boosterId:null,payout:300,paid:false,archived:false,
         created:'2026-08-12T10:00:00',vendor:'',vendorCost:0,vendorCur:'USD',vendorPaid:false},
        {id:'S3',game:'rl',orderType:'rank',baslangic:'Gold I',hedef:'Platinum I',winCount:0,jobDesc:'',
         startRR:0,region:'TR',riotId:'',extras:[],extraWin:false,durum:'atandi',tarih:'2026-08-11',
         dueAt:'',not:'',image:null,boosterId:null,payout:200,paid:false,archived:false,
         created:'2026-08-11T10:00:00',vendor:'Mert',vendorCost:20,vendorCur:'USD',vendorPaid:false}
      ];
      finance = {}; tracker = {};
      people = [{id:'admin1',display_name:'Rex',role:'admin',active:true},
                {id:'b1',display_name:'Ali',role:'booster',active:true},
                {id:'b2',display_name:'Veli',role:'booster',active:true}];
      gameScope=''; ordersView.durum=''; ordersView.src=''; ordersView.sel.clear();
      setOrdersView('tablo'); switchTab('siparis');
      ordersView.sort='due'; ordersView.dir='asc'; render();
    """)
    page.wait_for_timeout(150)
    check("teslim tarihine gore siralandi",
          page.evaluate("sortRecords(filterRecords()).map(r => r.id).join(',')") == "S2,S1,S3",
          page.evaluate("sortRecords(filterRecords()).map(r => r.id).join(',')"))
    # Tarihi girilmemis is (S3) YONDEN BAGIMSIZ olarak sonda kalmali; yoksa
    # "en yakin teslim" listesinin basini suresiz isler kaplar.
    page.evaluate("setSort('due')")   # yonu cevirir
    check("yon cevrildi", page.evaluate("ordersView.dir") == "desc")
    check("bos teslim tarihi ters yonde de sonda",
          page.evaluate("sortRecords(filterRecords()).map(r => r.id).join(',')") == "S1,S2,S3",
          page.evaluate("sortRecords(filterRecords()).map(r => r.id).join(',')"))
    page.evaluate("ordersView.sort='ucret'; ordersView.dir='desc'; render();")
    check("ucrete gore siralandi",
          page.evaluate("sortRecords(filterRecords()).map(r => r.payout).join(',')") == "300,200,100")
    page.evaluate("ordersView.sort='is'; ordersView.dir='asc'; render();")
    check("metin siralamasi turkce",
          page.evaluate("sortRecords(filterRecords())[0].id") == "S2",
          page.evaluate("sortRecords(filterRecords()).map(r=>r.id).join(',')"))
    # Yeni sutuna gecince yon o sutunun dogal yonuyle basliyor.
    page.evaluate("setSort('kar')")
    check("para sutunu azalan basliyor", page.evaluate("ordersView.dir") == "desc")
    page.evaluate("setSort('tarih')")
    check("tarih sutunu artan basliyor", page.evaluate("ordersView.dir") == "asc")
    page.evaluate("ordersView.sort='due'; ordersView.dir='asc'; render();")
    page.wait_for_timeout(120)
    check("tablo basliklari siralanabilir",
          page.eval_on_selector_all(".otable th .th-b", "e => e.length") >= 7,
          str(page.eval_on_selector_all(".otable th .th-b", "e => e.length")))
    check("aktif sutun isaretli",
          page.eval_on_selector_all(".otable th.sorted", "e => e.length") == 1)
    check("aria-sort yaziliyor",
          page.eval_on_selector(".otable th.sorted", "e => e.getAttribute('aria-sort')") == "ascending")

    # --- Satır içi durum --------------------------------------------------
    check("durum hucresi secim kutusu",
          page.eval_on_selector_all(".otable tbody .st-sel", "e => e.length") == 3)
    # Formda secilemeyen ama veride bulunan durum secenek listesinden dusmemeli;
    # duserdi ve ilk tiklamada is baska bir duruma kayardi.
    page.evaluate("records.find(r => r.id==='S1').durum='odendi'; render();")
    check("veride olan ama formda olmayan durum secenekte",
          page.eval_on_selector_all("[data-selrow='S1'] .st-sel option",
                                    "e => e.map(x => x.value)").count("odendi") == 1,
          str(page.eval_on_selector_all("[data-selrow='S1'] .st-sel option", "e => e.map(x=>x.value)")))
    check("mevcut durum secili",
          page.eval_on_selector("[data-selrow='S1'] .st-sel", "e => e.value") == "odendi")
    page.evaluate("records.find(r => r.id==='S1').durum='devam'; render();")

    # --- Toplu booster atama ----------------------------------------------
    page.evaluate("""
      window.__patch = []; window.__realPatch = bulkPatch;
      bulkPatch = (ids, alan) => { window.__patch.push([ids.slice().sort(), alan]); };
      window.__realConfirm = window.confirm; window.confirm = () => true;
      selAll(true); bulkAssign('b2');
    """)
    yazim = page.evaluate("JSON.stringify(window.__patch)")
    # Dis kaynak isi (S3) ATLANMALI: ucreti saticiya odeniyor, booster atamak
    # borcu iki kere yazardi. 'yeni' olan S2 ayni anda 'atandi'ya gecmeli,
    # yoksa bot onu hic yoklamaz.
    check("dis kaynak isi atlandi", "S3" not in yazim, yazim)
    check("yeni is atanirken durumu da ilerledi",
          '"durum":"atandi"' in yazim and '"S2"' in yazim, yazim)
    check("devam eden isin durumuna dokunulmadi",
          any(p[0] == ["S1"] and "durum" not in p[1] for p in page.evaluate("window.__patch")),
          yazim)
    page.evaluate("window.__patch=[]; bulkAssign('__bos');")
    check("atamayi kaldirma bos yaziyor",
          '"booster_id":null' in page.evaluate("JSON.stringify(window.__patch)"))
    page.evaluate("bulkPatch = window.__realPatch; window.confirm = window.__realConfirm; selAll(false);")

    # --- Otomatik kur -----------------------------------------------------
    bugun = page.evaluate("new Date().toISOString().slice(0,10)")
    page.evaluate("""(g) => {
      fx = { USD:{rate:41.25, as_of:g, source:'frankfurter'} };
      newOrder();
      document.getElementById('currency').value='USD';
      onMoneyChange();
    }""", bugun)
    check("kur otomatik dolduruldu",
          page.eval_on_selector("#rate", "e => e.value") == "41.25",
          page.eval_on_selector("#rate", "e => e.value"))
    check("kaynagi ekranda yaziyor",
          "otomatik" in page.eval_on_selector("#rateNote", "e => e.textContent"))
    # Elle degistirilen kur bir daha EZILMEMELI: pazaryeri kendi kurunu uygular.
    page.evaluate("""
      const el = document.getElementById('rate');
      el.value = '38'; onRateInput(); onMoneyChange();
    """)
    check("elle girilen kur ezilmiyor",
          page.eval_on_selector("#rate", "e => e.value") == "38")
    check("elle girilince guncel kur teklif ediliyor",
          "kullan" in page.eval_on_selector("#rateNote", "e => e.textContent"))
    # Bayat kur SESSIZCE kullanilmamali.
    page.evaluate("""
      fx = { USD:{rate:30, as_of:'2020-01-01', source:'x'} };
      newOrder(); document.getElementById('currency').value='USD'; onMoneyChange();
    """)
    check("bayat kur uyariyla geliyor",
          "günlük" in page.eval_on_selector("#rateNote", "e => e.textContent"),
          page.eval_on_selector("#rateNote", "e => e.textContent"))
    # Kur hic yoksa uydurulmamali.
    page.evaluate("fx = {}; newOrder(); document.getElementById('currency').value='USD'; onMoneyChange();")
    check("kur yoksa alan bos kaliyor",
          page.eval_on_selector("#rate", "e => e.value") == "")
    check("kur yoksa ekranda soyleniyor",
          "elle gir" in page.eval_on_selector("#rateNote", "e => e.textContent"))
    # Duzenlemede KAYITLI kur korunmali: siparis anindaki kur sabit, bugunun
    # kuruyla ezilirse gecmis kar hesabi degisir.
    page.evaluate("""(g) => {
      fx = { USD:{rate:41.25, as_of:g, source:'x'} };
      finance = { S1:{platform:'E',cost:25,costCur:'USD',feePct:0,costTL:750,rate:30} };
      hideForm(); editRecord('S1'); onMoneyChange();
    }""", bugun)
    check("duzenlemede kayitli kur korunuyor",
          page.eval_on_selector("#rate", "e => e.value") == "30",
          page.eval_on_selector("#rate", "e => e.value"))
    page.evaluate("resetForm(); finance = {}; render();")

    # --- Ödeme dönemi -----------------------------------------------------
    page.evaluate("""
      records[0].durum='tamam'; records[0].paid=false; records[0].payout=100;
      records[0].boosterId='b1'; records[0].tarih='2026-08-10';
      records[1].durum='tamam'; records[1].paid=false; records[1].payout=300;
      records[1].boosterId='b1'; records[1].tarih='2020-01-05';
      setOdemeDonem('hepsi'); switchTab('odeme');
    """)
    page.wait_for_timeout(150)
    check("donem 'tumu' iken hepsi geliyor",
          page.evaluate("odemeBoosterGruplari()[0].isler.length") == 2)
    page.evaluate("setOdemeDonem('ay')"); page.wait_for_timeout(120)
    check("bu ay donemi eskiyi eliyor",
          page.evaluate("odemeBoosterGruplari()[0].isler.map(r=>r.id).join(',')") == "S1",
          page.evaluate("JSON.stringify(odemeBoosterGruplari().map(g=>g.isler.map(r=>r.id)))"))
    check("donem secici cizildi",
          page.eval_on_selector_all(".pay-donem .gs", "e => e.length") == 4)
    check("KPI de donemle daraliyor",
          page.evaluate("paraOzeti(activeRecs().filter(donemde)).borc") == 100,
          str(page.evaluate("paraOzeti(activeRecs().filter(donemde)).borc")))
    # Toplu ödeme: seçilenlerin hepsi tek turda.
    page.evaluate("""
      window.__patch = []; window.__realPatch = bulkPatch;
      bulkPatch = async (ids, alan) => { window.__patch.push([ids.slice().sort(), alan]); };
      window.__realConfirm = window.confirm; window.confirm = () => true;
      odemeSecim.clear(); odemeSec('b:b1', true);
    """)
    page.wait_for_timeout(120)
    page.evaluate("odeSecilenler()")
    page.wait_for_timeout(150)
    check("secilenler tek turda odendi isaretlendi",
          page.evaluate("JSON.stringify(window.__patch)") == '[[["S1"],{"paid":true}]]',
          page.evaluate("JSON.stringify(window.__patch)"))
    page.evaluate("""
      bulkPatch = window.__realPatch; window.confirm = window.__realConfirm;
      setOdemeDonem('hepsi'); odemeSecim.clear();
    """)

    # --- İş yükü paneli ---------------------------------------------------
    page.evaluate("""
      people.find(p => p.id === 'b1').capacity = 1;
      people.find(p => p.id === 'b2').capacity = 3;
      records[0].durum='devam'; records[0].boosterId='b1';
      records[1].durum='devam'; records[1].boosterId='b1';
      switchTab('boosterlar');
    """)
    page.wait_for_timeout(150)
    check("is yuku paneli cizildi",
          page.eval_on_selector_all("#workload .wl-row", "e => e.length") == 2)
    # Musait olan basta: liste atama icin okunuyor.
    check("musait olan listenin basinda",
          page.eval_on_selector("#workload .wl-row .wl-ad", "e => e.textContent.trim()").startswith("Veli"),
          page.eval_on_selector_all("#workload .wl-ad", "e => e.map(x=>x.textContent.trim())")[0])
    check("dolu olan kirmizi",
          page.eval_on_selector_all("#workload .wl-bar span.full", "e => e.length") == 1)
    check("kac kisi is alabilir yaziyor",
          "1 kişi iş alabilir" in page.eval_on_selector("#workload .ov-h", "e => e.textContent"),
          page.eval_on_selector("#workload .ov-h", "e => e.textContent").strip())
    # Pasif kisi listenin sonunda: ona is atanmaz.
    page.evaluate("people.find(p => p.id === 'b2').active = false; renderWorkload();")
    check("pasif kisi sona atildi",
          page.eval_on_selector_all("#workload .wl-ad", "e => e.map(x=>x.textContent.trim())")[-1].startswith("Veli"))
    page.evaluate("people.find(p => p.id === 'b2').active = true;")

    # --- Yorumlar ---------------------------------------------------------
    page.evaluate("""
      switchTab('siparis'); openDetail('S1');
    """)
    page.wait_for_timeout(220)
    page.evaluate("""
      drawerComments = { rows:[
        {id:'c1', author_id:'admin1', body:'Musteri aksam 9 sonrasi oynansin dedi.',
         created_at:new Date(Date.now()-3600000).toISOString()},
        {id:'c2', author_id:'b1', body:'Bugün 3 maç yaptım.',
         created_at:new Date(Date.now()-7200000).toISOString()}
      ], error:null };
      renderDetail();
    """)
    page.wait_for_timeout(120)
    check("yorumlar cizildi", page.eval_on_selector_all(".cmt", "e => e.length") == 2)
    # Silme yalnizca KENDI yorumunda: baskasininkini silme dugmesi hic cizilmemeli.
    check("yalnizca kendi yorumunda sil dugmesi",
          page.eval_on_selector_all(".cmt-del", "e => e.length") == 1)
    check("yorum yazani gosteriyor",
          "Rex" in page.eval_on_selector(".cmt", "e => e.textContent"),
          page.eval_on_selector(".cmt", "e => e.textContent").strip()[:80])
    # Yorum kutusundaki metin HTML olarak yorumlanmamali.
    page.evaluate("p => { drawerComments.rows[0].body = p; renderDetail(); }",
                  '<img src=x onerror="window.__cx=1">')
    page.wait_for_timeout(120)
    check("yorumda HTML enjeksiyonu yok", page.evaluate("window.__cx === undefined"))
    page.evaluate("closeDetail(); drawerComments = { rows:null, error:null };")

    # --- Dar ekranda tablo ------------------------------------------------
    # Yatay kaydirma telefonda sutunlarin yarisini gizliyor; satirlar kart
    # yigina donusuyor ve hucre etiketleri data-l'den geliyor.
    page.set_viewport_size({"width": 390, "height": 860})
    # Bu blok GEOMETRI olcuyor: kabuk gercekten gorunur olmali. Testin geri
    # kalani giris ekrani acikken calisiyor ve eleman SAYIYOR; olculen kutu
    # sifir olsaydi kontroller sessizce gecerdi (bu hata bir kez yasandi).
    page.evaluate("""
      document.getElementById('app').classList.remove('hidden');
      document.getElementById('authScreen')?.classList.add('hidden');
      switchTab('siparis'); setOrdersView('tablo'); render();
    """)
    page.wait_for_timeout(200)
    check("olcum icin kabuk gercekten gorunur",
          page.eval_on_selector(".otable tbody tr", "e => e.getBoundingClientRect().height") > 0)
    check("dar ekranda tablo basligi gizli",
          page.eval_on_selector(".otable thead", "e => getComputedStyle(e).display") == "none")
    check("dar ekranda satir blok",
          page.eval_on_selector(".otable tbody tr", "e => getComputedStyle(e).display") == "block")
    check("hucre etiketleri gorunuyor",
          page.evaluate("getComputedStyle(document.querySelector('.otable tbody .c-st'),'::before').content")
          .strip('"') == "Durum",
          page.evaluate("getComputedStyle(document.querySelector('.otable tbody .c-st'),'::before').content"))
    check("dar ekranda yatay tasma yok",
          not page.evaluate("document.documentElement.scrollWidth > innerWidth"))
    check("dar ekranda secim kutusu erisilebilir",
          page.evaluate("""(() => {
            const e = document.querySelector('.otable tbody .c-sel input');
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.left >= 0 && r.right <= innerWidth;
          })()"""),
          page.evaluate("""(() => {
            const e = document.querySelector('.otable tbody .c-sel input');
            if(!e) return 'input yok';
            const r = e.getBoundingClientRect();
            return JSON.stringify({l:Math.round(r.left), w:Math.round(r.width), vw:innerWidth});
          })()"""))
    check("dar ekranda is metni butonlarla cakismiyor",
          page.evaluate("""(() => {
            const j = document.querySelector('.otable tbody .o-job');
            const s = document.querySelector('.otable tbody .c-sel input');
            const yazi = j.getBoundingClientRect().right - parseFloat(getComputedStyle(j).paddingRight);
            return yazi <= s.getBoundingClientRect().left;
          })()"""))
    # Nav gruplari dar ekranda tek satira duzlesiyor.
    check("dar ekranda grup basliklari gizli",
          page.eval_on_selector(".nav-group-h", "e => getComputedStyle(e).display") == "none")
    check("dar ekranda nav tek satir",
          page.eval_on_selector(".nav-group", "e => getComputedStyle(e).display") == "contents")
    page.set_viewport_size({"width": 1280, "height": 900})
    page.evaluate("document.getElementById('app').classList.add('hidden');")

    browser.close()

print(f"\n{'BASARISIZ: ' + ', '.join(failures) if failures else 'panel kontrolleri gecti.'}")
sys.exit(1 if failures else 0)
