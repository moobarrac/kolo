# Kólò — Personal Financial Operating System — Technical Specification

**Version:** 1.0
**Date:** 28 June 2026
**Status:** Build-ready (Phase 0–1 implementable from this document)
**Audience:** Engineering (designed to be consumed by Claude Code as the build bible)

> **Name:** **Kólò** (Yoruba: the traditional savings box / piggybank). Display/brand name is written **Kólò**; the code, repo, and package identifier is `kolo` (ascii, lowercase). Note for later: the name is common in Nigerian fintech (KoloPay, Kollo, DigiKolo, and a personal-finance app named "Kolo" by Lendsqr) — fine for a personal build; add a differentiator (the diacritics as wordmark, or a descriptor) before any public launch.

---

## 0. How to use this document with Claude Code

This is the single source of truth for the build. Recommended workflow:

1. Drop this file into the repo root as `docs/SPEC.md` and reference it explicitly in prompts ("implement section 7.2 — `journal_lines` — exactly as specified").
2. Distill the non-negotiable conventions in §3 (money), §5 (ledger rules), and §6 (FX) into a short `CLAUDE.md` at the repo root so they're always in context. A starter `CLAUDE.md` is given in Appendix C.
3. Build in the phase order of §15. Each phase has acceptance criteria; do not advance until the integrity checks in §11 pass.
4. The worked example in Appendix A is a **golden test fixture** — seed it, run the pipeline, and assert the closing numbers. If they don't tie, the implementation is wrong.

Hard rules that must never be violated are tagged **[INVARIANT]**. If a requested change would break an invariant, stop and flag it rather than implementing it.

---

## 1. Product summary

**Kólò** is a personal, multi-user financial operating system: one platform giving a person complete, provable visibility into income, expenses, savings, investments, assets, liabilities, money owed to them, net worth over time, and long-term goals — across multiple currencies. The name nods to the Yoruba savings box: a familiar, trusted place to keep what's yours — here extended from coins to an entire financial picture.

It is not a tracker. The defining property is **provability**: every number on every dashboard traces back through a balanced double-entry journal to its source, and the books tell you when they are wrong instead of displaying a wrong number.

### Core capabilities
- Income / expense capture with categorization.
- Recurring transactions (rent, utilities, subscriptions, salary…) auto-posted over time.
- Asset register (land, real estate, gold, stocks, vehicles, businesses, other) with purchase data, location, quantity, documents, notes, and **valuation history**.
- Liabilities (loans, mortgages, credit cards) with correct amortization.
- **Receivables** — money other people owe the user — with partial repayment, mark-as-paid, write-off, and due-date reminders.
- Automatic, multi-currency **net worth** with full attribution of every change.
- Dashboards and reports: spending, savings trends, investment growth, asset appreciation, recurring load, FX impact, financial health.
- Goals (savings, debt payoff, net worth, custom).
- Notifications (in-app first; email + web push later).

---

## 2. Architecture

### 2.1 Stack
- **Frontend:** Vite + React + TypeScript + Tailwind, shipped as an installable **PWA** (usable on phone with no app store). Server state via **TanStack Query**. Charts via Recharts (or Chart.js — see §13).
- **Backend / BaaS:** **Supabase** — Postgres (the ledger), Auth, Storage (documents/images), and scheduled functions. One service rather than five stitched together; relational integrity is mandatory for a ledger, so Postgres, not a document store.
- **Hosting:** Frontend on Cloudflare Pages or Vercel (free tier). Backend on Supabase free tier.
- **Scheduler:** Supabase `pg_cron` / Scheduled Edge Functions, with a GitHub Actions cron as redundancy.

### 2.2 Free-tier operational notes (important)
- Supabase free projects **pause after 7 days of no database activity**, with a cold-start of up to ~60s on resume. The daily job (§12) writes rows every day, which keeps the project warm — design the job so it always performs at least one write.
- Free tier has **no automatic backups**. The daily job must dump a logical backup to object storage (Supabase Storage or Cloudflare R2).
- Free tier limits to be mindful of: 500 MB database, 1 GB file storage. Store file **bytes** in Storage, only **paths** in Postgres (§7 `attachments`). Never store blobs in the DB.

### 2.3 Multi-user model
Single-user *experience*, genuinely multi-user *architecture*. Every owned row carries `user_id`; isolation is enforced by Postgres Row-Level Security (§9), not application code. Turning this from "just me" into "many users" requires no rewrite.

### 2.4 Key/secret handling **[INVARIANT]**
- The Supabase **anon key** is the only key the browser ever sees.
- The **service-role key** is used exclusively by server-side scheduled jobs and never shipped to the client or committed to the repo.
- All client data access goes through RLS-protected tables; the client never assumes trust.

### 2.5 Repository structure
A workspaces monorepo with **separate `frontend/` and `backend/` folders**, plus a `shared/` package that is the reason the split stays painless.

```
kolo/
├── frontend/              # Vite + React + TS + Tailwind PWA
│   └── src/
├── backend/              # the Supabase project + scheduled jobs
│   ├── supabase/
│   │   ├── migrations/   # 0001_schema.sql … 0004_seed_system_accounts.sql
│   │   ├── functions/    # edge functions
│   │   └── seed/         # Appendix-A golden fixture (seed + test)
│   └── jobs/             # daily + month-end runners (service-role key lives ONLY here)
├── shared/               # TS domain types, money utils, entry-kind→legs map (§8), zod schemas
├── docs/SPEC.md          # this document
├── CLAUDE.md             # build conventions (Appendix C)
├── package.json          # workspaces: frontend, backend, shared
└── README.md
```

