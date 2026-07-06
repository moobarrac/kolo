-- 0008_receivables.sql — Phase 4 read model.
-- A receivable's OUTSTANDING amount is the backing asset account's balance
-- (debit-normal, positive), reduced by each repayment and zeroed by a write-off.
-- Never stored on the row — derived from the ledger.

create or replace function fn_receivables(p_user uuid, p_as_of date)
returns jsonb as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'account_id', r.account_id,
    'counterparty_name', coalesce(c.name, r.counterparty_name),
    'principal_minor', r.principal_minor,
    'currency', r.currency,
    'lent_date', r.lent_date,
    'due_date', r.due_date,
    'status', r.status,
    'outstanding_minor', fn_account_balance(r.account_id, p_as_of)
  ) order by r.created_at desc), '[]'::jsonb)
  from receivables r
  left join contacts c on c.id = r.contact_id
  where r.user_id = p_user;
$$ language sql stable;
