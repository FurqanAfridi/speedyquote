-- Canonical lead fields (exact names): addressState, addressZip, creative, age, homeowner
-- Paste into Supabase SQL editor. Migrates data, then drops duplicate columns.

-- 1) Ensure the five columns exist (quoted names keep camelCase)
alter table records add column if not exists "addressState" text;
alter table records add column if not exists "addressZip" text;
alter table records add column if not exists creative text;
alter table records add column if not exists age smallint;
alter table records add column if not exists homeowner text;

-- 2) Copy values from older duplicate columns into the canonical ones
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'records' and column_name = 'address_state'
  ) then
    update records
    set "addressState" = coalesce(nullif(trim("addressState"), ''), nullif(trim(address_state), ''))
    where coalesce(nullif(trim("addressState"), ''), '') = '';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'records' and column_name = 'state'
  ) then
    update records
    set "addressState" = coalesce(nullif(trim("addressState"), ''), nullif(trim(state::text), ''))
    where coalesce(nullif(trim("addressState"), ''), '') = '';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'records' and column_name = 'address_zip'
  ) then
    update records
    set "addressZip" = coalesce(nullif(trim("addressZip"), ''), nullif(trim(address_zip), ''))
    where coalesce(nullif(trim("addressZip"), ''), '') = '';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'records' and column_name = 'zip'
  ) then
    update records
    set "addressZip" = coalesce(nullif(trim("addressZip"), ''), nullif(trim(zip::text), ''))
    where coalesce(nullif(trim("addressZip"), ''), '') = '';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'records' and column_name = 'homeowner_status'
  ) then
    update records
    set homeowner = coalesce(nullif(trim(homeowner), ''), nullif(trim(homeowner_status), ''))
    where coalesce(nullif(trim(homeowner), ''), '') = '';
  end if;
end $$;

-- 3) Drop duplicate / renamed columns
alter table records drop column if exists state;
alter table records drop column if exists zip;
alter table records drop column if exists zip4;
alter table records drop column if exists address_state;
alter table records drop column if exists address_zip;
alter table records drop column if exists homeowner_status;

drop index if exists records_homeowner_status_idx;
create index if not exists records_address_zip_idx on records ("addressZip");
create index if not exists records_homeowner_idx on records (homeowner);

-- 4) Clean portal visible_columns that still point at removed fields
update portal_settings
set
  visible_columns = coalesce((
    select jsonb_agg(to_jsonb(v))
    from jsonb_array_elements_text(coalesce(visible_columns, '[]'::jsonb)) as t(v)
    where v not in (
      'state', 'zip', 'zip4', 'address_state', 'address_zip', 'homeowner_status', 'homeowner'
    )
  ), '[]'::jsonb),
  updated_at = now()
where id = 1;

-- 5) Reserved keys for create-extra-column
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
    'pin', 'first_name', 'last_name', 'address1', 'address2', 'city',
    'addressstate', 'addresszip', 'address_state', 'address_zip', 'creative',
    'age', 'age_band', 'homeowner', 'known_phone', 'list_source', 'vertical', 'attrs',
    'record_id', 'name', 'phone', 'ignore', 'state', 'zip', 'zip4', 'homeowner_status'
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

  update portal_settings
  set
    extra_columns = v_cols,
    updated_at = now()
  where id = 1;

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