Rules for the split **[INVARIANT]**:
- `shared/` is the single source of truth for the money type, the entry-kind→legs map (§8), and all domain types. Both `frontend/` and `backend/` import from it; neither redefines them. A drift here is how a ledger starts producing numbers that don't tie.
- The **service-role key never leaves `backend/jobs/`**. `frontend/` only ever holds the Supabase anon key (§2.4).
- Database changes are made **only** via numbered migrations in `backend/supabase/migrations/` — never by editing the live schema by hand, so the schema is reproducible and the golden fixture (Appendix A) stays runnable.

---

## 3. Money & quantity representation **[INVARIANT]**

- **All monetary amounts are integers in minor units** (`bigint`), never floats. ₦1,000.00 → `100000`. Column suffix: `_minor`.
- Every monetary column is paired with an ISO-4217 **currency** (`char(3)`), e.g. `NGN`, `USD`, `EUR`, `XOF`, `EGP`.
- Minor-unit digits vary by currency (NGN/USD = 2, JPY = 0); stored in `currencies.minor_unit_digits`. All rounding uses the currency's own scale.
- **Quantities** for assets (grams of gold, number of shares, hectares) are `numeric`, separate from money. An asset's *value* is money; its *quantity* is not.
- FX rates are `numeric(20,8)`.
- Display formatting is a frontend concern; storage is always integer minor units.

---

## 4. The accounting model (conceptual)

The system is a **double-entry ledger** with a friendly UI on top. The user never types debits and credits — they say "spent ₦20,000 on groceries from GTBank" and the engine writes the two legs. But underneath, every economic event is a balanced journal entry.

### 4.1 The chart of accounts is one table
`accounts` holds every account, of five `type`s:

| type | normal balance | examples (subtype) |
|---|---|---|
| `asset` | debit | cash, bank, mobile_money, receivable, real_estate, land, gold, equities, vehicle, business |
| `liability` | credit | credit_card, loan, mortgage, personal_debt |
| `income` | credit | salary, freelance, realized_fx_gain, interest_income |
| `expense` | credit-reduces / debit-normal | rent, groceries, utilities, transport, subscriptions, bad_debt, interest_expense, fx_loss |
| `equity` | credit | opening_balance_equity, retained_earnings, fx_translation_reserve, asset_revaluation_reserve |

Consequences of this single-table design:
- **Categorization is free** — a transaction's "category" is just which income/expense account the other leg hits. Category reports are a `GROUP BY`.
- **Bank accounts, spending categories, income sources, loans, and asset holdings all live in one place**, which is what makes the fundamental identity below hold automatically.

### 4.2 The fundamental identity (the heartbeat) **[INVARIANT]**
At any date:

```
Assets = Liabilities + Equity
```

Equivalently, **the sum of every posted line's base-currency amount is always zero**. If this fails, the system must refuse to display a net worth figure and surface an integrity error (§11).

### 4.3 Net worth
```
Net worth (base) =
    Σ asset-account balances (translated to base)
  − Σ liability-account balances (translated to base)
```
Non-cash assets are carried at **market value** in their account (kept current by revaluation entries, §5.4), so this equals total **Equity**. Asset cost basis vs. market value differ by the revaluation reserves — i.e. unrealized gains live in equity, never in income (§5.4).

### 4.4 Net-worth articulation (the built-in error detector) **[INVARIANT]**
The change in net worth between any two dates must equal:

```
ΔNet worth = Net income (income − expenses, incl. realized gains/losses)
           + Unrealized asset revaluation
           + Unrealized FX revaluation
           + External capital events (gifts, inheritance, capital injections)
```

This is surfaced to the user as the **net-worth bridge** (§13) and used as an automated assertion in tests. If the bridge doesn't reconcile, there is a bug.

---

## 5. Ledger rules **[INVARIANT unless noted]**

### 5.1 Sign convention
- `journal_lines.amount_minor` is **signed**: **positive = debit, negative = credit**, expressed in the **line's own currency**.
- `journal_lines.base_amount_minor` is the same amount translated to the user's base currency (signed).
- An entry is balanced when `Σ base_amount_minor = 0` across its lines.
- For a single-currency entry, all lines share one `fx_rate`, so `Σ amount_minor = 0` holds in native terms too.

### 5.2 Append-only history
- Posted entries are **never edited or deleted**. Corrections are made by posting a **reversal** (`kind = 'reversal'`, `reverses_entry_id` set) and then a corrected entry.
- Entries may be freely edited/deleted **only while `status = 'draft'`**.
- Enforced by triggers (§10).

### 5.3 Specific transaction treatments (these are common ways books go wrong)
- **Credit-card purchase** is an **expense** the day it is incurred: debit expense, credit the card liability. **Paying the card later is a transfer** (debit liability, credit cash), **not** a new expense. Counting both double-counts spending — forbidden.
- **Loan payment** splits: the **interest** portion is an expense; the **principal** portion retires the liability. Never expense the principal.
- **Getting paid back on a receivable is not income** — it converts a receivable asset into cash (asset→asset). Only interest charged on it is income.
- **Bad-debt write-off** runs through a **`bad_debt` expense** account — it must appear on the income statement, never silently vanish from net worth.
- **Opening balances** each offset to **Opening Balance Equity** so the books balance on day one (§5.5).

