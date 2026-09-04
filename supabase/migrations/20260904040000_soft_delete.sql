-- Soft delete: keep rows forever; hide from portal/lookups when deleted_at is set.
alter table records
  add column if not exists deleted_at timestamptz;

create index if not exists records_active_idx
  on records (record_id)
  where deleted_at is null;

create index if not exists records_deleted_at_idx
  on records (deleted_at)
  where deleted_at is not null;

alter table mail_pieces
  add column if not exists deleted_at timestamptz;

create index if not exists mail_pieces_active_idx
  on mail_pieces (record_id)
  where deleted_at is null;

-- Allow the same PIN again after soft-delete: unique only among active pieces.
alter table mail_pieces drop constraint if exists mail_pieces_pin_code_key;
drop index if exists mail_pieces_pin_code_key;
drop index if exists mail_pieces_pin_code_uidx;

create unique index if not exists mail_pieces_pin_code_active_uidx
  on mail_pieces (pin_code)
  where deleted_at is null;

alter table upload_batches
  add column if not exists deleted_at timestamptz;

create index if not exists upload_batches_active_idx
  on upload_batches (created_at desc)
  where deleted_at is null;
