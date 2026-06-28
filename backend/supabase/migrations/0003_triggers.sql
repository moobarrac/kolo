-- 0003_triggers.sql — triggers & integrity enforcement (§10). [INVARIANT]

-- 10.1 updated_at ------------------------------------------------------------
create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','accounts','recurring_rules','journal_entries',
    'assets','liabilities','contacts','receivables','goals'
  ]
  loop
    execute format(
      'create trigger trg_%1$s_updated_at before update on %1$I
         for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- 10.2 line currency matches account currency --------------------------------
create function assert_line_currency() returns trigger as $$
begin
  if (select currency from accounts where id = new.account_id) <> new.currency then
    raise exception 'line currency % does not match account currency', new.currency;
  end if;
  return new;
end $$ language plpgsql;
create trigger trg_line_currency before insert or update on journal_lines
  for each row execute function assert_line_currency();

-- 10.3 balanced entry (deferred): Σ base_amount_minor = 0 for posted entries --
create function assert_entry_balanced() returns trigger as $$
declare s bigint; st text;
begin
  select status into st from journal_entries where id = coalesce(new.entry_id, old.entry_id);
  if st = 'posted' then
    select coalesce(sum(base_amount_minor),0) into s
      from journal_lines where entry_id = coalesce(new.entry_id, old.entry_id);
    if s <> 0 then
      raise exception 'entry % is unbalanced: base sum = %', coalesce(new.entry_id, old.entry_id), s;
    end if;
  end if;
  return null;
end $$ language plpgsql;
create constraint trigger trg_entry_balanced
  after insert or update or delete on journal_lines
  deferrable initially deferred
  for each row execute function assert_entry_balanced();

-- 10.4 append-only posted entries --------------------------------------------
create function block_posted_mutation() returns trigger as $$
begin
  if tg_op = 'DELETE' and old.status = 'posted' then
    raise exception 'cannot delete a posted entry; post a reversal instead';
  end if;
  if tg_op = 'UPDATE' and old.status = 'posted'
     and new.status not in ('posted','void') then
    raise exception 'cannot modify a posted entry; post a reversal instead';
  end if;
  return coalesce(new, old);
end $$ language plpgsql;
create trigger trg_block_posted before update or delete on journal_entries
  for each row execute function block_posted_mutation();

-- parallel trigger: block UPDATE/DELETE of lines whose parent entry is posted
create function block_posted_line_mutation() returns trigger as $$
declare st text;
begin
  select status into st from journal_entries where id = coalesce(old.entry_id, new.entry_id);
  if st = 'posted' then
    raise exception 'cannot modify lines of a posted entry; post a reversal instead';
  end if;
  return coalesce(new, old);
end $$ language plpgsql;
create trigger trg_block_posted_lines before update or delete on journal_lines
  for each row execute function block_posted_line_mutation();

-- 10.5 period-lock enforcement -----------------------------------------------
create function block_locked_period() returns trigger as $$
begin
  if exists (select 1 from period_locks
             where user_id = new.user_id
               and new.entry_date between period_start and period_end) then
    raise exception 'entry_date % falls in a locked period', new.entry_date;
  end if;
  return new;
end $$ language plpgsql;
create trigger trg_locked_period before insert or update on journal_entries
  for each row execute function block_locked_period();

-- 10.6 integrity check (the heartbeat): base-currency sum of posted lines = 0 -
create function fn_ledger_imbalance(p_user uuid) returns bigint as $$
  select coalesce(sum(l.base_amount_minor),0)
  from journal_lines l join journal_entries e on e.id = l.entry_id
  where l.user_id = p_user and e.status = 'posted';
$$ language sql stable;

-- 11.1 account balance (native) ----------------------------------------------
create function fn_account_balance(p_account uuid, p_as_of date)
returns bigint as $$
  select coalesce(sum(l.amount_minor),0)
  from journal_lines l join journal_entries e on e.id = l.entry_id
  where l.account_id = p_account and e.status='posted' and e.entry_date <= p_as_of;
$$ language sql stable;
