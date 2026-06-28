-- 0001_schema.sql — full data model (§7).
-- All tables created up front (cheap; avoids money-touching migrations later, §7 phasing note).
-- Conventions: uuid PKs via gen_random_uuid(); timestamptz with created_at default now();
-- updated_at maintained by trigger (0003). Every user-owned table has user_id.
-- Money is ALWAYS bigint minor units + a currency code (§3). Quantities are numeric, separate.

create extension if not exists pgcrypto;

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
-- rate = units of to_currency per 1 unit of from_currency; amount_to = amount_from * rate (§6.5)
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
  subtype      text,
  currency     char(3) not null,
  parent_id    uuid references accounts(id) on delete set null,
  system_tag   text,    -- opening_balance_equity, fx_translation_reserve, asset_revaluation_reserve,
                        -- realized_fx, bad_debt, retained_earnings (null for ordinary accounts)
  is_archived  boolean not null default false,
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, system_tag)    -- at most one of each system account per user
);
create index on accounts (user_id, type);

-- 7.12 recurring_rules (created before journal_entries which references it) ---
create table recurring_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  template    jsonb not null,             -- entry + lines to clone
  frequency   text not null check (frequency in ('daily','weekly','monthly','yearly')),
  interval    int not null default 1,
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
-- amount_minor signed: + debit, - credit, in `currency` (§5.1). user_id denormalized for RLS.
create table journal_lines (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  entry_id          uuid not null references journal_entries(id) on delete cascade,
  account_id        uuid not null references accounts(id),
  line_no           int not null default 1,
  amount_minor      bigint not null,
  currency          char(3) not null,                  -- must equal accounts.currency
  fx_rate           numeric(20,8) not null default 1,  -- line currency -> base, on entry_date
  base_amount_minor bigint not null,                   -- signed, in base currency
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
  asset_class          text not null,
  purchase_date        date,
  purchase_price_minor bigint,
  purchase_currency    char(3),
  quantity             numeric,
  unit                 text,
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
  value_minor        bigint not null,
  currency           char(3) not null,
  source             text not null default 'manual',
  valuation_entry_id uuid references journal_entries(id),
  created_at         timestamptz not null default now(),
  unique (asset_id, as_of_date)
);

-- 7.9 liabilities -----------------------------------------------------------
create table liabilities (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  account_id               uuid not null references accounts(id),  -- backing liability account
  name                     text not null,
  type                     text not null,
  counterparty             text,
  original_principal_minor bigint,
  currency                 char(3) not null,
  interest_rate            numeric(7,4),
  rate_type                text,
  term_months              int,
  scheduled_payment_minor  bigint,
  payment_day              int,
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
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  account_id        uuid not null references accounts(id),  -- backing receivable asset account
  contact_id        uuid references contacts(id) on delete set null,
  counterparty_name text,
  principal_minor   bigint not null,
  currency          char(3) not null,
  interest_rate     numeric(7,4) not null default 0,
  lent_date         date not null,
  due_date          date,
  status            text not null default 'outstanding'
                      check (status in ('outstanding','partially_paid','settled','written_off')),
  notes             text,
  metadata          jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on receivables (user_id, status, due_date);

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
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  as_of_date         date not null,
  base_currency      char(3) not null,
  cash_minor         bigint not null,
  other_assets_minor bigint not null,
  receivables_minor  bigint not null,
  liabilities_minor  bigint not null,
  net_worth_minor    bigint not null,
  breakdown          jsonb not null default '{}',
  rates              jsonb not null default '{}',  -- fx rates used (reproducibility, §6.5)
  created_at         timestamptz not null default now(),
  unique (user_id, as_of_date)
);

-- 7.15 attachments (metadata only; bytes in Storage) ------------------------
create table attachments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  entity_type  text not null,
  entity_id    uuid not null,
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  uploaded_at  timestamptz not null default now()
);
create index on attachments (user_id, entity_type, entity_id);

-- 7.16 notifications --------------------------------------------------------
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,
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
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  account_id               uuid not null references accounts(id),
  statement_date           date not null,
  statement_balance_minor  bigint not null,
  reconciled_balance_minor bigint,
  status                   text not null default 'in_progress' check (status in ('in_progress','completed')),
  completed_at             timestamptz,
  notes                    text,
  created_at               timestamptz not null default now()
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
  action      text not null,
  diff        jsonb,
  at          timestamptz not null default now()
);
