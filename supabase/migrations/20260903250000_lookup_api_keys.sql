-- Multiple lookup API keys (Bearer tokens) for Ringba and other integrations.
create table if not exists lookup_api_keys (
  id bigint generated always as identity primary key,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists lookup_api_keys_active_hash_idx
  on lookup_api_keys (token_hash)
  where revoked_at is null;

alter table lookup_api_keys enable row level security;
