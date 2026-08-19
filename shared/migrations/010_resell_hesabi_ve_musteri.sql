-- Ortak veri havuzu icin iki eksik alan.
--
-- 1) resell_account_id: siparis HILL'e dustu ama resell'i ELOFARM'dan
--    verdik gibi akislar var. account_id paranin GELDIGI hesabi tutuyordu;
--    bu kolon resell odemesinin CIKTIGI hesabi tutuyor. Bos = resell yok
--    ya da hesap disi verildi (Discord, ozel arkadas vb.).
--
-- 2) customer_discord: musteriyi Discord'dan ekledikse adi. Bos = eklemedik.
--    Ayri bir boolean yok; adin varligi zaten cevap.

alter table resells add column if not exists resell_account_id bigint references market_accounts(id);
alter table resells add column if not exists customer_discord text;

create index if not exists resells_resell_account_idx
  on resells (resell_account_id) where resell_account_id is not null;

comment on column resells.resell_account_id is
  'Resell odemesinin ciktigi kendi hesabimiz. Bos = resell yok ya da hesap disi.';
comment on column resells.customer_discord is
  'Musterinin Discord adi. Bos = Discord''dan eklemedik.';
