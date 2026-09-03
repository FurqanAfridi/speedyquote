-- ============================================================================
-- Postcard attribution platform — schema
--
-- Replaces the earlier migrations. Paste whole into the Supabase SQL editor.
-- It drops the previous objects first, which is destructive: run it only while
-- the tables are still empty.
--
-- SINGLE TENANT. There is no org_id, no orgs table and no membership table:
-- one operator uses this dashboard and they own the data. Multi-tenancy would
-- mean an extra column, index and RLS join on every table, paid for on every
-- query and never used. If a second tenant ever appears, add org_id and swap
-- the `using (true)` policies below for an org check — the policies are the
-- only thing that would change shape.
--
-- Conventions:
--   * Money is numeric(12,4). Never float — bids settle in fractions of a cent
--     and float error compounds across millions of rows.
--   * All timestamps are timestamptz.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Tear down anything from a previous run
-- ---------------------------------------------------------------------------

drop view if exists creative_performance, data_lift_comparison, geo_mismatch_rate,
  drop_response_curve, geo_demo_performance, buyer_performance, buyer_rejection_reasons,
  pin_diagnostics_daily, pin_reuse, lookup_latency_daily, overview_daily, mail_cost_daily cascade;

drop function if exists overview_kpis(date, date) cascade;
drop function if exists sync_piece_response_stats() cascade;
drop function if exists current_org_ids() cascade;

drop table if exists lookup_log, lookup_logs, bids, calls, mail_pieces, drops,
  creatives, campaigns, buyers, records, org_members, orgs cascade;

drop type if exists lookup_result, match_method, intent_tier, homeowner_status,
  campaign_status, call_disposition cascade;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

create type homeowner_status as enum ('owner', 'renter', 'unknown');

create type match_method as enum ('pin', 'ani', 'unmatched');

-- 'untested' is the default for a creative not yet dropped, so it is never
-- silently averaged in with proven stock.
create type intent_tier as enum ('high_intent', 'volume', 'untested');

create type call_disposition as enum (
  'connected', 'short_call', 'no_answer', 'voicemail', 'abandoned',
  'sold', 'not_interested', 'not_qualified', 'duplicate', 'dnc', 'unknown'
);

-- Not in your list, but campaigns.status needs a domain; an enum beats free text.
create type campaign_status as enum ('draft', 'active', 'paused', 'completed');

