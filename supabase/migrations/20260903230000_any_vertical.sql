-- Any vertical: extra columns live in attrs; address/homeowner/state are optional.
alter table records alter column address1 drop not null;

alter table records
  alter column state type text using trim(state::text);

alter table records
  alter column zip type text using trim(zip::text);

alter table records
  alter column homeowner_status drop default;

alter table records
  alter column homeowner_status type text using homeowner_status::text;

alter table records
  alter column homeowner_status drop not null;

drop type if exists homeowner_status cascade;

alter table records add column if not exists vertical text;
alter table records add column if not exists attrs jsonb not null default '{}'::jsonb;

create index if not exists records_vertical_idx on records (vertical);
create index if not exists records_attrs_gin on records using gin (attrs);
