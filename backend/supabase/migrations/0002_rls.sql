-- 0002_rls.sql — Row-Level Security (§9).
-- Isolation is enforced by Postgres RLS, not application code. Every user-owned
-- row carries user_id; the owner policy is `user_id = auth.uid()`.
-- journal_lines carries a denormalized user_id so its policy needs no join (§9).

-- profiles: keyed on id ------------------------------------------------------
alter table profiles enable row level security;
create policy profiles_rw on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

-- currencies: global read, no client writes ---------------------------------
alter table currencies enable row level security;
create policy currencies_read on currencies for select using (true);

-- owner policy for every user-owned table -----------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'exchange_rates','accounts','recurring_rules','journal_entries','journal_lines',
    'assets','asset_valuations','liabilities','contacts','receivables','goals',
    'net_worth_snapshots','attachments','notifications','reconciliations',
    'period_locks','audit_log'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('create policy %1$s_select on %1$I for select using (user_id = auth.uid());', t);
    execute format('create policy %1$s_insert on %1$I for insert with check (user_id = auth.uid());', t);
    execute format('create policy %1$s_update on %1$I for update using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
    execute format('create policy %1$s_delete on %1$I for delete using (user_id = auth.uid());', t);
  end loop;
end $$;