### 5.4 Valuations: realized vs unrealized **[INVARIANT]**
- A new asset/FX market value is recorded by **posting a journal entry** that moves the asset account to its market carrying value, with the offsetting leg to an **equity reserve** — never to income:
  - Assets → `asset_revaluation_reserve` (equity).
  - Foreign-currency monetary accounts → `fx_translation_reserve` (equity).
- **Unrealized gains/losses never touch the income statement.** Paper gains are not earnings.
- On **sale/conversion**, the gain/loss becomes **realized** and is recognized in income (`realized_fx_gain` / a realized gain-loss account), and the reserve attributable to the disposed portion is released. (Implementation detail of reserve release: see §6.4.)
- `asset_valuations` / FX rates are the **inputs**; they must *generate* the journal entry, never bypass the ledger. Two sources of truth are forbidden.

### 5.5 Opening Balance Equity
On onboarding, each starting balance is entered as an `opening_balance` entry: debit the asset (or credit the liability) and offset to `opening_balance_equity` (always denominated in **base currency**). After setup reconciles, `opening_balance_equity` represents starting net worth and is conceptually folded into equity.

### 5.6 Reconciliation, period locking
- Each `journal_line` has a `cleared` flag and `reconciled_at`; a `reconciliations` record proves a recorded account balance equals an external statement for a period.
- Once a period is reconciled/closed it can be **locked** (`period_locks`); postings into a locked period are rejected by trigger (§10). "My net worth on 31 Dec was X" must be immutable.

---

## 6. Multi-currency & FX method **[INVARIANT]**

The governing principle: **record in the currency the event happened in; translate to base only when reporting; book the difference as FX.**

### 6.1 Account denomination
Each account has exactly one `currency` and is only ever held in that currency. A USD account holds dollars whether the rate is ₦1,500 or ₦1,800; its native balance does not change when the rate moves. The naira value is **computed**, never stored on the account.

### 6.2 Single-currency entries
Income, expense, and same-currency transfers are single-currency: all lines share one `fx_rate`, the entry balances in both native and base. Trivial.

### 6.3 Currency conversion (realized FX)
Selling foreign currency for base (or vice-versa) is the one routine cross-currency entry. It is balanced **in base**, and the gap between the transacted rate and the carried book rate is captured by an explicit **realized FX** line:

```
Sell $1,000 at bank rate 1,640; carried at 1,550:
  Dr  Cash (NGN)              ₦1,640,000
  Cr  USD Dom ($1,000)        ₦1,550,000   (carried base value of the dollars sold)
  Cr  Realized FX gain        ₦   90,000   (income)
```

### 6.4 Period-end revaluation (unrealized FX)
At each month-end, retranslate every foreign-currency monetary account's native balance to base at the closing rate; the delta posts to `fx_translation_reserve` (equity):

```
Hold $6,000; carried at 1,550, close at 1,650:
  $6,000 × 1,650 = ₦9,900,000, up ₦600,000:
  Dr  USD Dom         ₦600,000
  Cr  FX Translation Reserve   ₦600,000   (unrealized — equity, not income)
```
Reserves move both ways — a strengthening base currency produces an unrealized **loss** (debit the reserve).

**Carried-rate method (the implementation convention):** the foreign account carries a base value = native × "carried rate"; the carried rate is updated to the closing rate at each period close (that update is the revaluation entry). On a disposal between closes, the disposed units leave at the carried rate, and realized gain/loss = proceeds − base-removed-at-carried-rate. The remaining balance is trued up at the next close. This avoids per-lot reclassification while keeping the identity exact. (See Appendix A for a full worked run that ties every month.)

### 6.5 Rates & reporting
- `exchange_rates(rate_date, from_currency, to_currency, rate)` is the **only** place rates live. `rate` = units of `to_currency` per 1 unit of `from_currency`; `amount_to = amount_from × rate`.
- On-demand reports translate native balances at the relevant date's rate at **read time**.
- `net_worth_snapshots` **stores the rates used** alongside each snapshot so historical net-worth points are reproducible and never silently re-translate at a newer rate.

---

## 7. Data model — full schema (PostgreSQL)

Conventions: `uuid` PKs via `gen_random_uuid()`; `timestamptz` with `created_at default now()`; `updated_at` maintained by trigger (§10.1). Every user-owned table has `user_id uuid not null references auth.users(id) on delete cascade`. RLS in §9.

