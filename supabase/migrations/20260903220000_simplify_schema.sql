-- Keep: records, mail_pieces, lookup_logs
-- Remove: campaigns, creatives, drops, buyers, calls, bids, all reporting views

drop view if exists
  creative_performance,
  data_lift_comparison,
  geo_mismatch_rate,
  drop_response_curve,
  geo_demo_performance,
  buyer_performance,
  buyer_rejection_reasons,
  pin_diagnostics_daily,
  pin_reuse,
  lookup_latency_daily,
  overview_daily,
  mail_cost_daily
cascade;

drop function if exists overview_kpis(date, date) cascade;
drop function if exists pin_lookup(text) cascade;
drop function if exists assign_mail_pieces(uuid, uuid, bigint[], date, numeric) cascade;
drop function if exists generate_pin() cascade;
drop function if exists verhoeff_check_digit(text) cascade;
drop function if exists verhoeff_is_valid(text) cascade;

drop table if exists bids cascade;
drop table if exists calls cascade;
drop table if exists buyers cascade;

drop index if exists mail_pieces_pin_lookup_idx;
drop index if exists mail_pieces_drop_id_idx;
drop index if exists mail_pieces_creative_id_idx;
drop index if exists mail_pieces_reused_idx;

alter table mail_pieces drop constraint if exists mail_pieces_pin_format;
alter table mail_pieces drop constraint if exists mail_pieces_pin_check_digit;

alter table mail_pieces drop column if exists drop_id;
alter table mail_pieces drop column if exists creative_id;
alter table mail_pieces drop column if exists allocated_cost;
alter table mail_pieces drop column if exists pin_used_count;
alter table mail_pieces drop column if exists first_response_at;
alter table mail_pieces drop column if exists mailed_date;

drop table if exists drops cascade;
drop table if exists creatives cascade;
drop table if exists campaigns cascade;

drop type if exists match_method cascade;
drop type if exists intent_tier cascade;
drop type if exists campaign_status cascade;
drop type if exists call_disposition cascade;

create index if not exists records_known_phone_idx on records (known_phone);
create index if not exists mail_pieces_record_id_idx on mail_pieces (record_id);
