-- 0011_monthly_flow.sql — Phase 6 reports: income vs expense per month.
create or replace function fn_monthly_flow(p_user uuid, p_from date, p_to date)
returns jsonb as $$
  with lines as (
    select to_char(e.entry_date, 'YYYY-MM') as month, a.type, l.base_amount_minor
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join accounts a on a.id = l.account_id
    where l.user_id = p_user and e.status = 'posted'
      and e.entry_date between p_from and p_to
      and a.type in ('income','expense')
  ),
  by_month as (
    select month,
      coalesce(-sum(base_amount_minor) filter (where type = 'income'), 0) as income,
      coalesce(sum(base_amount_minor) filter (where type = 'expense'), 0) as expense
    from lines group by month
  )
  select coalesce(jsonb_agg(jsonb_build_object('month', month, 'income', income, 'expense', expense) order by month), '[]'::jsonb)
  from by_month;
$$ language sql stable;
