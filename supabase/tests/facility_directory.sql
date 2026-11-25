-- E10-06 (ADR-28) facility directory checks. Fake users and facilities only; all writes roll back.
-- Run with: bash supabase/test-local.sh
begin;
set local plpgsql.check_asserts = on;
do $$
declare
  fa uuid := gen_random_uuid(); fb uuid := gen_random_uuid(); fnoloc uuid := gen_random_uuid();
  wa uuid := gen_random_uuid(); admin_a uuid := gen_random_uuid(); admin_b uuid := gen_random_uuid();
  maint uuid := gen_random_uuid(); pending uuid := gen_random_uuid(); off uuid := gen_random_uuid();
  uid uuid; got jsonb; n integer := 0;
begin
  insert into public.facilities(id,name,lat,lng,services,services_confirmed_at) values
    (fa,'FAKE directory test A '||fa,5.60,-0.20,'{tb_rapid_test}',now()-interval '200 days'),
    (fb,'FAKE directory test B '||fb,6.70,-1.60,'{eye_clinic}',now());
  insert into public.facilities(id,name) values (fnoloc,'FAKE directory test no location '||fnoloc);
  foreach uid in array array[wa, admin_a, admin_b, maint, pending, off] loop
    insert into auth.users(id,email) values (uid, 'fake-'||uid||'@example.invalid');
  end loop;
  update public.profiles set facility_id=fa where id=wa;
  update public.profiles set facility_id=fa, role='admin' where id=admin_a;
  update public.profiles set facility_id=fb, role='admin' where id=admin_b;
  update public.profiles set role='maintainer' where id=maint;
  update public.profiles set facility_id=fa, disabled_at=now() where id=off;

  -- Table checks.
  begin update public.facilities set services='{mri}' where id=fa; raise exception 'Unknown service tag unexpectedly allowed'; exception when check_violation then n:=n+1; end;
  begin update public.facilities set lat=5.0 where id=fnoloc; raise exception 'Half a location unexpectedly allowed'; exception when check_violation then n:=n+1; end;
  begin update public.facilities set lat=95, lng=0 where id=fa; raise exception 'Out-of-range latitude unexpectedly allowed'; exception when check_violation then n:=n+1; end;

  -- Anonymous and unassigned callers cannot read the directory.
  set local role anon;
  begin perform public.list_referral_facilities(); raise exception 'Anonymous directory read unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;
  foreach uid in array array[pending, off] loop
    perform set_config('request.jwt.claim.sub', uid::text, true);
    set local role authenticated;
    begin perform public.list_referral_facilities(); raise exception 'Unassigned or disabled directory read unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
    reset role;
  end loop;

  -- An assigned worker sees other facilities (no patient data), only those with a location.
  perform set_config('request.jwt.claim.sub', wa::text, true);
  set local role authenticated;
  got := public.list_referral_facilities();
  assert exists(select 1 from jsonb_array_elements(got) e where (e->>'id')::uuid=fb), 'Worker sees another facility in the directory'; n:=n+1;
  assert not exists(select 1 from jsonb_array_elements(got) e where (e->>'id')::uuid=fnoloc), 'Facilities without a location are left out'; n:=n+1;
  assert (select e->'services' from jsonb_array_elements(got) e where (e->>'id')::uuid=fb) = '["eye_clinic"]', 'Directory includes services'; n:=n+1;
  assert (select count(*) from public.facilities)=1, 'Direct table read still limited to own facility'; n:=n+1;
  -- Workers cannot change services, directly or through the RPC.
  begin perform public.update_facility_services(fa, '{tb_rapid_test,tb_treatment}'); raise exception 'Worker services edit unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  begin update public.facilities set services='{}' where id=fa; raise exception 'Direct facility update unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;

  -- A facility admin edits only their own facility; each edit stamps the date and is audited.
  perform set_config('request.jwt.claim.sub', admin_b::text, true);
  set local role authenticated;
  begin perform public.update_facility_services(fa, '{}'); raise exception 'Cross-facility services edit unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;
  perform set_config('request.jwt.claim.sub', admin_a::text, true);
  set local role authenticated;
  begin perform public.update_facility_services(fa, '{mri}'); raise exception 'Unknown tag through RPC unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  got := public.update_facility_services(fa, '{tb_treatment,tb_rapid_test,tb_rapid_test}', '+233000000999');
  assert got->'services' = '["tb_rapid_test","tb_treatment"]', 'Services stored sorted without duplicates'; n:=n+1;
  assert got->>'phone' = '+233000000999', 'Phone updated'; n:=n+1;
  reset role;
  assert (select services_confirmed_at > now() - interval '1 minute' from public.facilities where id=fa), 'Edit stamps services_confirmed_at'; n:=n+1;
  assert (select count(*) from public.audit_log where entity_id=fa and action='update_services' and actor=admin_a)=1, 'Services edit audited once'; n:=n+1;

  -- A maintainer can edit any facility.
  perform set_config('request.jwt.claim.sub', maint::text, true);
  set local role authenticated;
  got := public.update_facility_services(fb, '{eye_clinic,retina_laser}');
  assert got->'services' = '["eye_clinic","retina_laser"]', 'Maintainer can edit any facility'; n:=n+1;
  reset role;

  raise notice 'Passed % facility directory checks; rolling back fake fixtures', n;
  perform set_config('triagelens.test_summary', 'Passed '||n||' checks',true);
end;
$$;
select current_setting('triagelens.test_summary') as test_result;
rollback;
