-- Track each upload as a batch so a bad upload can be deleted as a unit.
create table if not exists upload_batches (
  batch_id bigint generated always as identity primary key,
  label text not null,
  file_name text,
  list_source text,
  vertical text,
  record_count integer not null default 0 check (record_count >= 0),
  created_at timestamptz not null default now()
);

alter table records
  add column if not exists batch_id bigint references upload_batches (batch_id) on delete set null;

create index if not exists records_batch_id_idx on records (batch_id);
create index if not exists upload_batches_created_at_idx on upload_batches (created_at desc);

alter table upload_batches enable row level security;
