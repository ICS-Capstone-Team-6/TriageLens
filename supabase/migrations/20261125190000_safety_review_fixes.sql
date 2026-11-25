-- Safety review of the referral stack (25 Nov 2026; H14). Three changes:
--  1. Images expire also when a referral is never closed: unreadable and due for deletion
--     once the referral code expires (60 days after sending), as well as 60 days after
--     closing.
--  2. The receiving facility gets the zone and versions, not raw model outputs or
--     quality scores (TRD 7.3 keeps raw scores off routine screens).
--  3. Referral numbers hide counts from 1 to 4, and totals are summed on the server from
--     the real counts, so a small clinic's single TB result cannot be picked out.

create function private.image_expired(r public.referrals) returns boolean language sql stable set search_path = '' as $$
  select (r.status = 'closed' and r.updated_at < now() - interval '60 days')
      or (r.status <> 'closed' and r.expires_at < now());
$$;

create or replace function private.can_read_referral_image(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.referrals r
    join public.profiles p on p.id = auth.uid() and p.role in ('health_worker','reviewer') and p.disabled_at is null
    where r.id = private.referral_of_path(p_name)
      and p.facility_id in (r.from_facility, r.to_facility)
      and r.image_consent
      and not private.image_expired(r)
      and exists (select 1 from public.audit_log a
                  where a.actor = auth.uid() and a.action = 'image_access' and a.entity_id = r.id
                    and a.occurred_at > now() - interval '5 minutes'));
$$;

create or replace function private.open_referral_image(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare f uuid := private.receiver_facility(); r public.referrals; wk jsonb;
begin
  select * into r from public.referrals where id = p_id and f in (from_facility, to_facility);
  if not found or not r.image_shared or private.image_expired(r) then return null; end if;
  select wrapped_key into wk from public.referral_image_keys where referral_id = r.id and facility_id = f;
  if wk is null then return jsonb_build_object('wrapped_key', null); end if;
  insert into public.audit_log(actor, action, entity, entity_id) values (auth.uid(), 'image_access', 'referrals', r.id);
  return jsonb_build_object('wrapped_key', wk, 'heatmap', r.heatmap_shared);
end;
$$;

create or replace function public.referral_images_due_for_deletion() returns setof text language sql stable security definer set search_path = '' as $$
  select o.name from storage.objects o
  join public.referrals r on r.id = private.referral_of_path(o.name)
  where o.bucket_id = 'referral-images' and private.image_expired(r);
$$;

create or replace function private.referral_detail(r public.referrals) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'referral', to_jsonb(r) || jsonb_build_object(
      'from_name', (select name from public.facilities where id = r.from_facility),
      'from_phone', (select phone from public.facilities where id = r.from_facility),
      'to_name', (select name from public.facilities where id = r.to_facility),
      'to_phone', (select phone from public.facilities where id = r.to_facility)),
    'case', (select jsonb_build_object('age_band', c.age_band, 'sex', c.sex, 'symptoms', c.symptoms, 'created_at', c.created_at)
               from public.cases c where c.id = r.case_id),
    'inferences', coalesce((select jsonb_agg(jsonb_build_object(
        'model_name', i.model_name, 'model_version', i.model_version, 'thresholds_version', i.thresholds_version,
        'zone', i.zone, 'created_at', i.created_at)
        order by i.created_at) from public.inferences i where i.case_id = r.case_id and i.zone <> 'retake'), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'occurred_at', e.occurred_at)
        order by e.occurred_at, e.id) from public.referral_events e where e.referral_id = r.id), '[]'));
$$;

-- Counts from 1 to 4 become null ("fewer than 5"). Zero stays zero.
create function private.small(n numeric) returns integer language sql immutable set search_path = '' as $$
  select case when n between 1 and 4 then null else n::int end;
$$;

