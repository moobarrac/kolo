-- 0014_import.sql — CSV / bank-statement import support.
-- Like post_entry (0005) but stamps external_ref so re-importing the same row is a
-- no-op: if an entry with this user + external_ref already exists it returns null
-- and inserts nothing. Runs as the caller (SECURITY INVOKER) so RLS + auth.uid()
-- apply and the deferred balance trigger validates Σ base_amount_minor = 0.

create or replace function import_entry(
  p_kind         text,
  p_entry_date   date,
  p_description  text,
  p_lines        jsonb,
  p_external_ref text
) returns uuid as $$
declare
  v_user  uuid := auth.uid();
  v_entry uuid;
  v_line  jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if jsonb_array_length(p_lines) < 2 then raise exception 'an entry needs at least two lines'; end if;

  if exists (select 1 from journal_entries where user_id = v_user and external_ref = p_external_ref) then
    return null; -- already imported
  end if;

  insert into journal_entries (user_id, entry_date, description, kind, status, source, external_ref, posted_at)
  values (v_user, p_entry_date, p_description, p_kind, 'posted', 'import', p_external_ref, now())
  returning id into v_entry;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into journal_lines
      (user_id, entry_id, account_id, line_no, amount_minor, currency, fx_rate, base_amount_minor, memo)
    values (
      v_user, v_entry,
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
