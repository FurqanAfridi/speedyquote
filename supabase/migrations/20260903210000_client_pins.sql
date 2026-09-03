-- Allow client-supplied PINs (not generated / not Verhoeff-only).
alter table mail_pieces drop constraint if exists mail_pieces_pin_format;
alter table mail_pieces drop constraint if exists mail_pieces_pin_check_digit;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mail_pieces_pin_not_blank'
  ) then
    alter table mail_pieces
      add constraint mail_pieces_pin_not_blank check (length(trim(pin_code)) > 0);
  end if;
end $$;
