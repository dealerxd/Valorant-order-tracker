# Valorant Sipariş Takip Botu

HILL Boosting panelindeki siparişlerin maç maç ilerleyişini HenrikDev API'sinden
çekip Telegram ve Discord üzerinden müşteriye rapor eden bot. Hesap şifresine
ihtiyaç duymaz — takip PUUID üzerinden yapılır, hesap kimde olursa olsun çalışır.

## Panelle ilişkisi

**Siparişler panelde açılır, bot sipariş oluşturmaz.** Bot mevcut bir siparişi bir
Valorant hesabına *bağlar*; hedef rank, bölge ve not panelden okunur.

Bağlama **otomatiktir**: panelde sipariş `atandi`/`devam` durumundayken Riot ID
alanına nick girmen (ya da boostçunun girmesi) yeterli — bot bir sonraki turda
kendiliğinden hesabı çözüp takibi başlatır. `/bagla` komutu duruyor ama zorunlu
değil, sadece anında bağlamak istediğinde kullanılıyor.

Nick hatalıysa bot bir kez dener, sana hatayı bildirir ve **Riot ID alanını
temizler** — yoksa her turda aynı hatayı tekrar bildirip kanalı doldururdu.

| Nerede | Ne tutulur |
|---|---|
| `resells` (panel) | Siparişin kendisi + `riot_id` (takip edilecek hesabın Riot ID'si) |
| `tracker_state` | Takip durumu: PUUID, başlangıç/hedef/güncel elo, müşteri kanalları |
| `tracker_matches` | Çekilen competitive maçlar |

Müşteri bildirim kanalları `tracker_state`'te durur, `resells`'e taşınmaz — panelde
müşteri bilgisi bilerek tutulmuyor.

Bot yalnızca `durum` alanı **`atandi`** veya **`devam`** olan, arşivlenmemiş ve bir
hesaba bağlanmış siparişleri yoklar.

## Ne yapar

**Müşteriye giden bildirimler**

| Olay | Ne zaman |
|---|---|
| Rank atlama / düşme | Tier değiştiği anda |
| Seans özeti | Son maçtan 20 dk geçince, o seansın tüm maçları tek mesajda |
| Sipariş tamamlandı | Güncel elo hedefe ulaşınca |

Maç başına mesaj atılmaz. 3 saatlik bir seans müşteriye 6-8 ayrı bildirim yerine
tek özet olarak gider.

`MIRROR_TO_OPS=true` iken (varsayılan) müşteriye giden her mesajın kopyası
operatör kanalına da düşer, başında sipariş kodu ve hesap adıyla. Müşteri kanalı
henüz bağlanmamışsa kopya yine gelir ama `-> MUSTERI KANALI YOK` etiketiyle, yani
rapor kaybolmaz. Müşteri kanalı zaten operatör kanalıysa çift gönderim olmaz.

**Sadece sana giden uyarılar**

- Üst üste 3 mağlubiyet (eşik ayarlanabilir)
- 24 saattir hiç maç yok — boostçu takılmış olabilir
- Act değişti — rank sıfırlandığı için takip otomatik duraklatılır
- Riot ID çözülemedi — otomatik bağlama başarısız oldu
- Supabase / API hataları

Sipariş tamamlanınca bot takibi durdurur ve sana haber verir, ama **paneldeki
`durum` alanına dokunmaz** — "Tamam"a almak sende.

## Kurulum

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

`.env.example` dosyasını `.env` olarak kopyala ve doldur.

### 1. Supabase service_role anahtarı

Dashboard → Project Settings → API Keys → **service_role**. `SUPABASE_SERVICE_KEY`'e yaz.

Bu anahtar RLS'i baypas eder — sadece bu daemon'da, `.env` içinde dursun. Panele
veya repoya asla koyma. (`config.py` publishable anahtar verilirse başlamayı reddeder.)

### 2. HenrikDev API anahtarı

https://api.henrikdev.xyz/dashboard/ adresinden alınıyor, Discord üyeliği gerekiyor.

- **Basic key**: 30 istek/dakika — bu bot için yeterli
- **Enhanced key**: 90 istek/dakika — 40+ eşzamanlı aktif sipariş varsa

Bot her isteği 2 birim sayarak güvenli tarafta kalıyor (HenrikDev cache miss'lerde
çift sayım yapıyor).

### 3. Telegram

1. [@BotFather](https://t.me/botfather) → `/newbot` → token'ı `TELEGRAM_BOT_TOKEN`'a yaz
2. Botu operatör grubuna ekle, grupta `/yardim` yaz — bot chat ID'sini söyler
3. O ID'yi `TELEGRAM_OPS_CHAT_ID`'ye, kendi kullanıcı ID'ni `TELEGRAM_ADMIN_IDS`'e yaz

### 4. Discord

1. [Developer Portal](https://discord.com/developers/applications) → New Application → Bot → token
2. OAuth2 → URL Generator → scope `bot` + `applications.commands`, izin `Send Messages`
3. Kanal ID'sini `DISCORD_OPS_CHANNEL_ID`'ye, sunucu ID'sini `DISCORD_GUILD_ID`'ye yaz

Ayrıcalıklı intent'e gerek yok — slash komutları kullanılıyor.

### Yetkilendirme

`*_ADMIN_IDS` boş bırakılırsa bot **yalnızca operatör kanalında** komut kabul eder.
Müşteri sohbetlerinde `/musteri` çalıştırabilmek için kendi ID'ni admin listesine ekle.

## Çalıştırma

```bash
python tracker/main.py
```

Her iki bot ve poll döngüsü aynı süreçte çalışır. Başlangıçta Supabase bağlantısı
doğrulanır; başarısızsa bot açılmaz.

## Komutlar

Telegram'da `/bagla ...`, Discord'da aynı isimli slash komutları.

| Komut | Açıklama |
|---|---|
| `/liste` | Paneldeki aktif siparişler + takip durumları |
| `/bagla <kod> <isim#tag>` | Siparişi bir hesaba bağlar, takibi başlatır |
| `/durum <kod>` | Detay, ilerleme çubuğu, son maçlar |
| `/musteri <kod>` | Bu sohbeti siparişin müşteri kanalı yapar |
| `/musteri <kod> kapat` | Müşteri bildirimini kapatır |
| `/duraklat <kod>` / `/devam <kod>` | Takibi durdurur / başlatır |
| `/kaldir <kod>` | Takibi ve maç kayıtlarını siler (panele dokunmaz) |
| `/yardim` | Komut listesi |

`<kod>` sipariş UUID'sinin ilk 8 karakteri. `/liste` ile görürsün.

### Tipik akış

1. Sipariş panelde açılır, boostçuya atanır (`durum: atandi`)
2. Panelde **Riot ID** alanına hesabın nick'i girilir (sen ya da boostçu)
3. Bot 5 dakika içinde kendiliğinden bağlar, sana "takibe alındı" bildirimi gelir
4. Müşterinin sohbetine gidip `/musteri <kod>` — kod bildirimde yazıyor
5. Gerisi otomatik

Adım 3'ü beklemek istemezsen `/liste` ile kodu alıp `/bagla <kod> <isim#tag>`
diyebilirsin; sonuç aynı.

## Test

```bash
python tracker/test_smoke.py
```

Ağa çıkmaz, Supabase gerektirmez — hem API istemcisi hem veri deposu sahte
nesnelerle değiştirilir, olay tespiti ve mesaj üretimi gerçek kodla çalışır.

Gerçek bir hesapta okuma hattını doğrulamak için (bot token'ı gerekmez):

```bash
python tracker/check_account.py Player#TR1 eu
```

## Nasıl çalışıyor

`POLL_INTERVAL_SECONDS` (varsayılan 300) aralıklarla
`/valorant/v2/by-puuid/mmr-history/{region}/{platform}/{puuid}` çağrılır. Bu endpoint
zaten yalnızca competitive maçları döndürür; unrated ve deathmatch otomatik elenir.

İlerleme HenrikDev'in `elo` alanı üzerinden hesaplanır:

```
elo = (tier_id - 3) * 100 + rr        # Diamond 1 (tier 18), 38 RR -> 1538
ilerleme = (güncel_elo - başlangıç_elo) / (hedef_elo - başlangıç_elo)
```

Panelin bölge etiketleri API koduna çevrilir: `TR`/`EU` → `eu`, `NA` → `na`,
`Diğer` → `eu` (Türkiye Valorant'ta EU sunucularında oynuyor).

**Başlangıç çizgisi:** `/bagla` sonrasındaki ilk poll'de API'nin döndürdüğü geçmiş
(son ~20 maç) sipariş açılmadan önce oynanmış maçlardır. Bot bunları sessizce
kaydeder ve raporlanmış sayar — müşteriye kendi siparişi olmayan bir "20 maç
oynandı" özeti gitmez. Bildirimler ikinci poll'den itibaren başlar.

**Durum filtreleri:** `/liste` ve `/bagla` `yeni`/`atandi`/`devam` siparişlerini
görür (siparişi boostçuya atanmadan önce hazır edebilirsin), ama poll döngüsü
yalnızca `atandi`/`devam` olanları yoklar — `yeni` bir sipariş kimse oynamadığı
için boş yere "takılma" uyarısı üretirdi.

## Dosyalar

| Dosya | İşlevi |
|---|---|
| `main.py` | Giriş noktası, botları ve poll döngüsünü birlikte çalıştırır |
| `tracker.py` | Poll döngüsü ve olay tespiti |
| `store.py` | Supabase veri katmanı (PostgREST) |
| `henrik.py` | HenrikDev istemcisi, rate limiter, 429/retry |
| `commands.py` | Platformdan bağımsız komut mantığı |
| `bot_telegram.py` / `bot_discord.py` | Komut arayüzleri ve gönderici |
| `notify.py` | Bildirim dağıtıcı (müşteri / operatör ayrımı) |
| `messages.py` | Mesaj metinleri |
| `ranks.py` | Tier tabloları ve elo aritmetiği |
| `domain.py` | `shared/domain.json` okuyucusu — panelle ortak sözleşme |
| `check_account.py` | Tek hesapta okuma hattını doğrulayan araç |
| `test_smoke.py` | Ağa çıkmayan duman testi |

Rank etiketleri, bölge kodları, durum değerleri ve tablo isimleri bu dizinde
tanımlı **değil** — hepsi `shared/domain.json`'dan geliyor, panel de aynı
dosyayı okuyor. Ayrıntı: depo kökündeki `README.md`.

## Bilinen sınırlar

**`mmr-history` sınırlı bir pencere döndürür.** Poll aralığını çok açarsan yoğun
oynanan bir hesapta aradaki maçlar kaçabilir. 5 dakika güvenli; 30 dakikanın
üzerine çıkma.

**Radiant hedefli siparişlerde ilerleme yüzdesi yaklaşıktır.** Immortal 3'ün
üzerinde sıralama leaderboard'a bağlı; bot bu durumda mesaja uyarı notu ekler.

**Act geçişinde müdahale gerekir.** Bot maçların `season` alanını izler; act
değiştiğinde takibi duraklatıp sana haber verir ve müşteriye yanlış "rank düştü"
mesajı gitmesini engeller. Başlangıç elo'su geçersiz kaldığı için
`/kaldir` + `/bagla` ile yeni baseline'la bağlaman gerekir.

**Immortal'da RR farklı sayılır.** Alt rank'larda `rr` tier içinde 0–99 arası,
Immortal ve üstünde Immortal 1 tabanından kümülatif ilerler (Immortal 2 / 191 RR
→ elo 2291). `ranks.py` bunu ayrı ele alıyor.

**Panelde Iron ve Radiant yok.** `RANK_ORDER` Bronze 1'de başlayıp Immortal 3'te
bitiyor. Tracker ikisini de destekliyor ama panelde karşılığı olmayan bir hedef
girilemez.
