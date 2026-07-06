-- 0005_post_entry_and_overview.sql — Phase 1 engine surface.
-- post_entry: atomically insert a journal entry + its lines in ONE transaction,
-- so the deferred balance trigger (0003) validates Σ base_amount_minor = 0 at
-- commit. Runs as the caller (SECURITY INVOKER) so RLS + auth.uid() apply.

create or replace function post_entry(
  p_kind        text,
  p_entry_date  date,
  p_description text,
  p_lines       jsonb,        -- [{account_id, amount_minor, currency, fx_rate, base_amount_minor, memo, line_no}]
  p_source      text default 'manual'
) returns uuid as $$
declare
  v_user  uuid := auth.uid();
  v_entry uuid;
  v_line  jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if jsonb_array_length(p_lines) < 2 then
    raise exception 'an entry needs at least two lines';
  end if;

  insert into journal_entries (user_id, entry_date, description, kind, status, source, posted_at)
  values (v_user, p_entry_date, p_description, p_kind, 'posted', p_source, now())
  returning id into v_entry;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into journal_lines
      (user_id, entry_id, account_id, line_no, amount_minor, currency, fx_rate, base_amount_minor, memo)
    values (
      v_user,
      v_entry,
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
end $$ language plpgsql security invoker;

-- Base-currency balance of a set of account types (optionally one system_tag),
-- summed over posted lines on/before p_as_of. The building block for net worth
-- and the bridge. Σ base over (asset+liability) IS net worth, because the books
-- balance and liability credits carry a negative base (§4.2, §11).
create or replace function fn_base_balance(
  p_user       uuid,
  p_as_of      date,
  p_types      text[],
  p_system_tag text default null
) returns bigint as $$
  select coalesce(sum(l.base_amount_minor), 0)
  from journal_lines l
  join journal_entries e on e.id = l.entry_id
  join accounts a on a.id = l.account_id
  where l.user_id = p_user
    and e.status = 'posted'
    and e.entry_date <= p_as_of
    and a.type = any(p_types)
    and (p_system_tag is null or a.system_tag = p_system_tag);
$$ language sql stable;

create or replace function fn_net_worth(p_user uuid, p_as_of date)
returns bigint as $$
  select fn_base_balance(p_user, p_as_of, array['asset','liability']);
$$ language sql stable;

-- Overview payload: net worth + its components + the net-worth bridge over a
-- window (§11.2, §11.3, §13.4). The bridge reconciles by construction:
-- closing - opening = net_income + asset_reval + fx_reval + capital_events.
create or replace function fn_overview(p_user uuid, p_from date, p_to date)
returns jsonb as $$
declare
  v_open    bigint := fn_net_worth(p_user, p_from);
  v_close   bigint := fn_net_worth(p_user, p_to);
  v_cash    bigint;
  v_recv    bigint;
  v_assets  bigint;
  v_liab    bigint;
  -- bridge components = (balance at p_to) - (balance at p_from)
  v_income  bigint;
  v_expense bigint;
  v_areserve bigint;
  v_fxreserve bigint;
  v_capital  bigint;
begin
  v_assets := fn_base_balance(p_user, p_to, array['asset']);
  v_liab   := -fn_base_balance(p_user, p_to, array['liability']);  -- owed, positive

  select coalesce(sum(l.base_amount_minor),0) into v_cash
  from journal_lines l join journal_entries e on e.id=l.entry_id join accounts a on a.id=l.account_id
  where l.user_id=p_user and e.status='posted' and e.entry_date<=p_to
    and a.type='asset' and a.subtype in ('cash','bank','mobile_money');

  select coalesce(sum(l.base_amount_minor),0) into v_recv
  from journal_lines l join journal_entries e on e.id=l.entry_id join accounts a on a.id=l.account_id
  where l.user_id=p_user and e.status='posted' and e.entry_date<=p_to
    and a.type='asset' and a.subtype='receivable';

  -- income/expense balances (income credit-normal -> negate); net income = Δ
  v_income := -(fn_base_balance(p_user,p_to,array['income']) - fn_base_balance(p_user,p_from,array['income']));
  v_expense := fn_base_balance(p_user,p_to,array['expense']) - fn_base_balance(p_user,p_from,array['expense']);
  -- reserves & capital (credit-normal equity -> negate the delta)
  v_areserve := -(fn_base_balance(p_user,p_to,array['equity'],'asset_revaluation_reserve')
                  - fn_base_balance(p_user,p_from,array['equity'],'asset_revaluation_reserve'));
  v_fxreserve := -(fn_base_balance(p_user,p_to,array['equity'],'fx_translation_reserve')
                  - fn_base_balance(p_user,p_from,array['equity'],'fx_translation_reserve'));
  v_capital := -(fn_base_balance(p_user,p_to,array['equity'],'opening_balance_equity')
                  - fn_base_balance(p_user,p_from,array['equity'],'opening_balance_equity'));

  return jsonb_build_object(
    'net_worth', v_close,
    'cash', v_cash,
    'receivables', v_recv,
    'other_assets', v_assets - v_cash - v_recv,
    'liabilities', v_liab,
    'bridge', jsonb_build_object(
      'opening_net_worth', v_open,
      'net_income', v_income - v_expense,
      'asset_revaluation', v_areserve,
      'fx_revaluation', v_fxreserve,
      'capital_events', v_capital,
      'closing_net_worth', v_close
    )
  );
end $$ language plpgsql stable;
