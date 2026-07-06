-- 0009_base_balance.sql — Phase 5.
-- fn_account_base_balance: the carried BASE value of an account (sum of
-- base_amount_minor). Together with fn_account_balance (native), this gives the
-- account's carried rate, which the FX conversion and month-end revaluation
-- (§6.4) need to value disposed units and compute the closing delta.

create or replace function fn_account_base_balance(p_account uuid, p_as_of date)
returns bigint as $$
  select coalesce(sum(l.base_amount_minor), 0)
  from journal_lines l join journal_entries e on e.id = l.entry_id
  where l.account_id = p_account and e.status = 'posted' and e.entry_date <= p_as_of;
$$ language sql stable;
