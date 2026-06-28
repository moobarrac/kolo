# Kólò — build conventions (read before writing any code)

The full spec is `docs/tech-doc.md`. Reference sections explicitly when implementing
(e.g. "implement §7.6 `journal_lines` exactly as specified"). Hard rules tagged
**[INVARIANT]** must never be violated — if a change would break one, STOP and flag it.

## Non-negotiables

- Money is ALWAYS `bigint` minor units + an ISO-4217 currency code. Never floats.
  Column suffix `_minor`. Rounding uses the currency's own `minor_unit_digits`. §3.
- This is a double-entry ledger. Every economic event = a balanced journal entry
  (`Σ base_amount_minor = 0`). The UI hides debits/credits; the engine writes both legs. §4–5, §8.
- `journal_lines.amount_minor` is signed: **+ = debit, − = credit**, in the line's own currency. §5.1.
- `Assets = Liabilities + Equity` must hold at every date. If a change would break it, STOP. §4.2.
- Unrealized gains (asset & FX) go to EQUITY reserves, never income. Realized gains
  (on sale/conversion) go to income. §5.4, §6.
- Posted entries are append-only: correct via reversal, never edit/delete. §5.2.
- Record in the currency it happened in; translate to base only at report time; book the
  difference as FX. §6.
- Credit-card purchase = expense on swipe; paying the card = transfer, not expense. §5.3.
- Loan payment splits: interest = expense, principal = retires liability. Never expense principal. §5.3.
- Getting paid back on a receivable is asset→asset, NOT income. Only interest is income. §5.3.

## Repository rules [INVARIANT §2.5]

- `shared/` is the single source of truth for the money type, the entry-kind→legs map (§8),
  and all domain types. Both `frontend/` and `backend/` import from it; neither redefines them.
- The **service-role key never leaves `backend/jobs/`**. `frontend/` only ever holds the anon key. §2.4.
- DB changes are made **only** via numbered migrations in `backend/supabase/migrations/` —
  never by editing the live schema by hand.

## Process

- Build in the phase order of §15; don't advance a phase until §11 integrity checks pass and
  the Appendix-A golden fixture reproduces exactly (to the minor unit).
- Every owned table has `user_id` + RLS (`user_id = auth.uid()`). The client is never trusted. §9, §14.
