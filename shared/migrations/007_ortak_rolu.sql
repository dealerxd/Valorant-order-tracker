-- Ortak rolu: Eldorado'ya kisitlanmis yonetici.
--
-- Model:
--   admin   (REXS) : her sey
--   ortak          : YALNIZCA Eldorado. Siparis olusturur, fiyat girer,
--                    Eldorado islerini calisanlara atar. GameBoost'u hic
--                    gormez. Eldorado karinin profiles.cut_pct kadarini alir.
--   booster        : kendine atanan isler (degismedi)
--
-- Iptal: siparise yazilan TZX kar payi (resells.partner / partner_pct).
-- Ikisi de hic kullanilmadi (0 satir), o yuzden dusurmek veri kaybetmiyor.

begin;

-- ------------------------------------------------------- 1. platform siparise
-- Platform order_finance.platform'da duruyordu. Ortagin gorunurlugu platforma
-- bagli olacagi icin bu calismaz: RLS resells'e bakiyor, finans ayri tabloda
-- ve ortak onu okuyabilmek icin once siparisi gormek zorunda -- dongu. Ayrica
-- fiyat girilmeden once siparisin platformu hic belli olmuyordu, yani ortak
-- kendi olusturdugu siparisi goremezdi.
--
-- Platform artik siparisin kendi gercegi. order_finance.platform finans
-- raporlamasi icin yerinde kaliyor.
alter table resells add column if not exists platform text;

update resells r
set platform = coalesce(
      (select f.platform from order_finance f where f.order_id = r.id),
      'GameBoost')                     -- finans kaydi olmayan 5 arsivli kayit
where r.platform is null;

alter table resells alter column platform set default 'GameBoost';
alter table resells alter column platform set not null;

alter table resells drop constraint if exists resells_platform_check;
alter table resells add constraint resells_platform_check
  check (platform in ('Eldorado', 'GameBoost', 'Other'));

create index if not exists resells_platform_idx on resells (platform);

-- --------------------------------------------- 2. TZX kar payini geri al
alter table resells drop column if exists partner;
alter table resells drop column if exists partner_pct;

-- ----------------------------------------------------------- 3. ortak rolu
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'ortak', 'booster'));

comment on column profiles.cut_pct is
  'Ortagin Eldorado karindan aldigi yuzde. Diger rollerde bos.';

create or replace function public.is_partner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'ortak' and active
  );
$$;

commit;

-- =====================================================================
-- RLS
-- =====================================================================
-- Mevcut politikalara DOKUNULMUYOR. Postgres permissive politikalari OR'ladigi
-- icin asagidakiler yalnizca ortagin erisimini ekliyor; admin ve booster'in
-- gorduğu hicbir sey degismiyor. Henuz kimsenin rolu 'ortak' olmadigi icin bu
-- politikalar bugun sifir kullaniciyi etkiliyor.

-- ---- resells: ortak sadece Eldorado ----
drop policy if exists resells_ortak_oku on resells;
create policy resells_ortak_oku on resells for select to authenticated
  using (is_partner() and platform = 'Eldorado');

drop policy if exists resells_ortak_ekle on resells;
create policy resells_ortak_ekle on resells for insert to authenticated
  with check (is_partner() and platform = 'Eldorado');

drop policy if exists resells_ortak_guncelle on resells;
create policy resells_ortak_guncelle on resells for update to authenticated
  using (is_partner() and platform = 'Eldorado')
  with check (is_partner() and platform = 'Eldorado');

-- Yanlislikla acilan siparisi kaldirma; odenmis isi ortak da silemiyor.
drop policy if exists resells_ortak_sil on resells;
create policy resells_ortak_sil on resells for delete to authenticated
  using (is_partner() and platform = 'Eldorado' and paid = false);

-- ---- order_finance: ortak Eldorado finansini girer/gorur ----
drop policy if exists finans_ortak on order_finance;
create policy finans_ortak on order_finance for all to authenticated
  using (is_partner() and exists (
    select 1 from resells r where r.id = order_finance.order_id and r.platform = 'Eldorado'))
  with check (is_partner() and exists (
    select 1 from resells r where r.id = order_finance.order_id and r.platform = 'Eldorado'));

-- ---- tracker / activity / yorumlar: ayni Eldorado kapsami ----
drop policy if exists tracker_state_ortak on tracker_state;
create policy tracker_state_ortak on tracker_state for select to authenticated
  using (is_partner() and exists (
    select 1 from resells r where r.id = tracker_state.order_id and r.platform = 'Eldorado'));

drop policy if exists tracker_matches_ortak on tracker_matches;
create policy tracker_matches_ortak on tracker_matches for select to authenticated
  using (is_partner() and exists (
    select 1 from resells r where r.id = tracker_matches.order_id and r.platform = 'Eldorado'));

drop policy if exists order_activity_ortak on order_activity;
create policy order_activity_ortak on order_activity for select to authenticated
  using (is_partner() and exists (
    select 1 from resells r where r.id = order_activity.order_id and r.platform = 'Eldorado'));

drop policy if exists order_activity_ortak_ekle on order_activity;
create policy order_activity_ortak_ekle on order_activity for insert to authenticated
  with check (actor_id = auth.uid() and is_partner() and exists (
    select 1 from resells r where r.id = order_activity.order_id and r.platform = 'Eldorado'));

drop policy if exists resell_comments_ortak on resell_comments;
create policy resell_comments_ortak on resell_comments for select to authenticated
  using (is_partner() and exists (
    select 1 from resells r where r.id = resell_comments.order_id and r.platform = 'Eldorado'));

drop policy if exists resell_comments_ortak_ekle on resell_comments;
create policy resell_comments_ortak_ekle on resell_comments for insert to authenticated
  with check (author_id = auth.uid() and is_partner() and exists (
    select 1 from resells r where r.id = resell_comments.order_id and r.platform = 'Eldorado'));

-- ---- ACIK KALAN: ortak calisan isimlerini nasil gorecek ----
-- Ortak, is atayabilmek icin calisan ISIMLERINI gormek zorunda ama IBAN /
-- kripto adresi / telefonu gormemeli. RLS satir bazli oldugu icin kolon
-- gizleyemiyor, ve bunu yalnizca arayuzde saklamak guvenlik olmaz.
--
-- Temiz cozum hassas kolonlari ayri bir tabloya tasimak olurdu, AMA canli
-- vanilla panel (panel/js/boosters.js, panel/js/payments.js) profiles.iban,
-- crypto_addr ve phone'u dogrudan okuyor -- tasimak onu kirar.
--
-- Ilk denemede security_invoker kapali bir `team` view'i kurulmustu; isini
-- yapiyordu ama Supabase guvenlik denetcisi bunu ERROR seviyesinde
-- (security_definer_view) isaretledi. Ortak arayuzu henuz olmadigi icin
-- kullanilmayan bir iskelet ugruna ERROR birakmak yerine view dusuruldu.
--
-- Karar, arayuz kurulurken verilecek. Secenekler:
--   a) security definer view (isini yapar, ERROR lint)
--   b) security definer RPC (ayni guvenlik durusu, WARN lint -- mevcut
--      is_admin()/is_active() ile ayni sinif)
--   c) hassas kolonlari ayri tabloya tasi + vanilla paneli de guncelle
