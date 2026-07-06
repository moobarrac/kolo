-- 0010_goals_reports.sql — Phase 6 read models.

-- Goal progress (§7.13). The "current" figure is derived from the ledger by type:
--   net_worth  → current net worth
--   savings    → linked account balance (else baseline)
--   debt_payoff→ amount still owed on the linked liability (else baseline)
--   custom     → baseline (manual)
create or replace function fn_goals(p_user uuid, p_as_of date)
returns jsonb as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'type', g.type,
    'target_minor', g.target_minor,
    'baseline_minor', g.baseline_minor,
    'currency', g.currency,
    'target_date', g.target_date,
    'status', g.status,
    'current_minor', case g.type
      when 'net_worth'   then fn_net_worth(p_user, p_as_of)
      when 'savings'     then case when g.linked_account_id is not null then fn_account_balance(g.linked_account_id, p_as_of) else g.baseline_minor end
      when 'debt_payoff' then case when g.linked_account_id is not null then -fn_account_balance(g.linked_account_id, p_as_of) else g.baseline_minor end
      else g.baseline_minor
    end
  ) order by g.created_at), '[]'::jsonb)
  from goals g
  where g.user_id = p_user and g.status <> 'abandoned';
$$ language sql stable;

-- Asset-class allocation (§13.5): base value per asset class, for the donut/bars.
create or replace function fn_asset_allocation(p_user uuid, p_as_of date)
returns jsonb as $$
  with bal as (
    select coalesce(a.subtype, 'other') as class, sum(l.base_amount_minor) as total
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join accounts a on a.id = l.account_id
    where l.user_id = p_user and e.status = 'posted' and e.entry_date <= p_as_of
      and a.type = 'asset'
    group by coalesce(a.subtype, 'other')
  )
  select coalesce(jsonb_agg(jsonb_build_object('class', class, 'total', total) order by total desc)
                  filter (where total <> 0), '[]'::jsonb)
  from bal;
$$ language sql stable;
