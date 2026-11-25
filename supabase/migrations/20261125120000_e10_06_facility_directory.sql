-- E10-06 (ADR-28): facility directory for referral routing.
-- Facilities gain a location, phone, opening hours and a list of service tags.
-- The directory holds no patient data, so any active, assigned member may read it
-- through list_referral_facilities(). Only a facility's own admin (or a maintainer)
-- may change its services, and each change is audited and stamps services_confirmed_at
-- (hazard H16: stale service data).

alter table public.facilities
  add column lat double precision check (lat between -90 and 90),
  add column lng double precision check (lng between -180 and 180),
  add column phone text not null default '' check (length(phone) <= 32),
  add column opening_hours jsonb check (
    opening_hours is null or (jsonb_typeof(opening_hours) = 'object' and octet_length(opening_hours::text) <= 2048)
  ),
  add column services text[] not null default '{}' check (
    -- Keep in step with SERVICE_TAGS in apps/pwa/src/lib/referral/rules.ts.
    cardinality(services) <= 32 and services <@ array['tb_rapid_test','tb_treatment','chest_xray','oxygen',
      'inpatient','eye_clinic','retina_laser','retina_injection','ambulance']::text[]
  ),
  add column services_confirmed_at timestamptz,
  add constraint facilities_location_pair check ((lat is null) = (lng is null));

-- Any active member with a facility assignment may read the directory (no patient data).
create function private.list_referral_facilities() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and facility_id is not null and disabled_at is null) then
    raise exception 'An active facility assignment is required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'name', f.name, 'district', f.district, 'region', f.region,
      'lat', f.lat, 'lng', f.lng, 'phone', f.phone, 'opening_hours', f.opening_hours,
      'services', to_jsonb(f.services), 'services_confirmed_at', f.services_confirmed_at
    ) order by f.name), '[]')
    into result
    from (select * from public.facilities where lat is not null order by name limit 2000) f;
  return result;
end;
$$;

create function private.update_facility_services(p_facility_id uuid, p_services text[], p_phone text, p_opening_hours jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.profiles; saved public.facilities;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select * into me from public.profiles where id = auth.uid() and disabled_at is null;
  if not found or not (me.role = 'maintainer' or (me.role = 'admin' and me.facility_id = p_facility_id)) then
    raise exception 'Only this facility''s admin can change its services' using errcode = '42501';
  end if;
  if p_services is null then raise exception 'Services required' using errcode = '22023'; end if;
  update public.facilities set
    services = (select coalesce(array_agg(distinct s order by s), '{}') from unnest(p_services) s),
    phone = coalesce(p_phone, phone),
    opening_hours = coalesce(p_opening_hours, opening_hours),
    services_confirmed_at = now()
  where id = p_facility_id returning * into saved;
  -- An unknown tag fails the table check (check_violation) and is reported as bad input.
  if not found then raise exception 'Facility unavailable' using errcode = '42501'; end if;
  insert into public.audit_log(actor, action, entity, entity_id, meta)
  values (auth.uid(), 'update_services', 'facilities', saved.id, jsonb_build_object('services', to_jsonb(saved.services)));
  return to_jsonb(saved);
exception when check_violation then
  raise exception 'Unknown service tag or bad value' using errcode = '22023';
end;
$$;

create function public.list_referral_facilities() returns jsonb language sql security invoker set search_path = '' as $$
  select private.list_referral_facilities();
$$;
create function public.update_facility_services(p_facility_id uuid, p_services text[], p_phone text default null, p_opening_hours jsonb default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.update_facility_services(p_facility_id, p_services, p_phone, p_opening_hours);
$$;

revoke all on function private.list_referral_facilities(),
  private.update_facility_services(uuid, text[], text, jsonb) from public, anon, authenticated;
grant execute on function private.list_referral_facilities(),
  private.update_facility_services(uuid, text[], text, jsonb) to authenticated;
revoke all on function public.list_referral_facilities(),
  public.update_facility_services(uuid, text[], text, jsonb) from public, anon;
grant execute on function public.list_referral_facilities(),
  public.update_facility_services(uuid, text[], text, jsonb) to authenticated;
