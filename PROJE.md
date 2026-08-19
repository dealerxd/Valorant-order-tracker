# HILL Boosting — Proje Promptu

> Bu belge, projeyi hiç bilmeyen bir geliştiriciye ya da yeni bir AI
> oturumuna olduğu gibi verilebilecek şekilde yazılmıştır. Sistemin ne
> olduğunu, para kurallarını, şemayı, güvenlik modelini ve bilinçli olarak
> YAPILMAMIŞ şeyleri anlatır. Son güncelleme: 2026-08-19, `panel-v2` dalı.

## Sen kimsin, ne üzerinde çalışıyorsun

Oyun boost siparişleri satan küçük bir işletmenin (HILL Boosting) iç
operasyon sistemi üzerinde çalışıyorsun. İşletme sahibi **REXS** (admin).
Pazaryerlerinden (Eldorado, GameBoost) boost siparişi alınır; işi ya kendi
çalışanları (booster) yapar, ya REXS/ortak kendisi yapar, ya da iş dışarıya
başka bir satıcıya devredilir (resell).

Tek git deposu, dört yüzey:

```
panel/     Canlı vanilla panel (HTML/CSS/JS, Cloudflare Pages) — DOKUNMA
tracker/   Python bot: Valorant maçlarını HenrikDev API'den yoklar,
           Telegram/Discord'a rapor atar (Railway'de çalışır) — DOKUNMA
panel-v2/  YENİ panel: Next.js 15 App Router (Vercel) — aktif iş burada
shared/    İki panelin + tracker'ın ortak sözleşmesi ve TÜM migration'lar
```

Hepsi AYNI Supabase projesini kullanır: `yhrvpgkxywwgeelhjszb`
(eu-north-1). `panel/` ve `tracker/` üretimde çalışıyor; onları kıracak
hiçbir değişiklik yapma.

## Roller ve kim neyi görür

`profiles.role` üç değer alır: `admin`, `ortak`, `booster`.

| | admin (REXS) | ortak (TZX) | booster (çalışan) |
|---|---|---|---|
| Kapsam | her şey | **yalnızca Eldorado** siparişleri | kendine atanmış işler |
| GameBoost siparişleri | ✓ | **hiç göremez** | atanırsa |
| Sipariş oluşturma | ✓ | ✓ (Eldorado) | ✓ (kendine) |
| Finans girme (fiyat/komisyon) | ✓ | ✓ (Eldorado) | ✗ |
| Çalışana iş atama | ✓ | ✓ (Eldorado işleri) | ✗ |
| Çalışan IBAN/telefon | ✓ | ✗ | kendi |
| Fiyat tablosu | düzenler | okur | okur (kendi ücretini sorgular) |
| Hesap bilgileri (müşteri id-pw) | hepsi | Eldorado | kendi işininki |

Çalışan kuralları (kullanıcının kendi ifadesiyle):
- Kendine verilen siparişleri panele not eder, ekran görüntüsüyle tamamlar.
- Kendi kazancını görür: **Bekleyen** (bitmiş, ödenmemiş) + **Toplam
  kazanç** (ödenenler dahil). Bitmiş VE ödenmiş iş sipariş listesinden
  düşer ama SİLİNMEZ — admin tam listeyi görür, toplam kazançta sayılır.
- Ortakların/işletmenin kazancını, ciroyu, finansı GÖREMEZ. Bu arayüz
  gizlemesi değil, veritabanı (RLS) seviyesinde zorlanır.

Şu an canlıda: 1 admin (REXS), 4 booster (Elrond, vitaminlii, Xarien,
YUSUF EMRE). Ortak rolü şemada hazır ama henüz ortak kullanıcı YOK ve
arayüz rolü tam ayırmıyor (açık iş).

## Para modeli — en kritik bölüm

Bütün türetilmiş değerler `panel-v2/lib/model.ts` içinde. Formüller:

