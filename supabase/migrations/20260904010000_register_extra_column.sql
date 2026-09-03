-- Register custom list columns in portal_settings and optionally seed records.attrs.
create or replace function register_record_extra_column(p_key text, p_default text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_cols jsonb;
  v_visible jsonb;
  v_exists boolean;
  v_default text := coalesce(p_default, '');
begin
  v_key := lower(trim(coalesce(p_key, '')));
  v_key := regexp_replace(v_key, '[^a-z0-9]+', '_', 'g');
  v_key := trim(both '_' from v_key);
  v_key := left(v_key, 40);

  if v_key is null or v_key = '' or v_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'Invalid column key. Use letters, numbers, and underscores.';
  end if;

  if v_key in (
    'pin', 'first_name', 'last_name', 'address1', 'address2', 'city', 'state', 'zip', 'zip4',
    'age', 'age_band', 'homeowner_status', 'known_phone', 'list_source', 'vertical', 'attrs',
    'record_id', 'name', 'phone', 'homeowner', 'ignore'
  ) then
    raise exception 'Column key is reserved for a built-in field';
  end if;

  insert into portal_settings (id) values (1)
  on conflict (id) do nothing;

  select coalesce(extra_columns, '[]'::jsonb), coalesce(visible_columns, '[]'::jsonb)
    into v_cols, v_visible
  from portal_settings
  where id = 1
  for update;

  select exists (
    select 1
    from jsonb_array_elements(v_cols) e
    where e->>'key' = v_key
  ) into v_exists;

  if not v_exists then
    v_cols := v_cols || jsonb_build_array(
      jsonb_build_object('key', v_key, 'default_value', v_default)
    );
  end if;

  if not (v_visible @> to_jsonb(array['attr:' || v_key])) then
    v_visible := v_visible || to_jsonb('attr:' || v_key::text);
  end if;

  update portal_settings
  set
    extra_columns = v_cols,
    visible_columns = v_visible,
    updated_at = now()
  where id = 1;

  -- Seed the key onto existing rows so it shows up in the database immediately.
  if v_default <> '' then
    update records
    set
      attrs = coalesce(attrs, '{}'::jsonb) || jsonb_build_object(v_key, v_default),
      updated_at = now()
    where coalesce(attrs ->> v_key, '') = '';
  else
    update records
    set
      attrs = case
        when attrs ? v_key then attrs
        else coalesce(attrs, '{}'::jsonb) || jsonb_build_object(v_key, '')
      end,
      updated_at = now()
    where not (coalesce(attrs, '{}'::jsonb) ? v_key);
  end if;

  return (select extra_columns from portal_settings where id = 1);
end;
$$;

revoke all on function register_record_extra_column(text, text) from public;
grant execute on function register_record_extra_column(text, text) to service_role;
grant execute on function register_record_extra_column(text, text) to authenticated;
