-- Fix: migration 700 created unquoted creative_X → Postgres stored creative_x.
-- App/API expect quoted "creative_X". Paste into Supabase SQL editor.

do $$
begin
  if exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'records'
      and a.attname = 'creative_x'
      and not a.attisdropped
  ) and not exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'records'
      and a.attname = 'creative_X'
      and not a.attisdropped
  ) then
    alter table records rename column creative_x to "creative_X";
  end if;
end $$;

notify pgrst, 'reload schema';
