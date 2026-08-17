# Resell.BOT — Panel v2

Next.js (App Router) implementation of the Panel v2 design handoff. Talks to
the same Supabase project as the Python tracker bot in the repo root.

## Running it

```bash
cd panel && npm install && npm run dev
```

Copy `.env.example` to `.env.local` and fill in the blanks. The Supabase URL
and publishable key are already filled in — the rest are secrets you supply:

| Variable | Needed for |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/fx` and the ingest routes (server only) |
| `CRON_SECRET` | guards every `/api/*` route against public calls |
| `FX_API_KEY` | optional — without it `/api/fx` uses the keyless open.er-api.com |
| `ELDORADO_API_KEY`, `GAMEBOOST_API_KEY` | marketplace ingest (see *Not wired up*) |
| `TRACK_LINK_SECRET` | HMAC for the customer `/track/[token]` links (surface not built) |

## The migration — already applied

`supabase/migrations/0001_panel_v2.sql` has been applied to the live project
(`yhrvpgkxywwgeelhjszb`) as migration `panel_v2_additions`. It is idempotent,
so re-running it is safe.

It turned out to be much smaller than the handoff implied, because the
database was already ahead of the design doc. Present before this work and
therefore **not** touched: `resells.vendor*`, `resells.assigned_at /
completed_at / paid_at / due_at`, `profiles.iban / capacity / active /
crypto_addr / phone / discord`, `fx_rates`, `resell_comments`, `invites`, and
the `is_admin()` / `is_active()` / `order_has_finance()` helpers.

What it actually adds: `profiles.games`, `resells.track_token`, the
`order_activity` and `payouts` tables with their policies, and the
`screenshots` storage bucket.

### Why it does not touch existing RLS

RLS was **already enabled on every table** with hand-written policies. The
handoff's suggested policy block would have been actively harmful, because
Postgres ORs permissive policies together — adding a broader policy next to
an existing one widens access instead of restricting it:

| Table | Existing policy | Handoff's policy would have added |
|---|---|---|
| `profiles` | `id = auth.uid() OR is_admin()` | `using (true)` → every booster reads every IBAN |
| `resells` | `booster_id = auth.uid() AND is_active()` | `OR booster_id is null`, and no `is_active()` → deactivated boosters regain access |
| `tracker_*` | own-order only | same widening |

So the migration creates policies for the two new tables only, following the
conventions already in place: `is_admin()` for admins, own-order +
`is_active()` for boosters. The role model the database enforces:

- **admin** — everything.
- **booster** — their own orders only (not the unassigned pool — that is the
  existing project's choice, not an oversight here), and never
  `order_finance` or `payouts`.

The `#outsourced vendor|amount|currency|paid` backfill from the handoff was
dropped: zero rows still carry the tag and zero have `vendor` set.

Note that `profiles` visibility means a signed-in **booster sees only their
own profile row**, so the Boosters page will list just them. That follows from
the existing `profil_oku` policy; widening it is a product decision for you,
not something to change silently.

## Layout

```
app/
  (panel)/            sidebar + sticky topbar shell, auth-guarded
    overview/ orders/ boosters/ payments/ pricing/
    orders/[id]/      full page on a direct load
    @drawer/(.)orders/[id]/   intercepted — renders the drawer over /orders
  login/
  api/fx/ api/ingest/{eldorado,gameboost}/
lib/
  model.ts            view-model types + every derived value (client-safe)
  orders.ts           queries and row -> view mapping  <- from sb-store.js
  actions.ts          all mutations, as server actions
  domain.ts           games, ladders, statuses, Valorant elo arithmetic
  pricing.ts          step prices, payout and quote calculators
  parse.ts            marketplace paste parser
  ui.ts               design tokens and inline style helpers
  format.ts           TL(), ago(), shortDate()
  supabase/           server / browser / service-role clients
components/           one file per surface from the handoff
supabase/migrations/  0001_panel_v2.sql
```

Conventions worth knowing before editing:

- **Reads** are server components using the cookie-bound client. `loadPanel()`
  is wrapped in `cache()`, so the layout and the page it renders share one
  query per request.
- **Mutations** are server actions that end in `revalidatePath('/', 'layout')`
  — the sidebar badges and the notification bell are derived from orders, so
  the shell has to refresh too.
- **URL is state** for section, view mode, status/game/source filter, search
  and the open order. Selection, drag state and modals are client state.
- **Styling** splits deliberately: layout, media queries and `:hover` live in
  `app/globals.css`; anything that varies with data (status colour, game
  accent, bar width) is an inline style from `lib/ui.ts`. Inline wins over
  CSS, so never express the same value in both places.
- **Realtime** is one subscription on `resells` + `tracker_state` calling
  `router.refresh()`, debounced 500 ms.

## Tracker

Riot/HenrikDev polling stays in the Python bot at the repo root (Railway) —
option (b) from the handoff. The panel only reads `tracker_state` and
`tracker_matches`, so there is no `/api/tracker` route and no `RIOT_API_KEY`
here.

`lib/domain.ts` still carries the Valorant elo arithmetic (`rankFromElo`,
`eloFrom`), because the drawer and the progress bars have to decode
`current_elo` the same way `ranks.py` encodes it: tier width 100, lowest
ranked tier 3, Immortal starts at tier 24 and counts RR cumulatively from the
Immortal 1 base, Radiant is 27. **If `ranks.py` changes, change this too.**

## Not wired up

Two things in the handoff are deliberately unfinished, and both fail loudly
rather than pretending to work:

- **Marketplace ingest.** `/api/ingest/eldorado` and `/api/ingest/gameboost`
  return 501. The insert half is finished in `app/api/ingest/_shared.ts` —
  it writes the `resells` + `order_finance` pair, deduplicates on
  `order_finance.platform_ref` so re-runs are safe, and logs an activity row.
  What is missing is the fetch. Eldorado has no public seller API. GameBoost's
  documented v2 API (`api.gameboost.com/v2`, Bearer auth) covers account,
  currency, item and gift-card orders — it has no endpoint for *boosting
  service* orders, which is the only kind this panel tracks. Either a
  partner endpoint outside the public docs is needed, or the
  `*-order-purchased` webhook should be used instead of a poll. Until then
  the New Order paste parser is the working path, which is what it was
  built for.
- **Customer `/track/[token]` and booster `/apply` pages.** Not designed yet,
  per the handoff. The `track_token` column exists so links can be minted
  when the design lands.

The drawer's **Edit** button is also inert — the handoff lists it but does not
specify the edit form.

## Reading the live schema, not the handoff

Four things were written against the design doc's assumptions and then
corrected once the real database was inspected. Worth knowing, because the
handoff still describes the old shape:

- **FX** lives in the `fx_rates` table (`currency`, `as_of`, `rate`, PK on the
  first two), which the Python tracker writes daily. `/api/fx` upserts into
  it rather than creating a second store; the panel reads the newest row per
  currency. The route is redundant while the bot's own FX write is running —
  it exists so the panel does not depend on the bot being up, and both are
  idempotent per `(currency, as_of)`.
- **Notes** go to `resell_comments`, which predates `order_activity` and
  already has policies (author must be the admin or the assigned booster).
  `order_activity` carries status and system events only; the drawer merges
  both streams newest-first.
- **Turnaround** uses the real `completed_at − created_at`. The first cut
  measured against `now()`, which inflated the figure on every page load.
- **Due dates** use `resells.due_at` when set, falling back to the handoff's
  "older than 5 days" rule. (No row currently sets it.)

`order_finance` carries two generations of columns. The live set is
`cost / cost_currency / fee_pct / rate / cost_tl`; the legacy
`commission_pct / fx_rate / resell_try` columns are all zero. `sale_price`
is the stored net-after-fee figure and matches this code's `netRevenue()`
exactly — e.g. `156.45 EUR × 0.55 × 55 = 4733`.

## Verified

`npm run typecheck`, `npm run lint` and `npm run build` are clean.

Against the live project: the login page renders, the middleware auth guard
works (`/overview` → `/login?next=/overview`), the migration applied without
disturbing the existing `profiles` (3) and `resells` (5) policies, and the
Supabase security advisor reports no new findings. The read path was checked
by running `loadPanel()`'s arithmetic as SQL over the real rows — 12 active
orders, 1 open, ₺26,527 gross, ₺8,911 net profit, 0.4 d average delivery.

The signed-in UI has **not** been clicked through: that needs an account on
the project. Sign in once and confirm the Orders table, the board drag, and a
note round-trip before trusting it in anger.