```sql
-- 7.1 profiles ---------------------------------------------------------------
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  base_currency   char(3) not null default 'NGN',
  locale          text not null default 'en-NG',
  settings        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 7.2 currencies (reference; global read) -----------------------------------
create table currencies (
  code               char(3) primary key,
  name               text not null,
  symbol             text not null,
  minor_unit_digits  int  not null default 2,
  is_active          boolean not null default true
);

-- 7.3 exchange_rates --------------------------------------------------------
create table exchange_rates (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  rate_date      date not null,
  from_currency  char(3) not null,
  to_currency    char(3) not null,
  rate           numeric(20,8) not null check (rate > 0),
  source         text,
  created_at     timestamptz not null default now(),
  unique (user_id, rate_date, from_currency, to_currency)
);

-- 7.4 accounts (chart of accounts) ------------------------------------------
create table accounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  type         text not null check (type in ('asset','liability','income','expense','equity')),
  subtype      text,                       -- cash, bank, gold, real_estate, credit_card, salary, rent...
  currency     char(3) not null,
  parent_id    uuid references accounts(id) on delete set null,
  system_tag   text,                       -- opening_balance_equity, fx_translation_reserve,
                                           -- asset_revaluation_reserve, realized_fx, bad_debt,
                                           -- retained_earnings  (null for ordinary accounts)
  is_archived  boolean not null default false,
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, system_tag)             -- at most one of each system account per user
);
create index on accounts (user_id, type);

-- 7.5 journal_entries -------------------------------------------------------
create table journal_entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  entry_date         date not null,
  description        text,
  kind               text not null check (kind in (
                       'opening_balance','income','expense','transfer','fx_conversion',
                       'asset_purchase','asset_sale','asset_revaluation','fx_revaluation',
                       'loan_drawdown','loan_payment','receivable_issue','receivable_payment',
                       'receivable_writeoff','reversal','adjustment')),
  status             text not null default 'posted' check (status in ('draft','posted','void')),
  source             text not null default 'manual',  -- manual, recurring, system, valuation
  recurring_id       uuid references recurring_rules(id) on delete set null,
  reverses_entry_id  uuid references journal_entries(id),
  external_ref       text,
  metadata           jsonb not null default '{}',
  posted_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on journal_entries (user_id, entry_date);

-- 7.6 journal_lines ---------------------------------------------------------
create table journal_lines (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade, -- denormalized for RLS
  entry_id          uuid not null references journal_entries(id) on delete cascade,
  account_id        uuid not null references accounts(id),
  line_no           int not null default 1,
  amount_minor      bigint not null,        -- signed: + debit, - credit, in `currency`
  currency          char(3) not null,       -- must equal accounts.currency
  fx_rate           numeric(20,8) not null default 1,  -- line currency -> base, on entry_date
  base_amount_minor bigint not null,        -- signed, in base currency
  memo              text,
  cleared           boolean not null default false,
  reconciled_at     timestamptz,
  created_at        timestamptz not null default now()
);
create index on journal_lines (account_id);
create index on journal_lines (entry_id);

-- 7.7 assets ----------------------------------------------------------------
create table assets (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  account_id           uuid not null references accounts(id),  -- backing asset account
  name                 text not null,
  asset_class          text not null,   -- real_estate, land, gold, equities, vehicle, business, crypto, other
  purchase_date        date,
  purchase_price_minor bigint,
  purchase_currency    char(3),
  quantity             numeric,
  unit                 text,            -- grams, shares, hectares, units
  location             text,
  notes                text,
  metadata             jsonb not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 7.8 asset_valuations ------------------------------------------------------
create table asset_valuations (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  asset_id           uuid not null references assets(id) on delete cascade,
  as_of_date         date not null,
  value_minor        bigint not null,    -- total current value, in `currency`
  currency           char(3) not null,
  source             text not null default 'manual',  -- manual, api
  valuation_entry_id uuid references journal_entries(id),  -- the revaluation JE generated
  created_at         timestamptz not null default now(),
  unique (asset_id, as_of_date)
);

-- 7.9 liabilities -----------------------------------------------------------
create table liabilities (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  account_id               uuid not null references accounts(id),  -- backing liability account
  name                     text not null,
  type                     text not null,  -- loan, mortgage, credit_card, personal, other
  counterparty             text,
  original_principal_minor bigint,
  currency                 char(3) not null,
  interest_rate            numeric(7,4),   -- annual %
  rate_type                text,           -- fixed, variable
  term_months              int,
  scheduled_payment_minor  bigint,
  payment_day              int,            -- day of month
  start_date               date,
  maturity_date            date,
  notes                    text,
  metadata                 jsonb not null default '{}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- 7.10 contacts -------------------------------------------------------------
create table contacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  phone      text,
  email      text,
  notes      text,
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7.11 receivables (money owed TO the user) ---------------------------------
create table receivables (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  account_id      uuid not null references accounts(id),  -- backing receivable asset account
  contact_id      uuid references contacts(id) on delete set null,
  counterparty_name text,                 -- used when no contact_id
  principal_minor bigint not null,
  currency        char(3) not null,
  interest_rate   numeric(7,4) not null default 0,
  lent_date       date not null,
  due_date        date,                   -- nullable (open-ended)
  status          text not null default 'outstanding'
                    check (status in ('outstanding','partially_paid','settled','written_off')),
  notes           text,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on receivables (user_id, status, due_date);

-- 7.12 recurring_rules ------------------------------------------------------
create table recurring_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  template    jsonb not null,             -- entry + lines to clone (accounts, amounts, kind, description)
  frequency   text not null check (frequency in ('daily','weekly','monthly','yearly')),
  interval    int not null default 1,     -- every N periods
  day_of_month int,
  weekday     int,
  start_date  date not null,
  end_date    date,
  next_run    date not null,
  last_run    date,
  auto_post   boolean not null default true,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 7.13 goals ----------------------------------------------------------------
create table goals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  type              text not null check (type in ('savings','debt_payoff','net_worth','custom')),
  target_minor      bigint not null,
  currency          char(3) not null,
  target_date       date,
  linked_account_id uuid references accounts(id) on delete set null,
  baseline_minor    bigint not null default 0,
  status            text not null default 'active' check (status in ('active','achieved','abandoned')),
  notes             text,
  metadata          jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 7.14 net_worth_snapshots --------------------------------------------------
create table net_worth_snapshots (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  as_of_date       date not null,
  base_currency    char(3) not null,
  cash_minor       bigint not null,
  other_assets_minor bigint not null,     -- non-cash assets at market
  receivables_minor  bigint not null,
  liabilities_minor  bigint not null,
  net_worth_minor    bigint not null,
  breakdown        jsonb not null default '{}',  -- per-account / per-class detail
  rates            jsonb not null default '{}',  -- fx rates used (reproducibility)
  created_at       timestamptz not null default now(),
  unique (user_id, as_of_date)
);

-- 7.15 attachments (metadata only; bytes in Storage) ------------------------
create table attachments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,    -- asset, journal_entry, liability, receivable
  entity_id   uuid not null,
  storage_path text not null,   -- path within the private Storage bucket
  file_name   text not null,
  mime_type   text,
  size_bytes  bigint,
  uploaded_at timestamptz not null default now()
);
create index on attachments (user_id, entity_type, entity_id);

-- 7.16 notifications --------------------------------------------------------
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,    -- receivable_due, receivable_overdue, recurring_upcoming,
                                -- goal_off_track, low_balance, integrity_error
  title       text not null,
  body        text,
  entity_type text,
  entity_id   uuid,
  due_date    date,
  severity    text not null default 'info' check (severity in ('info','warning','critical')),
  status      text not null default 'unread' check (status in ('unread','read','dismissed')),
  dedupe_key  text not null,
  created_at  timestamptz not null default now()
);
create unique index on notifications (user_id, dedupe_key);

-- 7.17 reconciliations ------------------------------------------------------
create table reconciliations (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  account_id             uuid not null references accounts(id),
  statement_date         date not null,
  statement_balance_minor bigint not null,
  reconciled_balance_minor bigint,
  status                 text not null default 'in_progress' check (status in ('in_progress','completed')),
  completed_at           timestamptz,
  notes                  text,
  created_at             timestamptz not null default now()
);

-- 7.18 period_locks ---------------------------------------------------------
create table period_locks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  locked_at    timestamptz not null default now(),
  note         text
);

-- 7.19 audit_log (append-only change history) -------------------------------
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  table_name  text not null,
  record_id   uuid,
  action      text not null,   -- insert, update, void, reverse
  diff        jsonb,
  at          timestamptz not null default now()
);
```

