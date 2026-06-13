alter table public.shows
  add column if not exists show_code text;

alter table public.shows
  drop constraint if exists shows_show_code_format_check;

alter table public.shows
  add constraint shows_show_code_format_check
  check (show_code is null or show_code ~ '^[A-Z0-9]{4}$');

do $$
declare
  show_record record;
  candidate_code text;
begin
  for show_record in
    select id
    from public.shows
    where show_code is null
  loop
    loop
      candidate_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
      exit when not exists (
        select 1
        from public.shows
        where show_code = candidate_code
      );
    end loop;

    update public.shows
    set show_code = candidate_code
    where id = show_record.id;
  end loop;
end
$$;

create unique index if not exists shows_show_code_key
  on public.shows (show_code)
  where show_code is not null;

comment on column public.shows.show_code is
  'Four-character uppercase alphanumeric code used by technicians to join a show. QR codes will encode a technician join URL containing this show_code.';
