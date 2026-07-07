-- 0016_reverse_entry.sql — correcting mistakes without breaking the ledger.
-- Posted entries are append-only (§5.2), so "undo" = post a reversing entry: a
-- new entry (kind 'reversal') whose lines are the exact negation of the original,
-- dated the same day so it cancels the original at every as-of date. Balances
-- return to where they were; the audit trail is preserved. Runs as the caller
-- (SECURITY INVOKER) so RLS + the deferred balance trigger both apply.

create or replace function reverse_entry(p_entry uuid) returns uuid as $$
declare
  v_user uuid := auth.uid();
  v_orig journal_entries%rowtype;
  v_new  uuid;
  v_line journal_lines%rowtype;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_orig from journal_entries where id = p_entry and user_id = v_user;
  if not found then raise exception 'entry not found'; end if;
  if v_orig.status <> 'posted' then raise exception 'only posted entries can be reversed'; end if;
  if v_orig.kind = 'reversal' then raise exception 'cannot reverse a reversal'; end if;
  if exists (select 1 from journal_entries where reverses_entry_id = p_entry and user_id = v_user) then
    raise exception 'this entry has already been reversed';
  end if;

  insert into journal_entries (user_id, entry_date, description, kind, status, source, reverses_entry_id, posted_at)
  values (v_user, v_orig.entry_date, 'Reversal: ' || coalesce(v_orig.description, v_orig.kind),
          'reversal', 'posted', 'system', p_entry, now())
  returning id into v_new;

  for v_line in select * from journal_lines where entry_id = p_entry loop
    insert into journal_lines
      (user_id, entry_id, account_id, line_no, amount_minor, currency, fx_rate, base_amount_minor, memo)
    values
      (v_user, v_new, v_line.account_id, v_line.line_no,
       -v_line.amount_minor, v_line.currency, v_line.fx_rate, -v_line.base_amount_minor, v_line.memo);
  end loop;

  return v_new;
end $$ language plpgsql security invoker;
