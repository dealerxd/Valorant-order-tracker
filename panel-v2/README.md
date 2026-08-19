# Resell.BOT — Panel v2

> Third surface in this repo, alongside `panel/` (the current static site) and
> `tracker/` (the Python bot). It does **not** replace `panel/` yet — both are
> live and read the same Supabase tables. Vercel's root directory is
> `panel-v2`.

Next.js (App Router) implementation of the Panel v2 design handoff. Talks to
the same Supabase project as the `panel/` static site and the `tracker/`
Python bot.

## Running it

```bash
cd panel-v2 && npm install && npm run dev
```

Copy `.env.example` to `.env.local` and fill in the blanks. The Supabase URL
and publishable key are already filled in — the rest are secrets you supply:

| Variable | Needed for |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | the `/api/fx` cron (server only) |
| `CRON_SECRET` | guards every `/api/*` route against public calls |
| `FX_API_KEY` | optional — without it `/api/fx` uses the keyless open.er-api.com |
| `TRACK_LINK_SECRET` | HMAC for the customer `/track/[token]` links (surface not built) |

## Deploying to Vercel

The Vercel project must be created from the git repo with **root directory
`panel-v2`** — the repo also holds `panel/`, `tracker/` and `shared/`, so a
root-level build finds no Next.js app.

The project already exists and **builds green**: **`resell-bot-panel-v2`**
(`prj_bNDYKPc7UpDrRwgk1smXQzGnPnt8`), linked to the repo with root directory
`panel-v2`, Node 24.x. Branch preview:

    https://resell-bot-panel-v2-git-1418a8-tepetarik213-gmailcoms-projects.vercel.app

It serves: `/login` answers 200 and `/overview` 307s to it for a signed-out
visitor. The two public Supabase values ship in a committed
`panel-v2/.env.production`, which Next.js reads at build time; anything set in
the Vercel dashboard still overrides it, since `.env` files never clobber a
variable already present in `process.env`.

Remaining:

