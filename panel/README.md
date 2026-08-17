# Resell.bot — HILL Boosting

Valorant boost resell takip paneli. Statik site, framework yok.
Backend: Supabase. Barındırma: Cloudflare Pages.

## Dosya Yapısı

```
index.html            — sayfa iskeleti (sadece markup)
css/style.css         — tüm stiller
js/domain.generated.js — ÜRETİLMİŞ, elle düzenleme (bkz. aşağıda)
js/config.js          — Supabase bağlantısı, fiyat sabitleri, global durum
js/pricing.js     — fiyat motoru, hesaplayıcı, fiyat listesi sekmesi
js/auth.js        — giriş / davet kodlu kayıt
js/data.js        — veri çekme + finans yardımcıları
js/orders.js      — sipariş formu (rank/netwin/placement/özel), kartlar, para hesabı
js/report.js      — rapor sekmesi
js/boosters.js    — booster & davet yönetimi
js/app.js         — sekmeler, rol arayüzü, başlatma
```

## Takip botuyla ortak sözleşme

Rank listesi (`RANK_ORDER`), bölge listesi (`REGION_VALUES`, `REGION_MULT`),
sipariş durumları (`STATUS_LABEL`, `NEXT_STATUS`) ve tablo isimleri (`TABLES`)
`js/config.js`'te **tanımlı değil** — `js/domain.generated.js`'ten geliyor,
kaynağı depo kökündeki `shared/domain.json`.

Takip botu aynı dosyayı okuyor. Burada elle bir durum adı ya da rank etiketi
değiştirirsen bot ayrışır ve siparişleri yoklamayı sessizce keser. Değişiklik
`shared/domain.json`'da yapılır, sonra:

```bash
python shared/generate.py
```

Bölge ve durum `<select>` seçenekleri de HTML'e gömülü değil; `data-region` /
`data-status` işaretli alanlar açılışta bu listeden doldurulur.

## Para Modeli (özet)

Boost Fiyatı = panelden alınan tutar = **GELİR**. Kâr otomatik hesaplanır:

```
kâr = (boostFiyatı − komisyon) × kur − boosterÜcreti   (hepsi TL)
```

## Yayınlama

Cloudflare Pages bu depoya bağlı, `main` dalına her push otomatik deploy olur.
Panel artık deponun kökünde değil — Pages projesinde **Build output directory**
ayarı `panel` olmalı, Build command boş. Ayrıntı: depo kökündeki `README.md`.

## Yerel açma

`index.html` dosyasını tarayıcıda aç — hepsi bu. (Supabase CDN'i için internet gerekir.)
