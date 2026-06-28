-- 0004_seed_system_accounts.sql — currency reference + per-user bootstrap (§15 Phase 0).
-- Seeds the global currencies table, and wires a trigger so every new auth user
-- gets a profile plus the system accounts the ledger relies on.

-- Global currency reference (minor_unit_digits drives all rounding, §3) -------
insert into currencies (code, name, symbol, minor_unit_digits) values
  ('NGN', 'Nigerian Naira',          '₦',   2),
  ('USD', 'US Dollar',               '$',   2),
  ('EUR', 'Euro',                    '€',   2),
  ('GBP', 'Pound Sterling',          '£',   2),
  ('XOF', 'West African CFA Franc',  'CFA', 0),
  ('EGP', 'Egyptian Pound',          'E£',  2),
  ('JPY', 'Japanese Yen',            '¥',   0)
on conflict (code) do nothing;

-- New-user bootstrap ---------------------------------------------------------
-- Creates the profile and the per-user system accounts. Denominated in the
-- user's base currency (default NGN). SECURITY DEFINER so it runs despite RLS.
create function handle_new_user() returns trigger as $$
declare base char(3) := 'NGN';
begin
  insert into profiles (id, base_currency)
  values (new.id, base)
  on conflict (id) do nothing;

  -- (name, type, system_tag) for each required system account (Appendix B)
  insert into accounts (user_id, name, type, currency, system_tag) values
    (new.id, 'Opening Balance Equity',      'equity',  base, 'opening_balance_equity'),
    (new.id, 'Retained Earnings',           'equity',  base, 'retained_earnings'),
    (new.id, 'FX Translation Reserve',      'equity',  base, 'fx_translation_reserve'),
    (new.id, 'Asset Revaluation Reserve',   'equity',  base, 'asset_revaluation_reserve'),
    (new.id, 'Realized FX Gain/Loss',       'income',  base, 'realized_fx'),
    (new.id, 'Bad Debt',                    'expense', base, 'bad_debt')
  on conflict (user_id, system_tag) do nothing;

  return new;
end $$ language plpgsql security definer set search_path = public;

create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function handle_new_user();