```
netRevenue = cost × (1 − feePct/100) × kur     (₺; kur TRY ise 1)
costTL     = işi yapan bizden biriyse booster_payout,
             dışarı resell verildiyse vendor_cost × kur
profit     = netRevenue − costTL               ("kalan kâr")
```

Doğrulanmış örnek: $35 sipariş, %10 komisyon, kur 47 → brüt 1.645 ₺,
net 1.481 ₺, booster 592 ₺, kalan kâr 889 ₺.

### Eldorado kâr sahipliği

GameBoost kârı tamamen REXS'in. Eldorado kârı **işi FİİLEN kimin
yaptığına** bakar (`Order.doerRole` — booster_id'nin rolünden türetilir):

| İşi yapan | Kalan kâr |
|---|---|
| REXS kendisi | %100 REXS |
| ortak kendisi | %100 ortak |
| başkası (çalışan VEYA dış resell) | **50 / 50** |

İki koruma kuralı:

1. **Ortaklık sınırı.** `pricing` tablosunda `partnership` kaydı
   (`since: 2026-08-18T15:52:53Z`). Bu tarihten ÖNCE oluşmuş her sipariş
   koşulsuz %100 REXS'in — kural geçmişi asla yeniden yazmaz. **Bu tarih
   bir kez konuldu ve DEĞİŞTİRİLMEZ**; oynatmak geçmiş parayı yeniden
   dağıtır.
2. Sınırın içinde sahiplik türetilmiş kalır: iş yeniden atanırsa pay
   kendiliğinden düzelir, bayatlayan ikinci bir kolon yoktur.

Fonksiyonlar: `profitOwner()` / `adminShare()` / `partnerShare()`.
`profiles.cut_pct` KULLANILMIYOR (kolon açıklamasında da yazar) — paylaşım
sabit 50/50, kişi başı yüzde değil.

### Hesaplar (paranın fiziken durduğu yer)

`market_accounts`: **HILL, MAJORSTORE, ELOFARM** — işletmenin üç Eldorado
satıcı hesabı. Bunlar dış satıcı DEĞİL, kendi hesaplarımız.

- `resells.account_id` → sipariş hangi hesaba düştü (para oraya gelir)
- `resells.resell_account_id` → resell ödemesi hangi hesaptan çıktı
  (boş = hesap dışı: Discord, özel arkadaş vb.)
- `resells.customer_discord` → müşteri Discord'dan eklendiyse adı
  (ayrı boolean yok; adın varlığı cevaptır)

**Hesap sahipliği kâr kuralını ETKİLEMEZ** — iki ayrı eksendir:
account_id "para nerede", kâr sahipliği "işi kim yaptı".

Overview'daki "Eldorado hesapları" kartı hesap başına hareketi gösterir ve
hesap başına şu denge kurulur:

```
gelen − giden = sen + ortak + maliyet karşılığı
```

"Maliyet karşılığı" gelenin kâr olmayan kısmıdır (booster'a ödenecek ücret
ya da başka yerden çıkmış resell ödemesini karşılayan pay) ve bilinçli
olarak kimseye bölüştürülmez. Kart bir bakiye DEFTERİ DEĞİLDİR: para
çekme/yatırma tutulmuyor; defter istenirse bakiye kolonu değil **hareket
tablosu** eklenecek.

Geçmiş 5 Eldorado siparişi HILL'e yazıldı; 28 GameBoost siparişi bilerek
hesapsız bırakıldı (Eldorado hesabına yazmak havuzu yanlışlaştırırdı).

### İptal edilen model (tarihçe — geri getirme)

İlk kurguda TZX ortaklığı sipariş başına yüzdeyle tutuluyordu
(`resells.partner`, `partner_pct` — migration 006 ekledi, 007 kaldırdı).
İki ders alındı ve ikisi de bugünkü tasarımda korunur:
- Platformdan türetmek geçmişi yeniden yazar (sınır kuralının sebebi).
- Siparişe yazılan pay, iş yeniden atanınca bayatlar (türetilmiş
  sahipliğin sebebi).

## Veritabanı

Ana tablolar: `resells` (siparişler), `order_finance` (satış fiyatı,
komisyon, kur — SADECE admin+ortak), `profiles`, `tracker_state`,
`tracker_matches`, `resell_comments` (ekip içi notlar), `order_activity`
(durum/sistem olayları), `payouts` (ödeme dönemleri), `pricing`
(anahtar-değer: step_prices, net_win, settings, partnership),
`fx_rates` (tracker günlük yazar), `market_accounts`, `order_credentials`,
`invites`.

Migration'lar `shared/migrations/` altında, hepsi CANLIYA UYGULANDI:

```
001-004  eski panel dönemi (oyun, dış kaynak, teslim, kur+yorum)
005  panel_v2 eklentileri: profiles.games, track_token, order_activity,
     payouts, screenshots bucket
006  TZX yüzde modeli (SONRA KALDIRILDI — tarihçe için durur)
007  ortak rolü + resells.platform + is_partner() + 11 politika
008  order_credentials (müşteri hesap giriş bilgileri)
009  market_accounts + resells.account_id
010  resells.resell_account_id + customer_discord
011  geçmiş Eldorado siparişlerini HILL'e yazan veri düzeltmesi
```

Önemli ayrımlar:
- **Notlar `resell_comments`'a** yazılır (eski panel de okur);
  `order_activity` durum/sistem olayları içindir. Drawer ikisini tek zaman
  çizelgesinde birleştirir.
- **Platform `resells.platform`'da** (007). `order_finance.platform` eski
  satırlar için yedek. Sebep: ortağın görünürlüğü platforma bağlı; finans
  girilmeden önce de platformun belli olması şart.
- Yaşam döngüsü tarihleri gerçek kolonlardan: `assigned_at`,
  `completed_at`, `paid_at`, `due_at`. Ortalama teslim süresi
  `completed_at − created_at` ile hesaplanır (now() ile DEĞİL).

### order_credentials — müşteri hesabı id-pw

Sipariş başına bir satır: `login`, `password`, `note` (2FA/e-posta).

- **Şifrelenmez, bilerek.** Booster hesaba girecek → geri okunabilir olmak
  zorunda; hash işe yaramaz. Simetrik şifreleme anahtarı service_role'e
  taşırdı = RLS devre dışı + elle yetki kodu. Koruma RLS'tedir: admin
  hepsini, ortak Eldorado'dakini, çalışan yalnızca kendi üzerindeki AKTİF
  ve ARŞİVLENMEMİŞ işinkini görür. Bunun korumadığı şey: DB'ye doğrudan
  erişimi olan biri.
- **Ayrı tablo, bilerek.** `loadPanel` `resells.*` çeker; kolon olsaydı her
  liste render'ında tüm şifreler tarayıcıya inerdi. Bilgi yalnızca drawer
  açılınca, tek sipariş için çekilir (`loadCredentials`).
- **Hiçbir yere loglanmaz** — activity/not/bildirim yazılmaz. Kim dokundu:
  `updated_by`. Arayüzde maskeli; kopyala düğmesi ekrana getirmeden
  kullandırır.

### RLS felsefesi — en çok hata yapılan yer

1. **Postgres permissive politikaları OR'lar.** Mevcut bir politikanın
   yanına daha geniş bir tane eklemek erişimi KISITLAMAZ, GENİŞLETİR.
   (Tasarım dokümanının önerdiği politika bloğu bu yüzden uygulanmadı —
   `profiles using (true)` her booster'a tüm IBAN'ları açacaktı.)
   Mevcut politikalara dokunma; yeni tabloya politika yaz, konvansiyonu
   izle: `is_admin()` / `is_partner()` / `is_active()` + kendi-satırı.
2. **RLS yasak DELETE'i SESSİZCE reddeder** — hata değil, "0 satır" döner.
   Her silmede `.select('id')` yapıp dönen sayıyı istenenle karşılaştır
   (`deleteOrders` böyle yapar; eski panel bunu canlıda öğrendi).
3. **RLS satır bazlıdır, kolon gizleyemez.** Ortak çalışan İSMİNİ görmeli
   ama IBAN'ı görmemeli — bu problem AÇIK: security-definer view denendi,
   denetçi ERROR verdi, geri alındı. Seçenekler 007'nin sonunda yazılı.
   Hassas kolonları ayrı tabloya taşımak canlı vanilla paneli kırar
   (boosters.js/payments.js profiles.iban okur) — o yol kapalı.

## Ortak sözleşme — elle liste kopyalama YASAK

`shared/domain.json` tek doğruluk kaynağı: oyunlar, rank merdivenleri,
bölgeler (+çarpanları), durumlar (+geçişleri), elo sabitleri.
`python shared/generate.py` İKİ dosya üretir:

```
panel/js/domain.generated.js        (vanilla panel)
panel-v2/lib/domain.generated.ts    (yeni panel)
```

`--check` ikisini de denetler; `tracker/test_smoke.py::test_shared_contract`
bunu çalıştırır. Üç yüzey de aynı `resells` satırlarına yazar; kayan bir
değer HATA VERMEZ, tracker sessizce eşleşmeyi keser. Yaşanmış örnek: bölge
`"Other"` yazılmıştı, sözleşmedeki değer `"Diğer"` — TR/EU/NA dışı hiçbir
sipariş tracker'da çözülmeyecekti. domain.json'a dokununca generate
çalıştır; listeleri asla elle kopyalama.

Valorant elo aritmetiği: tier genişliği 100, en düşük ranked tier 3,
Immortal tier 24'te başlar ve RR'ı Immortal-1 tabanından kümülatif sayar,
Radiant 27. `tracker/ranks.py` ile `panel-v2/lib/domain.ts` birebir aynı
kuralı uygular — biri değişirse öbürü de değişmek zorunda.

## panel-v2 teknik kararları

- Next.js 15 App Router, React 19, `@supabase/ssr`. Okumalar server
  component + cookie'li client; TÜM mutasyonlar `lib/actions.ts`'te server
  action ve sonunda `revalidatePath('/', 'layout')` (sidebar rozetleri
  siparişten türediği için shell de tazelenmeli).
- `loadPanel()` `cache()` ile sarılı: layout + sayfa istek başına TEK sorgu.
- **URL = durum**: bölüm, görünüm (table/cards/board), filtreler, arama,
  açık sipariş. Seçim/sürükleme/modal client state.
- Drawer **intercepted route**: listeden açılınca üstte panel
  (`@drawer/(.)orders/[id]`), doğrudan linkte tam sayfa (`orders/[id]`).
- Realtime: `resells` + `tracker_state`'e tek abonelik → 500ms debounce →
  `router.refresh()`.
- **Fontlar self-hosted** (`public/fonts`, Inter+Oswald woff2, latin +
  latin-ext). Sebep: `next/font/google` build SIRASINDA font indirir ve
  Vercel build ortamı fonts.gstatic.com'a ERİŞEMEDİ — ilk deploy bununla
  düştü. latin-ext şart: ğ/ş/İ orada ("Diğer", "GİRİŞ").
- **Middleware matcher font uzantılarını dışlar** — yoksa girişsiz
  ziyaretçide /fonts/* login'e yönlenir ve login sayfası kendi fontunu
  yükleyemez (yaşandı, düzeltildi).
- `html lang="en"`: `text-transform: uppercase` locale'e bakar; `lang="tr"`
  her i'yi İ yapar ("SİGN İN" hatası yaşandı).
- İki public Supabase değişkeni commit'li `.env.production`'da gelir
  (publishable key zaten herkese açık; koruma RLS'te). Dashboard'a
  girilen değer her zaman kazanır. Gerçek sırlar (`SUPABASE_SERVICE_ROLE_KEY`,
  `CRON_SECRET`) SADECE dashboard'a.
- Stil ayrımı: media query / hover globals.css'te; veriye bağlı her şey
  (durum rengi, oyun aksanı, bar genişliği) `lib/ui.ts`'ten inline. Aynı
  değeri iki yere yazma.
- Silme iki adımlı onayla (kur → onayla), kalıcıdır, 5 çocuk tablo
  CASCADE ile gider. Booster yalnızca ödenmemiş kendi işini silebilir.

## Deploy

- **Vercel**: proje `resell-bot-panel-v2`, root directory `panel-v2`,
  Node 24. Dal önizlemesi:
  `https://resell-bot-panel-v2-git-1418a8-tepetarik213-gmailcoms-projects.vercel.app`
  Production `main`'i izler → PR #7 merge olana kadar production deploy
  "root directory does not exist" ile düşer; şimdilik yalnız dal
  önizlemesi çalışır.
- **Cloudflare Pages** ESKİ paneli yayınlar (`hill-brothers-resell-panel`).
  TUZAK: dal önizleme URL'i `panel-v2.hill-brothers-...` adını taşır ama
  ESKİ paneli servis eder — Cloudflare `panel/` klasörünü yayınlıyor.
- Cron: yalnız `/api/fx` (günlük, USD/EUR→TRY → `fx_rates`). Hobby planı
  2 iş/günlük sınırı — daha fazlası deploy'u düşürür.
- Migration'lar canlıya MCP üzerinden uygulanıyor; `main`'e merge şart
  değil ama dosya her zaman `shared/migrations/`e yazılır.

## Bilinçli olarak YAPILMAYANLAR (yeniden önermeden önce oku)

- **Marketplace ingest silindi.** Eldorado'nun public satıcı API'si yok;
  GameBoost v2 API'sinde boosting siparişi ucu yok (doküman tarandı).
  Manuel giriş + yapıştır-çözümle (`lib/parse.ts`) asıl yol. Upsert
  tesisatı git geçmişinde.
- **Bakiye kolonu yok** — arkasında hareket defteri olmayan bakiye sayısı
  gerçekle ayrışır. Defter istenince hareket tablosu eklenecek.
- **Şifre şifrelemesi yok** — gerekçe order_credentials bölümünde.
- **Booster atanmamış havuzu göremez** — mevcut projenin bilinçli RLS
  kararı, "eksik" değil.
- **Çalışan arşivli işin credential'ına erişemez** (`archived = false`
  şartı) — iş kapanınca erişim kapanır.

## Açık işler

1. Ortak arayüzü: rol var, RLS var (11 politika), ama UI rolü tam
   ayırmıyor (menüler/başlıklar admin varsayıyor). Ortak kullanıcı da
   henüz açılmadı.
2. Ortağın çalışan-ismi görme problemi (RLS kolon kısıtı — seçenekler
   007'de).
3. "Şifremi unuttum" akışı yok (Supabase recovery e-postasıyla küçük iş).
4. Drawer'daki Edit butonu pasif (sipariş düzenleme formu tasarlanmadı).
5. Müşteri takip sayfası `/track/[token]` ve başvuru `/apply` — handoff
   "sonra" diyor; `track_token` kolonu hazır.
6. **Giriş yapılmış arayüz hiç elle test edilmedi** — login + auth guard
   canlıda doğrulandı, gerisi build-time garantisi.
7. İstenirse: GameBoost için de hesap kovası (market_accounts'a bir satır).

## Çalışma kuralları

- Commit mesajları Türkçe, "neden"i anlatır. Push `panel-v2` dalına;
  PR #7 açık ve CLEAN, merge kararı sahibinde.
- Para semantiğinde VARSAYIM YAPMA — sor. (Bu projede her para kuralı
  kullanıcıya soru sorularak netleştirildi ve iki kez yanlış varsayım
  geri alındı: platformdan türetilen ortaklık, geçmişe işleyen paylaşım.)
- Canlı veritabanında yıkıcı işlem yapmadan önce mevcut durumu SQL ile
  doğrula; migration'ları additive ve idempotent yaz.
- `panel/` ve `tracker/` origin/main ile birebir kalmalı.
