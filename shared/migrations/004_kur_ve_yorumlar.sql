-- 004 — otomatik kur ve sipariş yorumları
--
-- ## fx_rates
--
-- Kur şimdiye kadar her siparişte ELLE giriliyordu. Unutulduğunda kâr hesabı
-- sessizce bozuluyor (dış kaynak maliyeti 0 sayılıyor, brüt gelir TL'ye
-- çevrilemiyor); yanlış girildiğinde de fark aylar sonra fark ediliyor.
--
-- Kuru PANEL çekmiyor, TRACKER çekip buraya yazıyor. Üç sebep:
--   1. Panel statik bir sayfa; her açılışta dışarı istek atması demek, kur
--      servisi düştüğünde ya da CORS politikası değiştiğinde kur alanının
--      boş kalması demek.
--   2. Tracker zaten sürekli çalışan bir servis; günde bir istek onun için
--      bedava.
--   3. Kur GEÇMİŞİ tutuluyor. Sipariş anındaki kur `resell_finance.rate`'te
--      sabitleniyor (bu değişmiyor); buradaki tablo yalnızca "bugünün kuru
--      neydi" sorusunu cevaplıyor ve geriye dönük denetime izin veriyor.
--
-- Tarih birincil anahtarın parçası: aynı gün ikinci kez çekilirse üzerine
-- yazıyor, kopya satır birikmiyor.

create table if not exists public.fx_rates (
  currency   text        not null,
  as_of      date        not null,
  rate       numeric(12,4) not null check (rate > 0),
  source     text,
  fetched_at timestamptz not null default now(),
  primary key (currency, as_of)
);

comment on table public.fx_rates is
  '1 birim yabancı para = ? TRY. Tracker günde bir yazar; panel formu buradan doldurur. Siparişin kuru resell_finance.rate''te sabitlenir, burası yalnızca güncel/son bilinen kuru verir.';

alter table public.fx_rates enable row level security;

-- Kur gizli bir bilgi değil; giriş yapmış herkes okuyabilir. YAZMAK yalnızca
-- service_role'a ait (tracker) — RLS'i o baypas ediyor, ayrıca policy
-- yazmıyoruz ki panelden yazılamasın.
drop policy if exists fx_rates_okuma on public.fx_rates;
create policy fx_rates_okuma on public.fx_rates
  for select to authenticated using (true);

-- ## resell_comments
--
-- Sipariş üzerinde konuşma. Şimdiye kadar tek bir `resells.note` alanı vardı:
-- üzerine yazılıyor, kim yazdı belli olmuyor, ve bot o notu müşteriye
-- iletiyor (tracker/messages.py) — yani ekip içi bir not yazmanın güvenli
-- yeri yoktu.

create table if not exists public.resell_comments (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid        not null references public.resells(id) on delete cascade,
  author_id  uuid        not null references public.profiles(id) on delete cascade,
  body       text        not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

comment on table public.resell_comments is
  'Sipariş üzerine ekip içi yorumlar. Müşteriye GİTMEZ — bot yalnızca resells.note alanını iletiyor.';

create index if not exists resell_comments_order_idx
  on public.resell_comments (order_id, created_at desc);

alter table public.resell_comments enable row level security;

-- Okuma: admin hepsini, booster yalnızca kendi işini görür — sipariş
-- listesindeki görünürlükle aynı kural.
drop policy if exists resell_comments_okuma on public.resell_comments;
create policy resell_comments_okuma on public.resell_comments
  for select to authenticated using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.role = 'admin')
    or exists (select 1 from public.resells r
                where r.id = order_id and r.booster_id = auth.uid())
  );

-- Yazma: aynı görünürlük + yorumu kendi adına yazmak zorunda. author_id'yi
-- başkasına ayarlayıp onun ağzından yazmak mümkün olmamalı.
drop policy if exists resell_comments_yazma on public.resell_comments;
create policy resell_comments_yazma on public.resell_comments
  for insert to authenticated with check (
    author_id = auth.uid()
    and (
      exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.role = 'admin')
      or exists (select 1 from public.resells r
                  where r.id = order_id and r.booster_id = auth.uid())
    )
  );

-- Silme: yalnızca kendi yorumunu. Düzenleme yok — yorum bir kayıt, sonradan
-- değiştirilebilen kayıt kayıt sayılmaz.
drop policy if exists resell_comments_silme on public.resell_comments;
create policy resell_comments_silme on public.resell_comments
  for delete to authenticated using (author_id = auth.uid());
