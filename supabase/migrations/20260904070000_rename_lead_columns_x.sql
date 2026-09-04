-- Rename lead columns for display/API: addressState_X, addressZip_X, creative_X
-- Paste into Supabase SQL editor (idempotent).

-- Ensure new columns exist
alter table records add column if not exists "addressState_X" text;
alter table records add column if not exists "addressZip_X" text;
alter table records add column if not exists "creative_X" text;

-- Copy from previous names when present
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'records' and column_name = 'addressState'
  ) then
    execute $u$
      update records
      set "addressState_X" = coalesce(nullif(trim("addressState_X"), ''), nullif(trim("addressState"), ''))
      where coalesce(nullif(trim("addressState_X"), ''), '') = ''
    $u$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'records' and column_name = 'addressZip'
  ) then
    execute $u$
      update records
      set "addressZip_X" = coalesce(nullif(trim("addressZip_X"), ''), nullif(trim("addressZip"), ''))
      where coalesce(nullif(trim("addressZip_X"), ''), '') = ''
    $u$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'records' and column_name = 'creative'
  ) then
    execute $u$
      update records
      set "creative_X" = coalesce(nullif(trim("creative_X"), ''), nullif(trim(creative), ''))
      where coalesce(nullif(trim("creative_X"), ''), '') = ''
    $u$;
  end if;
end $$;

-- Drop old column names
alter table records drop column if exists "addressState";
alter table records drop column if exists "addressZip";
alter table records drop column if exists creative;

drop index if exists records_address_zip_idx;
create index if not exists records_address_zip_x_idx on records ("addressZip_X");

-- Remap portal visible_columns
update portal_settings
set
  visible_columns = coalesce((
    select jsonb_agg(to_jsonb(
      case v
        when 'addressState' then 'addressState_X'
        when 'addressZip' then 'addressZip_X'
        when 'creative' then 'creative_X'
        else v
      end
    ))
    from jsonb_array_elements_text(coalesce(visible_columns, '[]'::jsonb)) as t(v)
  ), '[]'::jsonb),
  updated_at = now()
where id = 1;