-- ---------------------------------------------------------------------------
-- 2. Shared helpers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Verhoeff check digit.
--
-- Chosen over Luhn because Luhn misses the 09 <-> 90 transposition. On a phone
-- keypad, transpositions and single-digit slips are the dominant error mode,
-- and a mistyped PIN that silently validated would attribute the call to the
-- wrong postcard and ship a buyer another person's attributes. Verhoeff catches
-- all single-digit errors and all adjacent transpositions.
create or replace function verhoeff_check_digit(p_payload text)
returns text
language plpgsql
immutable
as $$
declare
  d int[][] := array[
    [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
    [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
    [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
    [9,8,7,6,5,4,3,2,1,0]];
  p int[][] := array[
    [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
    [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
    [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  inv int[] := array[0,4,3,2,1,5,6,7,8,9];
  c int := 0;
  i int;
  digit int;
  len int := length(p_payload);
begin
  for i in 0..len - 1 loop
    digit := substr(p_payload, len - i, 1)::int;
    c := d[c + 1][p[((i + 1) % 8) + 1][digit + 1] + 1];
  end loop;
  return inv[c + 1]::text;
end;
$$;

create or replace function verhoeff_is_valid(p_full text)
returns boolean
language plpgsql
immutable
as $$
declare
  d int[][] := array[
    [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
    [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
    [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
    [9,8,7,6,5,4,3,2,1,0]];
  p int[][] := array[
    [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
    [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
    [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  c int := 0;
  i int;
  digit int;
  len int := length(p_full);
begin
  if p_full !~ '^[0-9]+$' then
    return false;
  end if;
  for i in 0..len - 1 loop
    digit := substr(p_full, len - i, 1)::int;
    c := d[c + 1][p[(i % 8) + 1][digit + 1] + 1];
  end loop;
  return c = 0;
end;
$$;

-- 10 digits: 9 random payload + 1 Verhoeff check digit, printed 3-3-4.
create or replace function generate_pin()
returns text
language plpgsql
volatile
as $$
declare
  payload text := lpad(floor(random() * 1000000000)::bigint::text, 9, '0');
begin
  return payload || verhoeff_check_digit(payload);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------------

-- records holds PII. It gets no authenticated read policy: the browser never
-- queries this table. List management runs server-side under service_role,
-- which bypasses RLS.
create table records (
  record_id          bigint generated always as identity primary key,
  first_name         text,
  last_name          text,
  address1           text not null,
  address2           text,
  city               text,
  state              char(2),
  zip                char(5),
  zip4               char(4),
  county             text,
  dma                text,
  timezone           text,
  dob                date,
  age                smallint check (age is null or age between 0 and 120),
  age_band           text,
  homeowner_status   homeowner_status not null default 'unknown',
  gender             text,
  marital_status     text,
  income_band        text,
  known_phone        text,
  list_source        text,
  list_purchase_date date,
  dnc_flag           boolean not null default false,
  deceased_flag      boolean not null default false,
  suppressed_flag    boolean not null default false,
  suppression_reason text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table campaigns (
  campaign_id uuid primary key default gen_random_uuid(),
  name        text not null,
  vertical    text not null default 'final_expense',
  start_date  date,
  end_date    date,
  target_cpa  numeric(12, 4) check (target_cpa is null or target_cpa >= 0),
  status      campaign_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint campaigns_date_order
    check (end_date is null or start_date is null or end_date >= start_date)
);

create table creatives (
  creative_id    uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references campaigns (campaign_id) on delete cascade,
  code           text not null,
  name           text not null,
  offer_angle    text,
  intent_tier    intent_tier not null default 'untested',
  cost_per_piece numeric(12, 4) not null default 0 check (cost_per_piece >= 0),
  art_url        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- The code is printed on the piece, so it must be unambiguous in its campaign.
  unique (campaign_id, code)
);

create table drops (
  drop_id       uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns (campaign_id) on delete cascade,
  creative_id   uuid not null references creatives (creative_id) on delete restrict,
  drop_date     date not null,
  in_home_start date,
  in_home_end   date,
  quantity      integer not null default 0 check (quantity >= 0),
  print_cost    numeric(12, 4) not null default 0 check (print_cost >= 0),
  postage_cost  numeric(12, 4) not null default 0 check (postage_cost >= 0),
  vendor        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint drops_in_home_order
    check (in_home_end is null or in_home_start is null or in_home_end >= in_home_start)
);

-- The attribution spine. One row per physical postcard.
create table mail_pieces (
  piece_id          bigint generated always as identity primary key,
  drop_id           uuid not null references drops (drop_id) on delete cascade,
  record_id         bigint not null references records (record_id) on delete restrict,
  creative_id       uuid not null references creatives (creative_id) on delete restrict,

  -- Unique per PIECE, not per person: one household receiving three creatives
  -- gets three PINs, which is the only way to know which postcard was called.
  --
  -- The CHECK guarantees a malformed or bad-check-digit PIN can never be
  -- stored, so validity is a schema property rather than an app convention.
  pin_code          text not null,

  mailed_date       date,
  allocated_cost    numeric(12, 4) not null default 0 check (allocated_cost >= 0),
  pin_used_count    integer not null default 0 check (pin_used_count >= 0),
  first_response_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint mail_pieces_pin_format check (pin_code ~ '^[0-9]{10}$'),
  constraint mail_pieces_pin_check_digit check (verhoeff_is_valid(pin_code))
);

create table buyers (
  buyer_id        uuid primary key default gen_random_uuid(),
  name            text not null,
  filters         jsonb not null default '{}'::jsonb,
  daily_cap       integer check (daily_cap is null or daily_cap >= 0),
  concurrency_cap integer check (concurrency_cap is null or concurrency_cap >= 0),
  hours           jsonb not null default '{}'::jsonb,
  payout_terms    text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table calls (
  -- Ringba's own id, so webhook replay is idempotent for free.
  call_id                   text primary key,
  piece_id                  bigint references mail_pieces (piece_id) on delete set null,
  record_id                 bigint references records (record_id) on delete set null,
  tracking_number           text,
  caller_ani                text,
  start_time                timestamptz not null,
  end_time                  timestamptz,
  duration_seconds          integer check (duration_seconds is null or duration_seconds >= 0),

  -- Text, not a FK: callers key in digits that match nothing, and that failure
  -- is exactly what PIN diagnostics reports on.
  pin_entered               text,
  pin_valid                 boolean not null default false,
  pin_attempts              smallint not null default 0 check (pin_attempts >= 0),
  match_method              match_method not null default 'unmatched',

  -- resolved_* is truth from our own database via the PIN.
  -- anid_*    is what caller-ID enrichment guessed.
  -- The gap between them is the headline data-lift report, not debug output.
  resolved_state            char(2),
  resolved_zip              char(5),
  resolved_age              smallint,
  resolved_homeowner_status homeowner_status,
  anid_state                char(2),
  anid_zip                  char(5),

  winning_buyer_id          uuid references buyers (buyer_id) on delete set null,
  accepted_bid              numeric(12, 4) check (accepted_bid is null or accepted_bid >= 0),
  payout                    numeric(12, 4) check (payout is null or payout >= 0),
  converted                 boolean not null default false,
  converted_at              timestamptz,
  duplicate_flag            boolean not null default false,
  disposition               call_disposition not null default 'unknown',
  recording_url             text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint calls_time_order check (end_time is null or end_time >= start_time)
);

create table bids (
  bid_id        bigint generated always as identity primary key,
  call_id       text not null references calls (call_id) on delete cascade,
  buyer_id      uuid not null references buyers (buyer_id) on delete restrict,
  bid_amount    numeric(12, 4) check (bid_amount is null or bid_amount >= 0),
  response_ms   integer check (response_ms is null or response_ms >= 0),
  accepted      boolean not null default false,
  reject_reason text,

  -- Immutable snapshot of exactly what we sent. This is the evidence when a
  -- buyer disputes data quality, so it is never recomputed from live records.
  params_sent   jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (call_id, buyer_id)
);

create table lookup_logs (
  request_id bigint generated always as identity primary key,
  timestamp  timestamptz not null default now(),
  pin        text,
  hit        boolean not null,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error      text,
  call_id    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------

-- The PIN lookup path. This runs inside the caller's ring time, so it is the
-- hottest query in the system. The INCLUDE list carries every column
-- pin_lookup() reads from this table, letting Postgres satisfy it from an
-- index-only scan without touching the heap.
create unique index mail_pieces_pin_code_key on mail_pieces (pin_code);
create index mail_pieces_pin_lookup_idx on mail_pieces (pin_code)
  include (piece_id, record_id, creative_id, drop_id, pin_used_count, first_response_at);

create index records_zip_idx on records (zip);
create index records_state_idx on records (state);
create index records_age_band_idx on records (age_band);
create index records_homeowner_status_idx on records (homeowner_status);
create index records_mailable_idx on records (record_id)
  where not dnc_flag and not deceased_flag and not suppressed_flag;

create index creatives_campaign_id_idx on creatives (campaign_id);
create index creatives_intent_tier_idx on creatives (intent_tier);

create index drops_campaign_id_idx on drops (campaign_id);
create index drops_creative_id_idx on drops (creative_id);
create index drops_in_home_start_idx on drops (in_home_start);

create index mail_pieces_drop_id_idx on mail_pieces (drop_id);
create index mail_pieces_record_id_idx on mail_pieces (record_id);
create index mail_pieces_creative_id_idx on mail_pieces (creative_id);
create index mail_pieces_reused_idx on mail_pieces (pin_used_count) where pin_used_count > 1;

create index calls_start_time_idx on calls (start_time desc);
create index calls_piece_id_idx on calls (piece_id);
create index calls_record_id_idx on calls (record_id);
create index calls_winning_buyer_id_idx on calls (winning_buyer_id);
create index calls_match_method_idx on calls (match_method);
create index calls_resolved_state_idx on calls (resolved_state);
create index calls_invalid_pin_idx on calls (start_time desc) where not pin_valid;

create index bids_call_id_idx on bids (call_id);
create index bids_buyer_id_idx on bids (buyer_id);
create index bids_won_idx on bids (buyer_id) where accepted;

create index lookup_logs_timestamp_idx on lookup_logs (timestamp desc);
create index lookup_logs_pin_idx on lookup_logs (pin);
create index lookup_logs_call_id_idx on lookup_logs (call_id);
create index lookup_logs_errors_idx on lookup_logs (timestamp desc) where error is not null;

-- ---------------------------------------------------------------------------
-- 5. updated_at triggers
-- ---------------------------------------------------------------------------

create trigger records_set_updated_at     before update on records     for each row execute function set_updated_at();
create trigger campaigns_set_updated_at   before update on campaigns   for each row execute function set_updated_at();
create trigger creatives_set_updated_at   before update on creatives   for each row execute function set_updated_at();
create trigger drops_set_updated_at       before update on drops       for each row execute function set_updated_at();
create trigger mail_pieces_set_updated_at before update on mail_pieces for each row execute function set_updated_at();
create trigger buyers_set_updated_at      before update on buyers      for each row execute function set_updated_at();
create trigger calls_set_updated_at       before update on calls       for each row execute function set_updated_at();
create trigger bids_set_updated_at        before update on bids        for each row execute function set_updated_at();
create trigger lookup_logs_set_updated_at before update on lookup_logs for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
--
-- The anon key ships to the browser, so RLS is the only barrier between a page
-- view and the whole mailing list.
--
-- Posture: a signed-in user READS everything except records. Nothing is
-- writable through the anon or authenticated role — ingestion, list upload and
-- PIN generation run server-side under service_role, which bypasses RLS. That
-- is the service_role path the lookup endpoint uses.
--
-- records is the deliberate exception with no policy at all, so PII stays
-- unreachable from the browser even for a signed-in user. To relax that later
-- it is one statement:
--   create policy "read records" on records for select to authenticated using (true);
-- ---------------------------------------------------------------------------

alter table records     enable row level security;
alter table campaigns   enable row level security;
alter table creatives   enable row level security;
alter table drops       enable row level security;
alter table mail_pieces enable row level security;
alter table buyers      enable row level security;
alter table calls       enable row level security;
alter table bids        enable row level security;
alter table lookup_logs enable row level security;

create policy "read campaigns"   on campaigns   for select to authenticated using (true);
create policy "read creatives"   on creatives   for select to authenticated using (true);
create policy "read drops"       on drops       for select to authenticated using (true);
create policy "read mail_pieces" on mail_pieces for select to authenticated using (true);
create policy "read buyers"      on buyers      for select to authenticated using (true);
create policy "read calls"       on calls       for select to authenticated using (true);
create policy "read bids"        on bids        for select to authenticated using (true);
create policy "read lookup_logs" on lookup_logs for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 7. Reporting views
--
-- REFRESH STRATEGY: plain views, not materialized.
--
-- Why: the Overview call feed and the PIN diagnostics alerts are only useful if
-- current, and a materialized view would need pg_cron plus staleness handling
-- to serve them. At these volumes the aggregates run in milliseconds off the
-- indexes above, so materializing would add operational surface for no gain.
--
-- When to revisit: around 10M calls, or when any view exceeds ~500ms.
-- Partitioning calls and lookup_logs by month is the cheaper first move and
-- should come before materializing anything. After that, materialize only the
-- historical rollups (creative_performance, geo_demo_performance,
-- drop_response_curve) on a few-minute pg_cron refresh and leave the live ones
-- (overview_daily, pin_diagnostics_daily) plain.
--
-- Views are security_invoker so the caller's RLS still applies; without it a
-- view executes as its owner and quietly becomes a hole around RLS. The one
-- exception is geo_demo_performance, explained at its definition.
--
-- Piece counts and call counts are aggregated in separate CTEs before joining,
-- because counting both across one join fans out: a piece that produced three
-- calls would be counted three times.
-- ---------------------------------------------------------------------------

create view creative_performance
with (security_invoker = true) as
with piece_stats as (
  select creative_id,
         count(*) as pieces_mailed,
         coalesce(sum(allocated_cost), 0) as mail_cost
  from mail_pieces
  group by creative_id
),
call_stats as (
  select mp.creative_id,
         count(*) as calls,
         avg(c.duration_seconds) as avg_duration,
         count(*) filter (where c.converted) as conversions,
         avg(c.accepted_bid) as avg_accepted_bid,
         coalesce(sum(c.payout), 0) as revenue
  from calls c
  join mail_pieces mp on mp.piece_id = c.piece_id
  group by mp.creative_id
)
select
  cr.creative_id, cr.campaign_id, cr.code, cr.name,
  cr.offer_angle, cr.intent_tier, cr.cost_per_piece,
  coalesce(ps.pieces_mailed, 0) as pieces_mailed,
  coalesce(ps.mail_cost, 0)     as mail_cost,
  coalesce(cs.calls, 0)         as calls,
  case when coalesce(ps.pieces_mailed, 0) > 0
       then coalesce(cs.calls, 0)::numeric / ps.pieces_mailed end as response_rate,
  cs.avg_duration,
  case when coalesce(cs.calls, 0) > 0
       then cs.conversions::numeric / cs.calls end as conversion_rate,
  cs.avg_accepted_bid,
  coalesce(cs.revenue, 0) as revenue,
  case when coalesce(cs.calls, 0) > 0
       then cs.revenue / cs.calls end as revenue_per_call,
  case when coalesce(ps.pieces_mailed, 0) > 0
       then (coalesce(cs.revenue, 0) - coalesce(ps.mail_cost, 0)) / ps.pieces_mailed * 1000
  end as profit_per_1000_mailed
from creatives cr
left join piece_stats ps on ps.creative_id = cr.creative_id
left join call_stats  cs on cs.creative_id = cr.creative_id;

create view data_lift_comparison
with (security_invoker = true) as
select
  match_method,
  count(*) as calls,
  avg(accepted_bid) as avg_accepted_bid,
  count(*) filter (where converted) as conversions,
  case when count(*) > 0
       then count(*) filter (where converted)::numeric / count(*) end as conversion_rate,
  coalesce(sum(payout), 0) as revenue,
  case when count(*) > 0
       then coalesce(sum(payout), 0) / count(*) end as revenue_per_call,
  avg(duration_seconds) as avg_duration
from calls
group by match_method;

-- Only calls carrying both readings are comparable, so the denominator excludes
-- nulls rather than counting a missing anid as agreement.
create view geo_mismatch_rate
with (security_invoker = true) as
select
  count(*) filter (where resolved_state is not null and anid_state is not null) as comparable_calls,
  count(*) filter (where resolved_state is not null and anid_state is not null
                     and resolved_state <> anid_state) as state_mismatches,
  count(*) filter (where resolved_zip is not null and anid_zip is not null
                     and resolved_zip <> anid_zip) as zip_mismatches,
  case when count(*) filter (where resolved_state is not null and anid_state is not null) > 0
       then count(*) filter (where resolved_state is not null and anid_state is not null
                               and resolved_state <> anid_state)::numeric
            / count(*) filter (where resolved_state is not null and anid_state is not null)
  end as state_mismatch_rate
from calls;

create view drop_response_curve
with (security_invoker = true) as
select
  d.drop_id, d.campaign_id, d.creative_id, d.in_home_start,
  (c.start_time at time zone 'UTC')::date - d.in_home_start as days_from_in_home,
  count(*) as calls,
  coalesce(sum(c.payout), 0) as revenue
from calls c
join mail_pieces mp on mp.piece_id = c.piece_id
join drops d        on d.drop_id   = mp.drop_id
where d.in_home_start is not null
group by d.drop_id, d.campaign_id, d.creative_id, d.in_home_start, 5;

-- SECURITY DEFINER by design, unlike every other view here.
--
-- It reads records, which the browser cannot query directly. It exposes only
-- non-PII aggregate dimensions (state, ZIP, age band, homeowner status), so it
-- grants no access to a name, street address or phone number.
create view geo_demo_performance as
select
  r.state, r.zip, r.age_band, r.homeowner_status,
  count(distinct mp.piece_id) as pieces_mailed,
  count(c.call_id) as calls,
  case when count(distinct mp.piece_id) > 0
       then count(c.call_id)::numeric / count(distinct mp.piece_id) end as response_rate,
  avg(c.accepted_bid) as avg_accepted_bid,
  coalesce(sum(c.payout), 0) as revenue,
  case when count(c.call_id) > 0
       then coalesce(sum(c.payout), 0) / count(c.call_id) end as revenue_per_call
from mail_pieces mp
join records r    on r.record_id = mp.record_id
left join calls c on c.piece_id  = mp.piece_id
group by r.state, r.zip, r.age_band, r.homeowner_status;

create view buyer_performance
with (security_invoker = true) as
select
  b.buyer_id, b.name, b.active,
  count(bd.bid_id) as bids,
  count(*) filter (where bd.accepted) as bids_won,
  case when count(bd.bid_id) > 0
       then count(*) filter (where bd.accepted)::numeric / count(bd.bid_id) end as win_rate,
  avg(bd.bid_amount) as avg_bid,
  avg(bd.bid_amount) filter (where bd.accepted) as avg_winning_bid,
  avg(bd.response_ms) as avg_response_ms,
  percentile_cont(0.95) within group (order by bd.response_ms) as p95_response_ms,
  count(*) filter (where not bd.accepted and bd.reject_reason is not null) as rejections
from buyers b
left join bids bd on bd.buyer_id = b.buyer_id
group by b.buyer_id, b.name, b.active;

create view buyer_rejection_reasons
with (security_invoker = true) as
select bd.buyer_id, b.name as buyer_name, bd.reject_reason, count(*) as rejections
from bids bd
join buyers b on b.buyer_id = bd.buyer_id
where bd.reject_reason is not null
group by bd.buyer_id, b.name, bd.reject_reason;

create view pin_diagnostics_daily
with (security_invoker = true) as
select
  (start_time at time zone 'UTC')::date as day,
  count(*) as calls,
  count(*) filter (where pin_entered is null) as no_pin_calls,
  count(*) filter (where pin_entered is not null and not pin_valid) as invalid_pin_calls,
  count(*) filter (where pin_valid) as valid_pin_calls,
  case when count(*) > 0
       then count(*) filter (where pin_valid)::numeric / count(*) end as pin_match_rate,
  avg(pin_attempts) filter (where pin_entered is not null) as avg_pin_attempts
from calls
group by 1;

create view pin_reuse
with (security_invoker = true) as
select mp.piece_id, mp.pin_code, mp.pin_used_count, mp.first_response_at,
       mp.drop_id, mp.creative_id, cr.code as creative_code
from mail_pieces mp
join creatives cr on cr.creative_id = mp.creative_id
where mp.pin_used_count > 1;

-- Lookup latency sits in front of the bid request, so p95 here is a revenue
-- number, not an infrastructure curiosity.
create view lookup_latency_daily
with (security_invoker = true) as
select
  (timestamp at time zone 'UTC')::date as day,
  count(*) as lookups,
  count(*) filter (where hit) as hits,
  count(*) filter (where not hit) as misses,
  count(*) filter (where error is not null) as errors,
  case when count(*) > 0
       then count(*) filter (where hit)::numeric / count(*) end as hit_rate,
  avg(latency_ms) as avg_latency_ms,
  percentile_cont(0.50) within group (order by latency_ms) as p50_latency_ms,
  percentile_cont(0.95) within group (order by latency_ms) as p95_latency_ms,
  percentile_cont(0.99) within group (order by latency_ms) as p99_latency_ms
from lookup_logs
group by 1;

create view overview_daily
with (security_invoker = true) as
select
  (start_time at time zone 'UTC')::date as day,
  count(*) as calls,
  count(*) filter (where pin_valid) as pin_matched_calls,
  count(*) filter (where converted) as conversions,
  avg(accepted_bid) as avg_accepted_bid,
  coalesce(sum(payout), 0) as revenue
from calls
group by 1;

create view mail_cost_daily
with (security_invoker = true) as
select mailed_date as day,
       count(*) as pieces_mailed,
       coalesce(sum(allocated_cost), 0) as mail_cost
from mail_pieces
where mailed_date is not null
group by mailed_date;

-- Mail cost accrues on the mailed date while revenue accrues on the call date,
-- and a drop keeps producing calls for weeks. Over a window narrower than a
-- full response curve those two legs describe different cohorts, so ROI is only
-- meaningful across a range wide enough to contain one.
create or replace function overview_kpis(p_from date, p_to date)
returns table (
  pieces_mailed    bigint,
  calls            bigint,
  pin_match_rate   numeric,
  avg_accepted_bid numeric,
  revenue          numeric,
  mail_cost        numeric,
  net_profit       numeric,
  roi              numeric
)
language sql
stable
security invoker
as $$
  with mail as (
    select count(*) as pieces_mailed, coalesce(sum(allocated_cost), 0) as mail_cost
    from mail_pieces
    where mailed_date between p_from and p_to
  ),
  call_side as (
    select count(*) as calls,
           count(*) filter (where pin_valid) as pin_matched,
           avg(accepted_bid) as avg_accepted_bid,
           coalesce(sum(payout), 0) as revenue
    from calls
    where (start_time at time zone 'UTC')::date between p_from and p_to
  )
  select mail.pieces_mailed, call_side.calls,
    case when call_side.calls > 0
         then call_side.pin_matched::numeric / call_side.calls end,
    call_side.avg_accepted_bid, call_side.revenue, mail.mail_cost,
    call_side.revenue - mail.mail_cost,
    case when mail.mail_cost > 0
         then (call_side.revenue - mail.mail_cost) / mail.mail_cost end
  from mail, call_side;
$$;

-- ---------------------------------------------------------------------------
-- 8. pin_lookup — the IVR path
--
-- NOTE ON VOLATILITY: your spec asked for STABLE, but Postgres forbids writes
-- inside a non-VOLATILE function ("UPDATE is not allowed in a non-volatile
-- function"), and this must increment pin_used_count and stamp
-- first_response_at. It is therefore VOLATILE. Nothing is lost — STABLE only
-- buys per-statement caching, irrelevant for a single-shot RPC.
--
-- SECURITY DEFINER so the endpoint reads records without the caller having any
-- access to that table.
--
-- Returns attributes only. first_name, last_name, address1, address2 and
-- known_phone are never selected, so no PII can reach an RTB payload.
--
-- A miss returns one row with match_method = 'unmatched' and null attributes,
-- so the bid proceeds with a documented fallback instead of erroring.
-- ---------------------------------------------------------------------------

create or replace function pin_lookup(p_pin text)
returns table (
  match_method     match_method,
  piece_id         bigint,
  record_id        bigint,
  campaign_id      uuid,
  drop_id          uuid,
  creative_id      uuid,
  creative_code    text,
  intent_tier      intent_tier,
  state            char(2),
  zip              char(5),
  age              smallint,
  age_band         text,
  homeowner_status homeowner_status,
  pin_used_count   integer
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_piece_id bigint;
begin
  -- Reject malformed input before touching the table: a bad check digit cannot
  -- match anything, so this saves the index probe on fat-fingered entries.
  if p_pin is null or p_pin !~ '^[0-9]{10}$' or not verhoeff_is_valid(p_pin) then
    return query select 'unmatched'::match_method, null::bigint, null::bigint,
      null::uuid, null::uuid, null::uuid, null::text, null::intent_tier,
      null::char(2), null::char(5), null::smallint, null::text,
      null::homeowner_status, null::integer;
    return;
  end if;

  update mail_pieces mp
  set pin_used_count    = mp.pin_used_count + 1,
      first_response_at = coalesce(mp.first_response_at, now())
  where mp.pin_code = p_pin
  returning mp.piece_id into v_piece_id;

  if v_piece_id is null then
    return query select 'unmatched'::match_method, null::bigint, null::bigint,
      null::uuid, null::uuid, null::uuid, null::text, null::intent_tier,
      null::char(2), null::char(5), null::smallint, null::text,
      null::homeowner_status, null::integer;
    return;
  end if;

  return query
  select
    'pin'::match_method,
    mp.piece_id,
    mp.record_id,
    d.campaign_id,
    mp.drop_id,
    mp.creative_id,
    cr.code,
    cr.intent_tier,
    r.state,
    r.zip,
    r.age,
    r.age_band,
    r.homeowner_status,
    mp.pin_used_count
  from mail_pieces mp
  join records r    on r.record_id   = mp.record_id
  join creatives cr on cr.creative_id = mp.creative_id
  join drops d      on d.drop_id      = mp.drop_id
  where mp.piece_id = v_piece_id;
end;
$$;

revoke all on function pin_lookup(text) from public, anon, authenticated;
grant execute on function pin_lookup(text) to service_role;
