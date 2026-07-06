-- 0006_recurring_and_cashflow.sql — Phase 2.
-- post_entry_system: the scheduled job posts entries on a user's behalf. It runs
-- as service-role (no auth.uid()), so it takes an explicit user_id and is
-- SECURITY DEFINER. Still atomic in one transaction → the deferred balance
-- trigger (0003) validates Σ base = 0 at commit, exactly like post_entry.

create or replace function post_entry_system(
  p_user        uuid,
  p_kind        text,
  p_entry_date  date,
  p_description text,
  p_lines       jsonb,
  p_source      text default 'recurring',
  p_recurring_id uuid default null,
  p_status      text default 'posted'
) returns uuid as $$
declare
  v_entry uuid;
  v_line  jsonb;
begin
  insert into journal_entries
    (user_id, entry_date, description, kind, status, source, recurring_id, posted_at)
  values (
    p_user, p_entry_date, p_description, p_kind, p_status, p_source, p_recurring_id,
    case when p_status = 'posted' then now() else null end
  )
  returning id into v_entry;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into journal_lines
      (user_id, entry_id, account_id, line_no, amount_minor, currency, fx_rate, base_amount_minor, memo)
    values (
      p_user, v_entry,
      (v_line->>'account_id')::uuid,
      coalesce((v_line->>'line_no')::int, 1),
      (v_line->>'amount_minor')::bigint,
      v_line->>'currency',
      (v_line->>'fx_rate')::numeric,
      (v_line->>'base_amount_minor')::bigint,
      v_line->>'memo'
    );
  end loop;

  return v_entry;
end $$ language plpgsql security definer set search_path = public;

-- Cash flow over a window (§13.1, §13.5): income & expense totals plus a
-- per-category breakdown. Each breakdown is keyed by the category account, so
-- the category amounts sum to the matching total (Phase 2 acceptance).
-- Income is credit-normal (negate base); expense is debit-normal (base as-is).
create or replace function fn_cash_flow(p_user uuid, p_from date, p_to date)
returns jsonb as $$
  with lines as (
    select a.id, a.name, a.type, a.currency, l.base_amount_minor
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join accounts a on a.id = l.account_id
    where l.user_id = p_user and e.status = 'posted'
      and e.entry_date between p_from and p_to
      and a.type in ('income','expense')
  ),
  cats as (
    select id, name, type,
           case when type = 'income' then -sum(base_amount_minor) else sum(base_amount_minor) end as total
    from lines group by id, name, type
  )
  select jsonb_build_object(
    'income_total',  coalesce((select sum(total) from cats where type='income'), 0),
    'expense_total', coalesce((select sum(total) from cats where type='expense'), 0),
    'income_categories',  coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'total',total) order by total desc)
                                     from cats where type='income' and total <> 0), '[]'::jsonb),
    'expense_categories', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'total',total) order by total desc)
                                     from cats where type='expense' and total <> 0), '[]'::jsonb)
  );
$$ language sql stable;
