-- Siparise bagli oyun hesabi giris bilgileri.
--
-- NEDEN AYRI TABLO
-- 1) resells uzerinde olsaydi, siparisi okuyabilen herkes sifreyi de okurdu.
--    Ayri tablo, gorunurlugu siparisten BAGIMSIZ daraltmayi mumkun kiliyor.
-- 2) loadPanel resells.* cekiyor. Sifre orada olsa her liste render'inda
--    butun sifreler tarayiciya inerdi. Burada yalnizca drawer acilinca,
--    tek siparis icin cekiliyor.
--
-- SIFRELEME YOK, BILEREK
-- Booster hesaba girecegi icin sifrenin geri okunabilir olmasi gerekiyor;
-- hash ise yaramaz. Simetrik sifreleme anahtari sunucuda tutmayi ve okumayi
-- service_role'e tasimayi gerektirirdi -- bu da RLS'i devre disi birakip
-- yetkilendirmeyi elle yazmak demek. Koruma bu yuzden RLS'te: kim hangi
-- siparisin bilgisini gorebiliyor, tek yerde ve veritabaninda tanimli.
-- Bunun korumadigi sey: veritabanina dogrudan erisimi olan biri.
--
-- Bu satirlar MUSTERI verisi. order_activity'ye, nota, bildirime yazilmaz.

create table if not exists order_credentials (
  order_id   uuid primary key references resells(id) on delete cascade,
  login      text,
  password   text,
  note       text,                       -- e-posta, 2FA, ek not
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

comment on table order_credentials is
  'Siparisteki oyun hesabinin giris bilgileri. Musteri verisi; loglanmaz.';

alter table order_credentials enable row level security;

-- admin: her sey
drop policy if exists cred_admin on order_credentials;
create policy cred_admin on order_credentials for all to authenticated
  using (is_admin()) with check (is_admin());

-- ortak: yalnizca Eldorado siparisleri
drop policy if exists cred_ortak on order_credentials;
create policy cred_ortak on order_credentials for all to authenticated
  using (is_partner() and exists (
    select 1 from resells r where r.id = order_credentials.order_id and r.platform = 'Eldorado'))
  with check (is_partner() and exists (
    select 1 from resells r where r.id = order_credentials.order_id and r.platform = 'Eldorado'));

-- calisan: yalnizca KENDI uzerine atanmis, arsivlenmemis siparis. Arsiv
-- kosulu bilincli: is kapandiktan sonra bilgi erisimde kalmasin.
drop policy if exists cred_booster_oku on order_credentials;
create policy cred_booster_oku on order_credentials for select to authenticated
  using (is_active() and exists (
    select 1 from resells r
    where r.id = order_credentials.order_id
      and r.booster_id = auth.uid()
      and r.archived = false));

-- Kendi isinin bilgisini kendi de girebilir ("verilen siparisi not etme").
drop policy if exists cred_booster_yaz on order_credentials;
create policy cred_booster_yaz on order_credentials for insert to authenticated
  with check (is_active() and exists (
    select 1 from resells r
    where r.id = order_credentials.order_id
      and r.booster_id = auth.uid()
      and r.archived = false));

drop policy if exists cred_booster_guncelle on order_credentials;
create policy cred_booster_guncelle on order_credentials for update to authenticated
  using (is_active() and exists (
    select 1 from resells r
    where r.id = order_credentials.order_id
      and r.booster_id = auth.uid()
      and r.archived = false))
  with check (is_active() and exists (
    select 1 from resells r
    where r.id = order_credentials.order_id
      and r.booster_id = auth.uid()
      and r.archived = false));