1. Add the real secrets (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`) in the
   dashboard — only `/api/*` needs them, the panel boots without.
2. Production tracks `main`, which has no `panel-v2/` until PR #7 merges.
   Until then only `panel-v2`-branch previews build; a production deploy
   would fail with "root directory does not exist".

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://yhrvpgkxywwgeelhjszb.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_zwHVMn87dm7xJ1aB-_p7Xg_iUypsY-L` |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase → Settings → API (secret) |
| `CRON_SECRET` | any long random string (secret) |
| `FX_API_KEY` | optional; blank uses the keyless provider |
| `TRACK_LINK_SECRET` | only needed once `/track/[token]` exists |

The first two are **required for the app to boot** — they are inlined into the
client bundle at build time, so a deploy without them builds green and then
500s on every page. They are not secrets (the anon key is the publishable
one, already in `.env.example` and the prototype).

### Cron

`vercel.json` schedules **only** `/api/fx`, daily. (More crons would also hit
the Hobby plan's limit — 2 jobs, once-daily — which fails the deploy outright.)

## The migration — already applied

`shared/migrations/005_panel_v2_eklentileri.sql` has been applied to the live project
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
  api/fx/
lib/
  domain.generated.ts GENERATED from shared/domain.json — do not edit
  domain.ts           games/regions/statuses; re-exports the generated contract
  model.ts            view-model types + every derived value (client-safe)
  orders.ts           queries and row -> view mapping  <- from sb-store.js
  actions.ts          all mutations, as server actions
  pricing.ts          step prices, payout and quote calculators
  parse.ts            marketplace paste parser
  ui.ts               design tokens and inline style helpers
  format.ts           TL(), ago(), shortDate()
  supabase/           server / browser / service-role clients
components/           one file per surface from the handoff
(migrations live in shared/migrations/, alongside the other two surfaces)
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

Riot/HenrikDev polling stays in the `tracker/` Python bot (Railway) —
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

- **Marketplace ingest was removed** (formerly `/api/ingest/*`, always 501).
  Eldorado has no public seller API, and GameBoost's documented v2 API has no
  endpoint for *boosting service* orders — so the routes could never fetch
  anything and the workflow settled on manual entry, with the paste parser
  filling the form from marketplace text. The finished upsert plumbing
  (dedup on `order_finance.platform_ref`) is in git history if an API ever
  appears.
- **Customer `/track/[token]` and booster `/apply` pages.** Not designed yet,
  per the handoff. The `track_token` column exists so links can be minted
  when the design lands.

The drawer's **Edit** button is also inert — the handoff lists it but does not
specify the edit form.

## Eldorado profit & the shared pool

GameBoost profit is wholly reXs'. Eldorado profit follows **who actually did
the job** (`Order.doerRole`):

| Doer | Remaining profit |
|---|---|
| reXs himself | 100% reXs |
| the partner (ortak) himself | 100% ortak |
| anyone else — employee or outside resell | 50 / 50 |

"Remaining profit" is `netRevenue − costTL`. Two guards:

- **Partnership boundary.** Orders created before the partnership start
  (`pricing` row `partnership`) are unconditionally 100% reXs' — the rule
  never rewrites history. The boundary is set once and must not be moved;
  moving it re-attributes old money.
- Inside the boundary ownership stays **derived**, so reassigning a job
  corrects the split automatically instead of leaving a stale stored value.

Read it with `profitOwner()` / `adminShare()` / `partnerShare()` in
`lib/model.ts`.

**Where the money physically sits is a separate axis.** `resells.account_id`
records which of our Eldorado seller accounts (HILL / MAJORSTORE / ELOFARM,
`market_accounts`) the order landed on; `resells.resell_account_id` records
which account an outside resell was paid from; `resells.customer_discord`
holds the customer's Discord if added. The Overview "Eldorado hesapları"
card shows per-account movement, balanced per account as

    gelen − giden = sen + ortak + maliyet karşılığı

It is deliberately **not** a ledger: withdrawals/deposits are not tracked
yet, and the card says so. When a real ledger is wanted, add a movements
table — not a balance column.
## Deleting an order

Archiving hides a job; **deleting** removes it, for one opened by mistake. It
lives in the order drawer as a red *Sil* button that arms on the first click
and only fires on the second — there is no undo. All five child tables
(`order_finance`, `tracker_state`, `tracker_matches`, `resell_comments`,
`order_activity`) are `ON DELETE CASCADE`, so nothing is orphaned.

The button shows for an admin always, and for a booster only while the job is
unpaid — mirroring the old panel and the `siparis_booster_sil` policy, which
permits a booster to delete only their own order when `paid = false` and it
has no `order_finance` row.

**The trap:** RLS rejects a forbidden `DELETE` *silently*. Postgres reports
success with zero rows affected rather than raising — so a delete that was
denied looks exactly like one that worked. `deleteOrders()` therefore issues
`.select('id')` and compares the returned count against what was asked for,
reporting the difference. Do not "simplify" that away. The old panel hit this
in production; see `panel/js/orders.js` → `deleteRecord`.

As of writing, every row in the database is either paid or carries finance, so
**no** order is booster-deletable today — only an admin can remove one.

## Account credentials on an order

Boosting needs the customer's game login, so an order can carry one
(`order_credentials`, one row per order: `login`, `password`, `note`).

**Not encrypted, on purpose.** The booster has to sign in with it, so it must
be readable back — a hash is useless here. Symmetric encryption would mean
holding a key server-side and reading through `service_role`, which bypasses
RLS and moves authorisation into hand-written app code. The protection is in
RLS instead, where it is declarative and lives next to the data:

| Role | Sees credentials for |
|---|---|
| admin | every order |
| ortak | Eldorado orders only |
| çalışan | only orders assigned to them, while active and not archived |

What this stops is one booster reading another's customer credentials. What
it does not stop is someone with direct database access.

Two deliberate details:

- **Separate table, not a column on `resells`.** `loadPanel` selects
  `resells.*`, so a column would ship every password to the browser on every
  list render. Credentials are fetched only when the drawer opens, for that
  one order. It also lets the visibility rule be narrower than the order's.
- **Never logged.** No `order_activity` row, no note, no notification. Who
  last touched it is in `updated_by`.

In the UI the password is masked with a reveal toggle, and there is a copy
button so it can be used without ever being displayed.

## Employee earnings

A çalışan sees two figures on Overview, from their own orders only (RLS makes
that automatic):

- **Bekleyen** — completed but unpaid, i.e. what they are owed.
- **Toplam kazanç** — everything earned to date, paid included.

Once an order is completed **and paid** it drops off their Orders list, per
the spec. It is not deleted: the admin still sees it in full and it keeps
counting toward the employee's lifetime total.

## The shared contract

Game ids, rank ladders, region values and multipliers, status keys and
transitions, and the elo constants all come from `shared/domain.json` via
`shared/generate.py`, which now emits **two** files:

```
shared/domain.json ──> panel/js/domain.generated.js   (static site)
                   └─> panel-v2/lib/domain.generated.ts (this app)
```

Regenerate with `python shared/generate.py`; `--check` fails if either output
is stale, and `tracker/test_smoke.py::test_shared_contract` runs that check.

This matters more than tidiness. All three surfaces write the same `resells`
rows, and a value that drifts does not fail loudly — the tracker simply stops
matching. Hand-copying the lists (which the first cut of this app did) had
already introduced two real defects:

- **`region`** was written as `"Other"`, but the contract's catch-all is
  `"Diğer"`. The tracker resolves a region's API code from that exact string,
  so every non-TR/EU/NA order would have silently failed to resolve.
- **Wild Rift** was folded onto Valorant, so a Wild Rift order's ranks would
  have been labelled with the Valorant ladder.

Both are fixed by reading the contract. What stays hand-written in
`lib/domain.ts` is only what the contract deliberately omits, because it is
presentation rather than shared meaning: game accent colours, account-field
labels, division step prices, and the extras multipliers. Status *labels* are
also local — the contract's are Turkish, the design is English — but the keys
and transitions come from the contract.

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
