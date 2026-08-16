# Resell.bot — HILL Boosting

Valorant boost resell takip paneli. Statik site, framework yok.
Backend: Supabase. Barındırma: Cloudflare Pages.

## Dosya Yapısı

```
index.html        — sayfa iskeleti (sadece markup)
css/style.css     — tüm stiller
js/config.js      — Supabase bağlantısı, sabitler, global durum
js/pricing.js     — fiyat motoru, hesaplayıcı, fiyat listesi sekmesi
js/auth.js        — giriş / davet kodlu kayıt
js/data.js        — veri çekme + finans yardımcıları
js/orders.js      — sipariş formu (rank/netwin/placement/özel), kartlar, para hesabı
js/report.js      — rapor sekmesi
js/boosters.js    — booster & davet yönetimi
js/app.js         — sekmeler, rol arayüzü, başlatma
```

## Para Modeli (özet)

Boost Fiyatı = panelden alınan tutar = **GELİR**. Kâr otomatik hesaplanır:

```
kâr = (boostFiyatı − komisyon) × kur − boosterÜcreti   (hepsi TL)
```

## Yayınlama

Cloudflare Pages bu repoya bağlıdır. `main` dalına her push otomatik deploy olur.

## Yerel açma

`index.html` dosyasını tarayıcıda aç — hepsi bu. (Supabase CDN'i için internet gerekir.)
