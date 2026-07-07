-- 0015_default_categories.sql — seed everyday income/expense categories for every
-- new user, so "Money in & out", Budgets, and Recurring work out of the box
-- instead of waiting for a manual "Add common categories" tap.
--
-- These lists mirror DEFAULT_EXPENSE_CATEGORIES / DEFAULT_INCOME_SOURCES in
-- shared/src/categories.ts — keep them in sync. They are ordinary accounts the
-- user can rename or delete freely (no system_tag).

-- Redefine the new-user bootstrap to also seed the default categories, in the
-- user's base currency. (The trigger from 0004 already points at this function.)
create or replace function handle_new_user() returns trigger as $$
declare base char(3) := 'NGN';
begin
  insert into profiles (id, base_currency)
  values (new.id, base)
  on conflict (id) do nothing;

  insert into accounts (user_id, name, type, currency, system_tag) values
    (new.id, 'Opening Balance Equity',      'equity',  base, 'opening_balance_equity'),
    (new.id, 'Retained Earnings',           'equity',  base, 'retained_earnings'),
    (new.id, 'FX Translation Reserve',      'equity',  base, 'fx_translation_reserve'),
    (new.id, 'Asset Revaluation Reserve',   'equity',  base, 'asset_revaluation_reserve'),
    (new.id, 'Realized FX Gain/Loss',       'income',  base, 'realized_fx'),
    (new.id, 'Bad Debt',                    'expense', base, 'bad_debt')
  on conflict (user_id, system_tag) do nothing;

  insert into accounts (user_id, name, type, currency)
  select new.id, c, 'expense', base from unnest(array[
    'Rent','Groceries','Utilities','Transport','Fuel','Eating out','Airtime & data',
    'Health','Education','Entertainment','Shopping','Personal care','Subscriptions',
    'Family & gifts','Savings','Insurance','Repairs & maintenance','Fees & charges',
    'Donations','Other']) as c;

  insert into accounts (user_id, name, type, currency)
  select new.id, c, 'income', base from unnest(array[
    'Salary','Business','Freelance','Investments','Rent received','Gifts','Other']) as c;

  return new;
end $$ language plpgsql security definer set search_path = public;

-- Backfill existing users who never set up categories (only their system
-- accounts exist). Leaves anyone who already added/customized categories alone.
do $$
declare p record;
begin
  for p in select id, base_currency from profiles loop
    if not exists (
      select 1 from accounts
      where user_id = p.id and type in ('income','expense') and system_tag is null
    ) then
      insert into accounts (user_id, name, type, currency)
      select p.id, c, 'expense', p.base_currency from unnest(array[
        'Rent','Groceries','Utilities','Transport','Fuel','Eating out','Airtime & data',
        'Health','Education','Entertainment','Shopping','Personal care','Subscriptions',
        'Family & gifts','Savings','Insurance','Repairs & maintenance','Fees & charges',
        'Donations','Other']) as c;

      insert into accounts (user_id, name, type, currency)
      select p.id, c, 'income', p.base_currency from unnest(array[
        'Salary','Business','Freelance','Investments','Rent received','Gifts','Other']) as c;
    end if;
  end loop;
end $$;