> **Phasing note:** all tables may be created in the first migration (cheap; avoids money-touching migrations later). Phase 1 only *exercises* `profiles`, `accounts`, `journal_entries`, `journal_lines`, `net_worth_snapshots`. The rest activate in later slices (§15). Leave `cleared`, `reconciled_at`, and `exchange_rates` in from the start so reconciliation and FX never require a live-money migration.

---

## 8. Entry-kind taxonomy → leg patterns

The engine maps each user action to a `kind` and a fixed leg pattern. (`Dr` = positive `amount_minor`, `Cr` = negative.)

| kind | legs |
|---|---|
| `opening_balance` | Dr asset (or Cr liability) · Cr/Dr `opening_balance_equity` (base) |
| `income` | Dr cash/bank · Cr income account |
| `expense` (cash) | Dr expense · Cr cash/bank |
| `expense` (on card) | Dr expense · Cr credit-card liability |
| `transfer` (same ccy) | Dr destination · Cr source |
| `transfer` (card payment) | Dr card liability · Cr cash/bank |
| `fx_conversion` | Dr destination (base ccy) · Cr source (foreign, at carried base) · Cr/Dr `realized_fx` for the residue |
| `asset_purchase` | Dr asset account (cost) · Cr cash/bank/loan |
| `asset_sale` | Dr cash · Cr asset (carrying) · Cr/Dr realized gain-loss · release reserve |
| `asset_revaluation` | Dr/Cr asset · Cr/Dr `asset_revaluation_reserve` (equity) |
| `fx_revaluation` | Dr/Cr foreign account · Cr/Dr `fx_translation_reserve` (equity) |
| `loan_drawdown` | Dr cash · Cr loan liability |
| `loan_payment` | Dr loan liability (principal) · Dr interest expense · Cr cash |
| `receivable_issue` | Dr receivable asset · Cr cash/bank |
| `receivable_payment` | Dr cash/bank · Cr receivable asset |
| `receivable_writeoff` | Dr `bad_debt` expense · Cr receivable asset |
| `reversal` | mirror of the referenced entry |
| `adjustment` | arbitrary balanced legs (manual correction) |

---

## 9. Row-Level Security

Enable RLS on every user-owned table and apply the owner policy. Template (repeat per table; `currencies` is global-read):

```sql
alter table accounts enable row level security;

create policy accounts_select on accounts for select using (user_id = auth.uid());
create policy accounts_insert on accounts for insert with check (user_id = auth.uid());
create policy accounts_update on accounts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy accounts_delete on accounts for delete using (user_id = auth.uid());

-- profiles keyed on id:
alter table profiles enable row level security;
create policy profiles_rw on profiles for all using (id = auth.uid()) with check (id = auth.uid());

-- currencies: global read, no writes from client
alter table currencies enable row level security;
create policy currencies_read on currencies for select using (true);
```

`journal_lines` carries a denormalized `user_id` specifically so its RLS policy is a simple equality check without a join to `journal_entries`.

---

## 10. Triggers & integrity enforcement **[INVARIANT]**

### 10.1 `updated_at`
Standard `before update` trigger setting `updated_at = now()` on every table that has the column.

