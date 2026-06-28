# Kólò

A personal, multi-user **financial operating system** — complete, *provable* visibility into
income, expenses, savings, investments, assets, liabilities, receivables, net worth, and goals,
across multiple currencies.

> The defining property is **provability**: every number traces back through a balanced
> double-entry ledger to its source, and the books tell you when they are wrong instead of
> displaying a wrong number.

See [`docs/tech-doc.md`](docs/tech-doc.md) for the full specification and
[`CLAUDE.md`](CLAUDE.md) for the non-negotiable build conventions.

## Layout

```
kolo/
├── frontend/   # Vite + React + TS + Tailwind PWA (anon key only)
├── backend/    # Supabase project (migrations, functions, seed) + scheduled jobs
├── shared/     # @kolo/shared — money type, domain types, entry-kind→legs map, zod schemas
└── docs/       # tech-doc.md — the build bible
```

`shared/` is the single source of truth both other packages import from (§2.5).

## Stack

- **Frontend:** Vite + React + TypeScript + Tailwind, installable PWA, TanStack Query, Recharts.
- **Backend:** Supabase — Postgres (the ledger), Auth, Storage, scheduled functions.

## Getting started

```bash
npm install              # installs all workspaces
cp .env.example .env     # fill in Supabase URL + anon key
npm run dev              # frontend dev server
```

Local database (requires the Supabase CLI + Docker):

```bash
npm run db:start         # start local Supabase
npm run db:reset         # apply migrations + seed from scratch
```

## Conventions (the short version)

- Money is `bigint` minor units + a currency code. Never floats.
- Every economic event is a balanced journal entry (`Σ base_amount_minor = 0`).
- `Assets = Liabilities + Equity` at every date.
- Posted entries are append-only — correct via reversal.
- The service-role key lives **only** in `backend/jobs/`.

Build follows the phase order in §15 of the spec.
