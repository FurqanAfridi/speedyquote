-- Portal settings: verticals, extra columns, visible table columns, org basics.
create table if not exists portal_settings (
  id int primary key default 1 check (id = 1),
  org_name text not null default 'Speedy Quote',
  default_list_source text not null default 'Upload',
  verticals jsonb not null default '[]'::jsonb,
  extra_columns jsonb not null default '[]'::jsonb,
  visible_columns jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into portal_settings (id)
values (1)
on conflict (id) do nothing;

alter table portal_settings enable row level security;