### 10.2 Line currency matches account currency
```sql
create function assert_line_currency() returns trigger as $$
begin
  if (select currency from accounts where id = new.account_id) <> new.currency then
    raise exception 'line currency % does not match account currency', new.currency;
  end if;
  return new;
end $$ language plpgsql;
create trigger trg_line_currency before insert or update on journal_lines
  for each row execute function assert_line_currency();
```

### 10.3 Balanced entry (deferred)
A **deferred constraint trigger** on `journal_lines` (and on `journal_entries` status change to `posted`) asserts that for the entry, `Σ base_amount_minor = 0`. Deferred so multi-line inserts within one transaction are validated at commit.
```sql
create function assert_entry_balanced() returns trigger as $$
declare s bigint; st text;
begin
  select status into st from journal_entries where id = coalesce(new.entry_id, old.entry_id);
  if st = 'posted' then
    select coalesce(sum(base_amount_minor),0) into s
      from journal_lines where entry_id = coalesce(new.entry_id, old.entry_id);
    if s <> 0 then
      raise exception 'entry % is unbalanced: base sum = %', coalesce(new.entry_id, old.entry_id), s;
    end if;
  end if;
  return null;
end $$ language plpgsql;
create constraint trigger trg_entry_balanced
  after insert or update or delete on journal_lines
  deferrable initially deferred
  for each row execute function assert_entry_balanced();
```

### 10.4 Append-only posted entries
```sql
create function block_posted_mutation() returns trigger as $$
begin
  if tg_op = 'DELETE' and old.status = 'posted' then
    raise exception 'cannot delete a posted entry; post a reversal instead';
  end if;
  if tg_op = 'UPDATE' and old.status = 'posted'
     and new.status not in ('posted','void') then
    raise exception 'cannot modify a posted entry; post a reversal instead';
  end if;
  return coalesce(new, old);
end $$ language plpgsql;
create trigger trg_block_posted before update or delete on journal_entries
  for each row execute function block_posted_mutation();
```
A parallel trigger blocks UPDATE/DELETE of lines whose parent entry is `posted`.

### 10.5 Period-lock enforcement
```sql
create function block_locked_period() returns trigger as $$
begin
  if exists (select 1 from period_locks
             where user_id = new.user_id
               and new.entry_date between period_start and period_end) then
    raise exception 'entry_date % falls in a locked period', new.entry_date;
  end if;
  return new;
end $$ language plpgsql;
create trigger trg_locked_period before insert or update on journal_entries
  for each row execute function block_locked_period();
```

### 10.6 Integrity check function (the heartbeat)
```sql
-- returns the base-currency sum of all posted lines; must be 0
create function fn_ledger_imbalance(p_user uuid) returns bigint as $$
  select coalesce(sum(l.base_amount_minor),0)
  from journal_lines l join journal_entries e on e.id = l.entry_id
  where l.user_id = p_user and e.status = 'posted';
$$ language sql stable;
```
The daily job (§12) calls this per user; non-zero → emit an `integrity_error` notification and refuse to publish a net-worth snapshot.

---

## 11. Balance & net-worth computation

### 11.1 Account balance (native)
```sql
create function fn_account_balance(p_account uuid, p_as_of date)
returns bigint as $$
  select coalesce(sum(l.amount_minor),0)
  from journal_lines l join journal_entries e on e.id = l.entry_id
  where l.account_id = p_account and e.status='posted' and e.entry_date <= p_as_of;
$$ language sql stable;
```
Present with a sign appropriate to the account's normal balance (asset/expense debit-normal; liability/income/equity credit-normal).

### 11.2 Net worth (base, on-demand)
For each asset and liability account, take the native balance at `p_as_of`, translate to base using the rate on (or most recent before) `p_as_of` from `exchange_rates`, then:
```
net_worth = Σ translate(asset_balances) − Σ translate(liability_balances)
```
Assert this equals total translated equity; if not, surface an integrity error.

### 11.3 Net-worth bridge (articulation) over [d0, d1]
```
bridge = Σ income − Σ expenses (incl. realized gains/losses)         -- net income
       + Δ asset_revaluation_reserve                                  -- unrealized asset
       + Δ fx_translation_reserve                                     -- unrealized FX
       + external capital events                                      -- gifts/inheritance/injections
```
Must equal `net_worth(d1) − net_worth(d0)` exactly (§4.4).

---

## 12. Scheduled jobs

A single **daily job** (Supabase scheduled function / `pg_cron`, mirrored by a GitHub Actions cron) does all of the following per user. Because it always writes rows, it also keeps the free project warm (§2.2).

1. **Materialize recurring** — for each active `recurring_rule` with `next_run <= today`, clone `template` into a posted (or draft, if `auto_post=false`) journal entry; advance `next_run`; set `last_run`. Cap iterations to avoid runaway (e.g. ≤ 60 periods of backfill). **Future occurrences are projected only (not posted)** for forecasting.
2. **Net-worth snapshot** — compute §11.2, write a `net_worth_snapshots` row with `rates` used. Skip (and alert) if `fn_ledger_imbalance <> 0`.
3. **Notifications** — scan receivables for `due soon` (e.g. ≤3 days) and `overdue`; upcoming recurring bills; goals off-track; low cash balance; integrity errors. Insert `notifications` rows using `dedupe_key` (e.g. `receivable:{id}:overdue`) to avoid daily repeats.
4. **Backup** — dump a logical export to object storage (free tier has no backups).

A **month-end job** additionally:
5. **FX revaluation** — for each foreign-currency monetary account, post an `fx_revaluation` entry to bring base carrying value to the closing rate (§6.4).
6. **Asset revaluation prompts** — create tasks/notifications inviting the user to update stale asset valuations; auto-post `asset_revaluation` entries for any new `asset_valuations` rows entered.

