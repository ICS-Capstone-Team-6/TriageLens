-- E10-09 (ADR-28 section 6, adds to E10-02): weekly referral numbers per facility.
-- Counts only: no codes, initials, case ids or any patient field leave this function.
-- A facility admin sees their own facility; a maintainer sees every facility.
--
-- Per facility and week of creation (Monday start, UTC = Ghana time):
--   as sender:   sent, arrived, tested, confirmed, not_arrived_7d (sent, no arrival, older than 7 days)
--   as receiver: received, amb_requests (ambulance requests received), amb_seen_10min
--                (seen within 10 minutes), amb_dispatched
-- "arrived" and "tested" count referrals whose history has that step, so a referral closed
-- after arrival still counts as arrived.

create function private.referral_stats(p_weeks integer) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; since timestamptz;
begin
  select * into me from public.profiles where id = auth.uid() and disabled_at is null and role in ('admin','maintainer');
  if not found then raise exception 'Only admins can see referral numbers' using errcode = '42501'; end if;
  if me.role = 'admin' and me.facility_id is null then raise exception 'An active facility assignment is required' using errcode = '42501'; end if;
  if p_weeks is null or p_weeks not between 1 and 52 then raise exception 'Weeks must be 1..52' using errcode = '22023'; end if;
  since := date_trunc('week', now()) - make_interval(weeks => p_weeks - 1);
  return coalesce((
    with fac as (
      select id, name from public.facilities where me.role = 'maintainer' or id = me.facility_id
    ),
    weeks as (
      select generate_series(since, date_trunc('week', now()), interval '1 week') as week
    ),
    ref as (
      select r.*, date_trunc('week', r.created_at) as week,
        exists (select 1 from public.referral_events e where e.referral_id = r.id and e.status = 'arrived') as arrived,
        exists (select 1 from public.referral_events e where e.referral_id = r.id and e.status = 'tested') as tested
      from public.referrals r where r.created_at >= since
    ),
    amb as (
      select a.*, date_trunc('week', a.created_at) as week from public.ambulance_requests a where a.created_at >= since
    ),
    grid as (
      select f.id as facility_id, f.name as facility_name, w.week from fac f cross join weeks w
    )
    select jsonb_agg(jsonb_build_object(
      'week', to_char(g.week, 'YYYY-MM-DD'),
      'facility_id', g.facility_id,
      'facility_name', g.facility_name,
      'sent', (select count(*) from ref where from_facility = g.facility_id and week = g.week),
      'arrived', (select count(*) from ref where from_facility = g.facility_id and week = g.week and arrived),
      'tested', (select count(*) from ref where from_facility = g.facility_id and week = g.week and tested),
      'confirmed', (select count(*) from ref where from_facility = g.facility_id and week = g.week and outcome = 'confirmed'),
      'not_arrived_7d', (select count(*) from ref where from_facility = g.facility_id and week = g.week and not arrived
                           and status in ('created','seen') and created_at < now() - interval '7 days'),
      'received', (select count(*) from ref where to_facility = g.facility_id and week = g.week),
      'amb_requests', (select count(*) from amb where to_facility = g.facility_id and week = g.week),
      'amb_seen_10min', (select count(*) from amb where to_facility = g.facility_id and week = g.week
                           and seen_at is not null and seen_at - created_at <= interval '10 minutes'),
      'amb_dispatched', (select count(*) from amb where to_facility = g.facility_id and week = g.week and status = 'dispatched')
    ) order by g.facility_name, g.week desc)
    from grid g
  ), '[]');
end;
$$;

-- The signed-in member's own role and facility, for showing admin pages.
create function private.my_role() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('role', role, 'facility_id', facility_id)
                     from public.profiles where id = auth.uid() and disabled_at is null), '{}');
$$;

-- The caller's facility row for the services editor (admin of that facility, or maintainer).
create function private.my_facility() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; f public.facilities;
begin
  select * into me from public.profiles where id = auth.uid() and disabled_at is null and role = 'admin' and facility_id is not null;
  if not found then raise exception 'Only a facility admin can edit its services' using errcode = '42501'; end if;
  select * into f from public.facilities where id = me.facility_id;
  return jsonb_build_object('id', f.id, 'name', f.name, 'phone', f.phone, 'services', to_jsonb(f.services),
                            'services_confirmed_at', f.services_confirmed_at, 'opening_hours', f.opening_hours);
end;
$$;

create function public.referral_stats(p_weeks integer default 8) returns jsonb language sql security invoker set search_path = '' as $$ select private.referral_stats(p_weeks); $$;
create function public.my_role() returns jsonb language sql security invoker set search_path = '' as $$ select private.my_role(); $$;
create function public.my_facility() returns jsonb language sql security invoker set search_path = '' as $$ select private.my_facility(); $$;

revoke all on function private.referral_stats(integer), private.my_role(), private.my_facility() from public, anon, authenticated;
grant execute on function private.referral_stats(integer), private.my_role(), private.my_facility() to authenticated;
revoke all on function public.referral_stats(integer), public.my_role(), public.my_facility() from public, anon;
grant execute on function public.referral_stats(integer), public.my_role(), public.my_facility() to authenticated;
