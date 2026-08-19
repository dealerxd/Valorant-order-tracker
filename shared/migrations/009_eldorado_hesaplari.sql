-- Kendi pazaryeri hesaplarimiz.
--
-- Eldorado'da uc satici hesabimiz var: HILL, MAJORSTORE, ELOFARM. Bir siparis
-- bunlardan HANGISINE dustuyse parasi fiziken orada birikiyor.
--
-- Bu, karin KIMIN oldugu sorusundan AYRI bir eksen:
--   account_id -> para nerede duruyor
--   kar sahipligi -> isi kim yapti (007'deki kural, degismedi)
-- Hesap sahipligi kar kuralini etkilemiyor.
--
-- Simdilik yalnizca GOSTERGE: hesap basina birikmis kazanc gorunuyor.
-- Gercek defter (para cekme/yatirma hareketleri, guncel bakiye) sonraki
-- asamada; o yuzden burada bakiye kolonu YOK -- olmayan bir defteri
-- temsil eden bir sayi tutmak, yanlis olmasi garanti bir alan olurdu.

create table if not exists market_accounts (
  id       bigserial primary key,
  name     text not null,
  platform text not null default 'Eldorado',
  active   boolean not null default true,
  sort     int not null default 0,
  unique (platform, name)
);

comment on table market_accounts is
  'Kendi pazaryeri satici hesaplarimiz. Siparisin parasinin fiziken nerede oldugunu gosterir; kar sahipligiyle ilgisi yoktur.';

insert into market_accounts (name, platform, sort) values
  ('HILL',       'Eldorado', 1),
  ('MAJORSTORE', 'Eldorado', 2),
  ('ELOFARM',    'Eldorado', 3)
on conflict (platform, name) do nothing;

alter table resells add column if not exists account_id bigint references market_accounts(id);
create index if not exists resells_account_idx on resells (account_id) where account_id is not null;

comment on column resells.account_id is
  'Siparisin dustugu kendi satici hesabimiz. Eski kayitlarda bos.';

alter table market_accounts enable row level security;

-- Hesap listesi finans bilgisi; calisanin isi degil.
drop policy if exists hesap_admin on market_accounts;
create policy hesap_admin on market_accounts for all to authenticated
  using (is_admin()) with check (is_admin());

-- Ortak listeden secebilmeli, ama listeyi degistirememeli.
drop policy if exists hesap_ortak_oku on market_accounts;
create policy hesap_ortak_oku on market_accounts for select to authenticated
  using (is_partner());