---

## 13. Frontend specification

### 13.1 Information architecture
Views: **Overview** (net worth hero + bridge + KPIs), **Cash Flow** (income/expense, categories, transactions), **Assets** (register + valuation history + appreciation), **Liabilities**, **Receivables** (owed to me; mark paid, partial, write-off), **Recurring**, **Goals**, **Reports**, **Settings** (currencies, rates, accounts, export/backup, period lock/reconcile). Mobile: bottom nav; desktop: left sidebar.

### 13.2 Design system — "private ledger" **[design intent]**
- **Palette:** deep forest + brass on cool paper. Ink `#16271E`, paper `#F3F4F0`, surface `#FFFFFF`, forest `#20503B`, brass `#B07D2B`, positive (gain) forest-green, negative (loss) clay `#A23C2B`. Must also work in dark mode.
- **Typography:** display (Space Grotesk or similar) for headings; body (Inter); **figures in tabular monospace** (IBM Plex Mono) so columns align like a statement.
- **The signature:** every monetary figure is a single shared `Money` component — monospaced, tabular, right-aligned, currency symbol in muted brass, deltas with directional treatment. The whole app reads as one coherent financial statement.

### 13.3 The `Money` component rules **[INVARIANT for UX]**
- Always show a native amount in **its own currency** (`$6,000`, never a naira value wearing a `$`).
- Where translation is shown, the base (₦) value is the **secondary** read, with the rate/date stamped.
- Color encodes meaning, not decoration: **red = money leaving / unrealized loss; green = unrealized appreciation / inflow; gray = a balance**.
- Round every displayed number; never leak float artifacts.

### 13.4 Signature metric — the net-worth bridge
A monthly waterfall implementing §11.3: opening balance → net income → unrealized FX → unrealized asset revaluation → capital events → closing balance. It answers "how much of my wealth change was me earning/spending vs. markets and the currency moving while I slept" — the single most useful metric most consumer apps omit, and especially valuable for a naira holder hedging in USD (the FX bar literally measures whether the hedge is working).

### 13.5 Reports surface
The same engine pointed at different windows: the bridge over a year; category breakdowns; asset-class allocation; savings-rate trend; recurring load; **FX contribution over time**; financial-health summary.

### 13.6 Quality floor
Responsive to mobile; visible keyboard focus; reduced-motion respected; empty states are invitations to act; errors say what happened and how to fix it, in the interface's voice.

---

## 14. Security, privacy, config

