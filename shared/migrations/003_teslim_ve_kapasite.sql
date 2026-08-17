-- 003 — teslim tarihi ve booster kapasitesi
--
-- Tasarımda iki bilgi vardı ama veritabanında karşılığı yoktu:
--
--   1. "2 gün geç" / "3 gün kaldı"  → siparişin bir TESLİM TARİHİ olmalı.
--      Bugüne kadar bir işin geciktiğini ancak takip botunun "24 saattir maç
--      yok" uyarısından anlıyorduk; o da yalnızca Valorant'ta ve yalnızca
--      Riot ID bağlıysa çalışıyor. Rocket League siparişi süresiz duruyordu.
--
--   2. "2 / 4 iş" doluluk çubuğu → booster'ın aynı anda alabileceği İŞ SAYISI.
--      Kimin müsait olduğunu bilmeden atama yapmak, dolu boostçuya beşinci işi
--      vermek demek.
--
-- İkisi de NULL'a izin veriyor: teslim tarihi girilmemiş sipariş "süresiz",
-- kapasitesi girilmemiş booster "sınırsız" sayılıyor. Var olan kayıtların
-- hiçbiri bozulmuyor.

alter table public.resells
  add column if not exists due_at date;

comment on column public.resells.due_at is
  'Müşteriye söz verilen teslim tarihi. NULL = süresiz. Panel bunu geçen açık işleri geciken olarak işaretler.';

-- Geciken işler sorgusu: açık + tarihi geçmiş. Kısmi indeks, çünkü kapanmış
-- siparişlerin teslim tarihi bir daha sorgulanmıyor.
create index if not exists resells_due_idx
  on public.resells (due_at)
  where due_at is not null and durum <> 'tamam' and archived = false;

alter table public.profiles
  add column if not exists capacity smallint;

comment on column public.profiles.capacity is
  'Aynı anda alabileceği açık iş sayısı. NULL = sınırsız.';

alter table public.profiles
  add constraint profiles_capacity_pozitif
  check (capacity is null or capacity > 0) not valid;
