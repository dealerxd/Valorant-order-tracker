-- Panel v2 schema additions.
--
-- Scoped against the live Resell.BOT project (yhrvpgkxywwgeelhjszb), which is
-- further along than the design handoff assumed. Already present and NOT
-- touched here:
--
--   resells.vendor / vendor_cost / vendor_currency / vendor_paid
--   resells.assigned_at / completed_at / paid_at / due_at
--   profiles.iban / capacity / active / crypto_addr / phone / discord
--   fx_rates          — the tracker writes it daily; the panel reads it
--   resell_comments   — team-internal notes on an order
--   invites
--   is_admin() / is_active() / order_has_finance()
--
-- RLS is ALREADY enabled on every existing table with hand-written policies.
-- This migration deliberately does not create, drop or replace a single
-- policy on an existing table. Postgres ORs permissive policies together, so
-- adding a broader policy alongside the existing ones would widen access
-- rather than restrict it — e.g. a `profiles using (true)` policy would let
-- every booster read every IBAN. Only the two NEW tables get policies, and
-- they follow the conventions already in place: is_admin() for admins,
-- own-order + is_active() for boosters.
--
-- The `#outsourced vendor|amount|currency|paid` note backfill from the
-- handoff is omitted: zero rows still carry the tag and zero rows have
-- vendor set, so there is nothing to migrate.

begin;

-- ------------------------------------------------------------------ profiles
-- Which games a booster covers. Shown as badges on the Boosters cards and
-- used to filter that list by the game lens.
alter table profiles add column if not exists games text[] default '{}';

-- ------------------------------------------------------------------- resells
-- Secret link for the customer tracking page (surface not built yet).
alter table resells add column if not exists track_token text;
create unique index if not exists resells_track_token_key
  on resells (track_token) where track_token is not null;

-- ------------------------------------------------------------ order_activity
-- Status / system timeline. Free-text notes keep going to resell_comments,
-- which already exists with its own policies; the drawer merges both.
create table if not exists order_activity (
  id         bigserial primary key,
  order_id   uuid references resells(id) on delete cascade,
  actor_id   uuid references profiles(id),
  kind       text,            -- yeni | atandi | devam | tamam | note | warn
  text       text,
  created_at timestamptz not null default now()
);
create index if not exists order_activity_order_idx
  on order_activity (order_id, created_at desc);

alter table order_activity enable row level security;

drop policy if exists order_activity_admin on order_activity;
create policy order_activity_admin on order_activity for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists order_activity_booster_read on order_activity;
create policy order_activity_booster_read on order_activity for select to authenticated
  using (
    exists (
      select 1 from resells r
      where r.id = order_activity.order_id
        and r.booster_id = auth.uid()
    ) and is_active()
  );

drop policy if exists order_activity_booster_write on order_activity;
create policy order_activity_booster_write on order_activity for insert to authenticated
  with check (
    actor_id = auth.uid()
    and is_active()
    and exists (
      select 1 from resells r
      where r.id = order_activity.order_id
        and r.booster_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------- payouts
-- Settled payout periods, written by the Payments tab. Admin-only, matching
-- how order_finance is already locked down.
create table if not exists payouts (
  id           bigserial primary key,
  booster_id   uuid references profiles(id),
  period_start date,
  period_end   date,
  amount_tl    numeric,
  method       text,
  paid_at      timestamptz default now()
);
create index if not exists payouts_booster_idx on payouts (booster_id, period_end desc);

alter table payouts enable row level security;

drop policy if exists payouts_admin on payouts;
create policy payouts_admin on payouts for all to authenticated
  using (is_admin()) with check (is_admin());

commit;

-- =====================================================================
-- Storage: finish screenshots dropped on the board
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict (id) do nothing;

drop policy if exists screenshots_read on storage.objects;
create policy screenshots_read on storage.objects for select to authenticated
  using (bucket_id = 'screenshots');

drop policy if exists screenshots_write on storage.objects;
create policy screenshots_write on storage.objects for insert to authenticated
  with check (bucket_id = 'screenshots');