-- New shape: one object per facility with suppressed totals and suppressed weekly rows.
drop function public.referral_stats(integer);
drop function private.referral_stats(integer);
create function private.referral_stats(p_weeks integer) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; since timestamptz;
begin
  select * into me from public.profiles where id = auth.uid() and disabled_at is null and role in ('admin','maintainer');
  if not found then raise exception 'Only admins can see referral numbers' using errcode = '42501'; end if;
  if me.role = 'admin' and me.facility_id is null then raise exception 'An active facility assignment is required' using errcode = '42501'; end if;
  if p_weeks is null or p_weeks not between 1 and 52 then raise exception 'Weeks must be 1..52' using errcode = '22023'; end if;
  since := date_trunc('week', now()) - make_interval(weeks => p_weeks - 1);
  return coalesce((
    with fac as (select id, name from public.facilities where me.role = 'maintainer' or id = me.facility_id),
    weeks as (select generate_series(since, date_trunc('week', now()), interval '1 week') as week),
    ref as (
      select r.from_facility, r.to_facility, r.status, r.outcome, r.created_at, date_trunc('week', r.created_at) as week,
        exists (select 1 from public.referral_events e where e.referral_id = r.id and e.status = 'arrived') as arrived,
        exists (select 1 from public.referral_events e where e.referral_id = r.id and e.status = 'tested') as tested
      from public.referrals r where r.created_at >= since
    ),
    amb as (select a.to_facility, a.status, a.created_at, a.seen_at, date_trunc('week', a.created_at) as week
              from public.ambulance_requests a where a.created_at >= since),
    counts as (
      select f.id as facility_id, f.name as facility_name, w.week,
        (select count(*) from ref where from_facility = f.id and week = w.week) as sent,
        (select count(*) from ref where from_facility = f.id and week = w.week and arrived) as arrived,
        (select count(*) from ref where from_facility = f.id and week = w.week and tested) as tested,
        (select count(*) from ref where from_facility = f.id and week = w.week and outcome = 'confirmed') as confirmed,
        (select count(*) from ref where from_facility = f.id and week = w.week and not arrived
            and status in ('created','seen') and created_at < now() - interval '7 days') as not_arrived_7d,
        (select count(*) from ref where to_facility = f.id and week = w.week) as received,
        (select count(*) from amb where to_facility = f.id and week = w.week) as amb_requests,
        (select count(*) from amb where to_facility = f.id and week = w.week
            and seen_at is not null and seen_at - created_at <= interval '10 minutes') as amb_seen_10min,
        (select count(*) from amb where to_facility = f.id and week = w.week and status = 'dispatched') as amb_dispatched
      from fac f cross join weeks w
    )
    select jsonb_agg(x order by x->>'facility_name') from (
      select jsonb_build_object(
        'facility_id', facility_id, 'facility_name', facility_name,
        'totals', jsonb_build_object(
          'sent', private.small(sum(sent)), 'arrived', private.small(sum(arrived)), 'tested', private.small(sum(tested)),
          'confirmed', private.small(sum(confirmed)), 'not_arrived_7d', private.small(sum(not_arrived_7d)),
          'received', private.small(sum(received)), 'amb_requests', private.small(sum(amb_requests)),
          'amb_seen_10min', private.small(sum(amb_seen_10min)), 'amb_dispatched', private.small(sum(amb_dispatched))),
        'weeks', jsonb_agg(jsonb_build_object(
          'week', to_char(week, 'YYYY-MM-DD'), 'sent', private.small(sent), 'arrived', private.small(arrived),
          'received', private.small(received), 'amb_requests', private.small(amb_requests)) order by week desc)
      ) as x
      from counts group by facility_id, facility_name
    ) s
  ), '[]');
end;
$$;
create function public.referral_stats(p_weeks integer default 8) returns jsonb language sql security invoker set search_path = '' as $$ select private.referral_stats(p_weeks); $$;

revoke all on function private.image_expired(public.referrals), private.small(numeric), private.referral_stats(integer) from public, anon, authenticated;
grant execute on function private.image_expired(public.referrals), private.referral_stats(integer) to authenticated;
revoke all on function public.referral_stats(integer) from public, anon;
grant execute on function public.referral_stats(integer) to authenticated;
