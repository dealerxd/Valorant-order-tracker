-- Profit-share partners, recorded per order.
--
-- Applied to the live project as migration `order_partner_share`.
--
-- The split is NOT derived from the marketplace, even though today it
-- correlates with it (Eldorado -> TZX, GameBoost -> nobody). Two reasons:
--
--   1. Every order that existed when this shipped predates the TZX deal and
--      is 100% reXs'. Deriving from the marketplace would retroactively hand
--      TZX half the profit on three historic Eldorado jobs.
--   2. Freezing the percentage on the row means renegotiating the deal later
--      cannot silently rewrite what past orders were worth — the same reason
--      order_finance.rate freezes the exchange rate.
--
-- lib/model.ts PARTNER_DEFAULTS only seeds the New Order form; it never
-- reinterprets a stored order.
--
-- Existing rows are left with partner = null, i.e. wholly reXs'.

alter table resells add column if not exists partner     text;
alter table resells add column if not exists partner_pct numeric;

create index if not exists resells_partner_idx on resells (partner) where partner is not null;

comment on column resells.partner is
  'Kar ortagi (orn. TZX). null ise kalan karin tamami reXs''e ait.';
comment on column resells.partner_pct is
  'Ortagin kalan kardan aldigi yuzde. Siparis olustugunda donduruluyor.';
