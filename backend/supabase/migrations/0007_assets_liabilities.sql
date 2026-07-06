-- 0007_assets_liabilities.sql — Phase 3 read models.
-- An asset/liability's CURRENT value is never stored on the row — it's the
-- backing account's ledger balance (kept current by revaluation entries, §5.4).
-- These functions join the registers to that live balance.

create or replace function fn_assets(p_user uuid, p_as_of date)
returns jsonb as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'account_id', a.account_id,
    'name', a.name,
    'asset_class', a.asset_class,
    'currency', a.purchase_currency,
    'quantity', a.quantity,
    'unit', a.unit,
    'location', a.location,
    'purchase_price_minor', a.purchase_price_minor,
    'current_value_minor', fn_account_balance(a.account_id, p_as_of)
  ) order by a.created_at), '[]'::jsonb)
  from assets a
  where a.user_id = p_user;
$$ language sql stable;

create or replace function fn_liabilities(p_user uuid, p_as_of date)
returns jsonb as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', li.id,
    'account_id', li.account_id,
    'name', li.name,
    'type', li.type,
    'counterparty', li.counterparty,
    'currency', li.currency,
    'interest_rate', li.interest_rate,
    'original_principal_minor', li.original_principal_minor,
    -- liability accounts are credit-normal; owed balance is the negative of the
    -- signed account balance.
    'balance_minor', -fn_account_balance(li.account_id, p_as_of)
  ) order by li.created_at), '[]'::jsonb)
  from liabilities li
  where li.user_id = p_user;
$$ language sql stable;