- `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (client). `SUPABASE_SERVICE_ROLE_KEY` only in the scheduled-job environment, never client/repo.
- Storage bucket for attachments is **private**; access via signed URLs scoped to the owner. Storage RLS mirrors table RLS (path prefixed by `user_id`).
- All access mediated by RLS; the client is never trusted.
- PII is minimal (contacts hold names/phones). No card numbers, no secrets stored in tables.

---

## 15. Build phases & acceptance criteria

**Phase 0 — Foundation**
Create the full schema (§7), RLS (§9), triggers (§10), seed `currencies`, the per-user system accounts (the equity accounts incl. `opening_balance_equity`, `fx_translation_reserve`, `asset_revaluation_reserve`, `realized_fx`, `bad_debt`, `retained_earnings`). Auth (signup/login) wired.
*Acceptance:* a user can sign up; system accounts exist; `fn_ledger_imbalance = 0`; RLS verified (a second user sees zero rows of the first).

**Phase 1 — Usable MVP**
Accounts UI, manual income/expense/transfer entries (engine writes balanced legs), opening-balance onboarding, Overview with correct net worth + bridge, daily snapshot job.
*Acceptance:* the Appendix-A January figures reproduce exactly; the bridge reconciles; posting into nothing breaks `Assets = Liabilities + Equity`.

**Phase 2 — Recurring + categorization + cash-flow dashboard**
Recurring rules + materializer, category reports, cash-flow view.
*Acceptance:* a monthly rule posts on schedule; category breakdown sums to total expenses.

**Phase 3 — Assets, liabilities, valuations**
Asset register + valuation history + `asset_revaluation` entries; liabilities with loan-payment principal/interest split; net-worth timeline from snapshots.
*Acceptance:* asset appreciation shows as unrealized (equity), not income; a loan payment reduces principal and expenses only interest.

**Phase 4 — Receivables + notifications**
Receivables register, mark-paid/partial/write-off, contacts, in-app notification feed, reminder pass in the daily job.
*Acceptance:* a partial repayment leaves the correct outstanding balance; a write-off appears as `bad_debt` expense; an overdue receivable raises exactly one (deduped) notification.

**Phase 5 — Multi-currency**
`exchange_rates` UI, `fx_conversion` entries (realized FX), month-end `fx_revaluation`, per-currency display, FX-impact metric.
*Acceptance:* the full Appendix-A run (Jan–Mar, NGN+USD) reproduces every closing figure and every bridge line.

**Phase 6 — Reports, goals, documents, reconciliation, period locking, web push.**

---

## 16. Testing strategy

- **Golden fixture:** Appendix A seeded and run end-to-end; assert each month's net worth, equity components, and bridge lines to the exact minor unit.
- **Property tests:** for any random set of balanced entries, `fn_ledger_imbalance = 0` and `Assets = Liabilities + Equity` at every date.
- **Invariant tests:** posted entries cannot be edited/deleted; postings into locked periods rejected; line currency must match account currency; unbalanced entry rejected at commit.
- **RLS tests:** user B can never read/write user A's rows.
- **FX tests:** realized FX on conversion equals proceeds − carried basis; period-end reserve delta equals native × Δrate.

---

## Appendix A — Golden worked example (Jan–Mar 2026, base ₦, with a USD account)

Rates: 1 Jan 1,500 · 31 Jan 1,550 · 18 Feb (bank) 1,640 · 28 Feb 1,650 · 31 Mar 1,600.

**Opening (1 Jan, 1,500):** Dr GTBank ₦2,000,000 · Dr USD Dom $5,000 (₦7,500,000) · Dr Cash ₦100,000 · Cr Opening Balance Equity ₦9,600,000. **Opening net worth ₦9,600,000.**

**January:** Salary ₦1,200,000→GTBank; Freelance $2,000 @1,500 (₦3,000,000)→USD Dom; Rent ₦800,000; Groceries/utilities ₦250,000; Lend Tunde ₦200,000 (receivable). Month-end FX revaluation: $7,000 × 1,550 = ₦10,850,000, +₦350,000 → FX reserve.
- Net income Jan = ₦3,150,000.
- 31 Jan net worth = **₦13,100,000** (GTBank 1,950,000 + Cash 100,000 + USD Dom 10,850,000 + Receivable 200,000).
- Tie-out: OBE 9,600,000 + retained 3,150,000 + FX reserve 350,000 = 13,100,000. ✓
- Bridge: ΔNW 3,500,000 = net income 3,150,000 + unrealized FX 350,000. ✓

**February:** Salary ₦1,200,000; Tunde repays ₦200,000 (asset→asset, not income); Buy gold ₦1,000,000 (cost); Convert $1,000 @ bank 1,640, carried 1,550 → Dr GTBank ₦1,640,000 · Cr USD Dom ₦1,550,000 · Cr Realized FX gain ₦90,000. Month-end FX revaluation: $6,000 × 1,650 = ₦9,900,000, +₦600,000 → reserve.
- Net income Feb = ₦1,290,000 (salary 1,200,000 + realized FX 90,000).
- 28 Feb net worth = **₦14,990,000** (GTBank 3,990,000 + Cash 100,000 + USD Dom 9,900,000 + Gold 1,000,000).
- Tie-out: OBE 9,600,000 + retained 4,440,000 + FX reserve 950,000 = 14,990,000. ✓
- Bridge: ΔNW 1,890,000 = net income 1,290,000 + unrealized FX 600,000. ✓

**March (a loss month):** Salary ₦1,200,000; Lend Bola ₦150,000; Rent ₦800,000; Groceries/utilities ₦300,000; Bola defaults → write off ₦150,000 to `bad_debt` expense. Month-end: USD $6,000 × 1,600 = ₦9,600,000, **−₦300,000** → reserve (unrealized loss); Gold revalued to ₦1,250,000, +₦250,000 → asset revaluation reserve.
- Net income Mar = −₦50,000 (income 1,200,000 − rent 800,000 − groceries 300,000 − bad debt 150,000).
- 31 Mar net worth = **₦14,890,000** (GTBank 3,940,000 + Cash 100,000 + USD Dom 9,600,000 + Gold 1,250,000).
- Tie-out: OBE 9,600,000 + retained 4,390,000 + FX reserve 650,000 + asset reserve 250,000 = 14,890,000. ✓
- Bridge: ΔNW −100,000 = net income −50,000 + unrealized FX −300,000 + unrealized gold +250,000. ✓

Every month ties three independent ways: the balance sheet, the equity roll-forward, and the articulation bridge. The implementation is correct iff it reproduces these to the minor unit.

---

## Appendix B — Reference enumerations

- **account.type:** asset, liability, income, expense, equity
- **system_tag:** opening_balance_equity, retained_earnings, fx_translation_reserve, asset_revaluation_reserve, realized_fx, bad_debt
- **journal_entries.kind:** see §8
- **receivables.status:** outstanding, partially_paid, settled, written_off
- **notifications.type:** receivable_due, receivable_overdue, recurring_upcoming, goal_off_track, low_balance, integrity_error
- **asset_class:** real_estate, land, gold, equities, vehicle, business, crypto, other

---

## Appendix C — Starter `CLAUDE.md` (repo root)

```md
# Kólò — build conventions (read before writing any code)

- Money is ALWAYS bigint minor units + a currency code. Never floats. See docs/SPEC.md §3.
- This is a double-entry ledger. Every economic event = a balanced journal entry
  (Σ base_amount_minor = 0). The UI hides debits/credits; the engine writes both legs. §4–5.
- Assets = Liabilities + Equity must hold at every date. If a change would break it, STOP. §4.2.
- Unrealized gains (asset & FX) go to EQUITY reserves, never income. Realized gains (on sale/
  conversion) go to income. §5.4, §6.
- Posted entries are append-only: correct via reversal, never edit/delete. §5.2.
- Record in the currency it happened in; translate to base only at report time; book the
  difference as FX. §6.
- Credit-card purchase = expense on swipe; paying the card = transfer, not expense. §5.3.
- Every owned table has user_id + RLS (user_id = auth.uid()). Service-role key never reaches
  the client. §9, §14.
- Build in the phase order of §15; don't advance a phase until §11 integrity checks pass and
  the Appendix-A fixture reproduces exactly.
```