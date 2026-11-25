-- E10-10 (ADR-28 follow-up): free beds per facility, a bed manager for the facility admin,
-- and a referral block when a receiving facility is nearly full.
-- Rule (keep in step with apps/pwa/src/lib/referral/beds.ts):
--   * beds_total = 0 means the facility lists no beds (outpatient only): never blocked.
--   * a count updated in the last 24 hours with 2 or fewer free beds blocks new referrals.
--   * an older count never blocks; the app says "call first" instead, because an old number
--     must not stop a referral that may be needed (uncertainty moves toward refer).
-- The threshold is a demo default awaiting clinician sign-off (see ADR-28 open items).

alter table public.facilities
  add column beds_total integer not null default 0 check (beds_total between 0 and 5000),
  add column beds_free integer not null default 0 check (beds_free >= 0),
  add column beds_updated_at timestamptz,
  add constraint facilities_beds_free_le_total check (beds_free <= beds_total);

create function private.beds_block(f public.facilities) returns boolean language sql stable set search_path = '' as $$
  select f.beds_total > 0 and f.beds_free <= 2
     and f.beds_updated_at is not null and f.beds_updated_at > now() - interval '24 hours';
$$;

-- Directory now carries beds.
create or replace function private.list_referral_facilities() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and facility_id is not null and disabled_at is null) then
    raise exception 'An active facility assignment is required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'name', f.name, 'district', f.district, 'region', f.region,
      'lat', f.lat, 'lng', f.lng, 'phone', f.phone, 'opening_hours', f.opening_hours,
      'services', to_jsonb(f.services), 'services_confirmed_at', f.services_confirmed_at,
      'beds_total', f.beds_total, 'beds_free', f.beds_free, 'beds_updated_at', f.beds_updated_at
    ) order by f.name), '[]')
    into result
    from (select * from public.facilities where lat is not null order by name limit 2000) f;
  return result;
end;
$$;

create or replace function private.my_facility() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; f public.facilities;
begin
  select * into me from public.profiles where id = auth.uid() and disabled_at is null and role = 'admin' and facility_id is not null;
  if not found then raise exception 'Only a facility admin can edit its services' using errcode = '42501'; end if;
  select * into f from public.facilities where id = me.facility_id;
  return jsonb_build_object('id', f.id, 'name', f.name, 'phone', f.phone, 'services', to_jsonb(f.services),
                            'services_confirmed_at', f.services_confirmed_at, 'opening_hours', f.opening_hours,
                            'beds_total', f.beds_total, 'beds_free', f.beds_free, 'beds_updated_at', f.beds_updated_at);
end;
$$;

-- Bed manager: the facility's own admin (or a maintainer) sets total and free beds. Audited.
create function private.update_facility_beds(p_facility_id uuid, p_beds_total integer, p_beds_free integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.profiles; saved public.facilities;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select * into me from public.profiles where id = auth.uid() and disabled_at is null;
  if not found or not (me.role = 'maintainer' or (me.role = 'admin' and me.facility_id = p_facility_id)) then
    raise exception 'Only this facility''s admin can change its beds' using errcode = '42501';
  end if;
  if p_beds_total is null or p_beds_free is null then raise exception 'Beds required' using errcode = '22023'; end if;
  update public.facilities set beds_total = p_beds_total, beds_free = p_beds_free, beds_updated_at = now()
  where id = p_facility_id returning * into saved;
  if not found then raise exception 'Facility unavailable' using errcode = '42501'; end if;
  insert into public.audit_log(actor, action, entity, entity_id, meta)
  values (auth.uid(), 'update_beds', 'facilities', saved.id, jsonb_build_object('beds_total', saved.beds_total, 'beds_free', saved.beds_free));
  return jsonb_build_object('id', saved.id, 'beds_total', saved.beds_total, 'beds_free', saved.beds_free, 'beds_updated_at', saved.beds_updated_at);
exception when check_violation then
  raise exception 'Beds must be 0 to 5000 and free beds no more than total' using errcode = '22023';
end;
$$;

create function public.update_facility_beds(p_facility_id uuid, p_beds_total integer, p_beds_free integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.update_facility_beds(p_facility_id, p_beds_total, p_beds_free);
$$;

-- Server-side backstop for the app's block: a new referral to a nearly full facility fails.
-- Replays of an existing referral return before the insert, so they are not affected.
create function private.referral_beds_check() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.facilities f where f.id = new.to_facility and private.beds_block(f)) then
    raise exception 'This facility has too few free beds. Call them, or choose another facility.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger referrals_beds_check before insert on public.referrals
  for each row execute function private.referral_beds_check();

revoke all on function private.beds_block(public.facilities), private.update_facility_beds(uuid, integer, integer),
  private.referral_beds_check() from public, anon, authenticated;
grant execute on function private.update_facility_beds(uuid, integer, integer) to authenticated;
revoke all on function public.update_facility_beds(uuid, integer, integer) from public, anon;
grant execute on function public.update_facility_beds(uuid, integer, integer) to authenticated;
