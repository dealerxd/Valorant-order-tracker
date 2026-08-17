# HILL Boosting

Valorant boost işinin iki parçası tek depoda: siparişlerin açıldığı **panel** ve
siparişleri maç maç takip edip müşteriye rapor eden **tracker**.

```
panel/     Statik site (HTML/CSS/JS) — Supabase'e doğrudan bağlanır
tracker/   Python bot (Telegram + Discord) — Supabase'i service_role ile okur
shared/    İkisinin ortak sözleşmesi
```

## Neden tek depo

İkisi aynı Supabase şemasını paylaşıyor. Panel `resells` tablosuna siparişi
yazar, tracker aynı satırı okur:

| Panelin yazdığı | Tracker'ın kullanımı |
|---|---|
| `durum` (`atandi` / `devam`) | Hangi siparişlerin yoklanacağı |
| `baslangic` / `hedef` (`Plat 1`, `Diamond 3`…) | Hedef elo hesabı |
| `region` (`TR` / `EU` / `NA` / `Diğer`) | HenrikDev bölge kodu |
| `riot_id` | Takip edilecek hesap |

Ayrı depolardayken bu listeler iki tarafta elle senkron tutuluyordu (bölge
listesi üç yerde: panel HTML'i, panel JS'i, tracker'ın `store.py`'si). Panelde
bir durum yeniden adlandırılsa tracker **hata vermeden** yoklamayı keserdi —
sipariş takip ediliyor görünür, hiç bildirim gelmezdi.

## Oyunlar

Panel beş oyunun siparişini tutuyor; **bot yalnızca Valorant'ı takip ediyor.**

| Oyun | Panel | Takip botu |
|---|---|---|
| Valorant | ✓ | ✓ maç maç RR |
| Overwatch 2 · Marvel Rivals · Rocket League · Wild Rift | ✓ | — |

Diğerlerinin maç başına ilerleme veren bir API'si yok (gerekçe:
[`tracker/README.md`](tracker/README.md)). Bu oyunlarda panel sipariş, fiyat ve
booster yönetimi yapıyor, otomatik bildirim göndermiyor.

Ayrım `shared/domain.json` → `games[].tracked` bayrağında. Tracker poll
sorgusu bu bayrağa göre süzüyor — filtre olmasa bot bir Rocket League
siparişinin `Grand Champion II` hedefini Valorant rank'ı sanıp her turda hata
üretirdi. Rank isimleri oyunlar arasında örtüşüyor (`Bronze 3` hem Valorant'ta
hem OW2'de var, anlamları farklı), o yüzden koruma etiket değil sorgu
düzeyinde.

Yeni oyun eklemek: `domain.json` → `games` içine bir kayıt, `python
shared/generate.py`. Şema değişmiyor, `resells.game` metin alanı.

## Ortak sözleşme

`shared/domain.json` tek kaynak. Rank tablosu, bölge eşlemesi, sipariş
durumları ve tablo isimleri orada.

```
shared/domain.json
      │
      ├──> tracker/domain.py           (import anında okur)
      │
      └──> shared/generate.py ──> panel/js/domain.generated.js
```

Panel statik bir site olduğu için sözleşmeyi tarayıcıda `fetch` ile okumuyor;
üretilen JS dosyası repoya commit'li, panelin açılışı ek bir isteğe bağlı değil.

**Sözleşmeyi değiştirdikten sonra:**

```bash
python shared/generate.py
```

Unutursan `tracker/test_smoke.py` yakalar — üretilmiş dosya kaynakla
uyuşmuyorsa test başarısız olur.

Sözleşme sadece liste tutmuyor, tutarlılığı da kontrol ediyor: yoklanan ama
listelenmeyen bir durum ya da var olmayan bir duruma giden `next` alanı
tracker'ı açılışta durdurur.

## Geliştirme

```bash
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                 # doldur

python tracker/main.py          # tracker'ı çalıştır
python tracker/test_smoke.py    # testler (ağa çıkmaz, Supabase gerektirmez)
```

Panel için kurulum yok: `panel/index.html` dosyasını tarayıcıda aç.

Ayrıntılı dokümanlar: [`tracker/README.md`](tracker/README.md) ·
[`panel/README.md`](panel/README.md)

## Yayınlama

İki parça ayrı yerlere, aynı depodan deploy oluyor:

| Parça | Nereye | Ayar |
|---|---|---|
| `panel/` | Cloudflare Pages | Build output directory = `panel` |
| `tracker/` | Railway | `railway.json` → `python tracker/main.py` |

### Cloudflare Pages ayarı

Panel deponun kökünde değil, `panel/` altında. Pages projesinin bunu bilmesi
gerekiyor — bu ayar dashboard'da duruyor, repodaki hiçbir dosyadan
değiştirilemiyor:

| Alan | Değer |
|---|---|
| Repository | `dealerxd/Valorant-order-tracker` |
| Production branch | `main` |
| Framework preset | None |
| Build command | *(boş)* |
| **Build output directory** | **`panel`** |
| Root directory (advanced) | `/` — dokunma |

Build command'in boş olması doğru: panel statik, derleme adımı yok. Dosyalar
oldukları gibi yayınlanıyor.

Deploy sonrası hızlı kontrol: giriş yap, bir siparişi aç, **Bölge** ve **Durum**
açılır listelerine bak. İkisi de `js/domain.generated.js`'ten dolduruluyor —
doluysa sözleşme tarayıcıya ulaşmış demektir. Boşsa üretilmiş dosya
yüklenmemiştir.

Railway tarafında ek iş yok: `requirements.txt` ve `.python-version` Nixpacks
bulsun diye kökte bırakıldı.

## Anahtarlar

Panel `sb_publishable_` anahtarını kullanır (RLS arkasında, tarayıcıda durması
normal). Tracker `service_role` anahtarını kullanır — **RLS'i baypas eder**,
sadece `.env` içinde, sadece sunucuda. `tracker/config.py` yanlışlıkla
publishable anahtar verilirse başlamayı reddeder.
