-- 0012_reconciliation.sql — Phase 6 reconciliation (§7.17).
-- Reconciliation ticks posted lines off against a real bank statement. The
-- cleared/reconciled_at flags are operational metadata, NOT ledger economics, so
-- we relax the append-only line trigger to permit flag-only updates on posted
-- lines while still forbidding any change to the financial columns (and deletes).
-- The double-entry invariants are untouched: amounts, accounts, and legs stay frozen.

create or replace function block_posted_line_mutation() returns trigger as $$
declare st text;
begin
  select status into st from journal_entries where id = coalesce(old.entry_id, new.entry_id);
  if st <> 'posted' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'cannot delete lines of a posted entry; post a reversal instead';
  end if;
  -- UPDATE on a posted line: only cleared / reconciled_at may change.
  if new.entry_id          is distinct from old.entry_id
  or new.account_id        is distinct from old.account_id
  or new.line_no           is distinct from old.line_no
  or new.amount_minor      is distinct from old.amount_minor
  or new.currency          is distinct from old.currency
  or new.fx_rate           is distinct from old.fx_rate
  or new.base_amount_minor is distinct from old.base_amount_minor
  or new.memo              is distinct from old.memo
  or new.user_id           is distinct from old.user_id then
    raise exception 'cannot modify lines of a posted entry; post a reversal instead';
  end if;
  return new;
end $$ language plpgsql;

-- Reconcilable lines for one account up to a statement date. Signed native
-- amounts; the UI tots up the cleared ones against the statement balance. Runs as
-- the caller (SECURITY INVOKER), so RLS already scopes rows to the owner.
create or replace function fn_reconcile_lines(p_account uuid, p_as_of date)
returns jsonb as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'entry_date', e.entry_date,
    'description', e.description,
    'amount_minor', l.amount_minor,
    'cleared', l.cleared
  ) order by e.entry_date, l.created_at), '[]'::jsonb)
  from journal_lines l
  join journal_entries e on e.id = l.entry_id
  where l.account_id = p_account
    and e.status = 'posted'
    and e.entry_date <= p_as_of;
$$ language sql stable;

-- The subset still to tick off: uncleared lines only. Reconciling a long-lived
-- account, this is the short, actionable list (the UI defaults to it).
create or replace function fn_reconcile_open_lines(p_account uuid, p_as_of date)
returns jsonb as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'entry_date', e.entry_date,
    'description', e.description,
    'amount_minor', l.amount_minor,
    'cleared', l.cleared
  ) order by e.entry_date, l.created_at), '[]'::jsonb)
  from journal_lines l
  join journal_entries e on e.id = l.entry_id
  where l.account_id = p_account
    and e.status = 'posted'
    and e.entry_date <= p_as_of
    and not l.cleared;
$$ language sql stable;

-- Sum of the cleared lines — the reconciled balance the UI compares to the
-- statement. Kept server-side so it stays correct even when the list is filtered.
create or replace function fn_cleared_balance(p_account uuid, p_as_of date)
returns bigint as $$
  select coalesce(sum(l.amount_minor), 0)
  from journal_lines l
  join journal_entries e on e.id = l.entry_id
  where l.account_id = p_account
    and l.cleared
    and e.status = 'posted'
    and e.entry_date <= p_as_of;
$$ language sql stable;
