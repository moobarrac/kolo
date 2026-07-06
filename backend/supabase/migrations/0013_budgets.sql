-- 0013_budgets.sql — monthly spending budgets (Phase 6+).
-- One cap per expense category, set in the base currency. "Spent" is derived from
-- the ledger (posted expense lines in the month), never stored, so it can't drift.

create table budgets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category_id  uuid not null references accounts(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  currency     char(3) not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, category_id)
);
create index on budgets (user_id);

alter table budgets enable row level security;
create policy budgets_select on budgets for select using (user_id = auth.uid());
create policy budgets_insert on budgets for insert with check (user_id = auth.uid());
create policy budgets_update on budgets for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy budgets_delete on budgets for delete using (user_id = auth.uid());

-- Budget status for the month containing p_month: cap vs. spent (base-currency
-- sum of posted lines on the category account within that calendar month). §13.5.
create or replace function fn_budget_status(p_user uuid, p_month date)
returns jsonb as $$
  with spent as (
    select l.account_id, sum(l.base_amount_minor) as total
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    where l.user_id = p_user and e.status = 'posted'
      and e.entry_date >= date_trunc('month', p_month)::date
      and e.entry_date <  (date_trunc('month', p_month) + interval '1 month')::date
    group by l.account_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'category_id', b.category_id,
    'name', a.name,
    'currency', b.currency,
    'amount_minor', b.amount_minor,
    'spent_minor', coalesce(s.total, 0)
  ) order by a.name), '[]'::jsonb)
  from budgets b
  join accounts a on a.id = b.category_id
  left join spent s on s.account_id = b.category_id;
$$ language sql stable;
