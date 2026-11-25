-- E10-10 facility beds and the low-bed referral block. Fake users and facilities only; all writes roll back.
-- Run with: bash supabase/test-local.sh
begin;
set local plpgsql.check_asserts = on;
do $$
declare
  fa uuid := gen_random_uuid(); full_f uuid := gen_random_uuid(); stale_f uuid := gen_random_uuid(); outp uuid := gen_random_uuid();
  wa uuid := gen_random_uuid(); admin_a uuid := gen_random_uuid(); admin_full uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); uid uuid; got jsonb; r jsonb; n integer := 0;
begin
  insert into public.facilities(id,name,lat,lng,services) values
    (fa,'FAKE beds test sender '||fa,5.60,-0.20,'{}'),
    (full_f,'FAKE beds test full '||full_f,5.70,-0.21,'{tb_rapid_test}'),
    (stale_f,'FAKE beds test stale '||stale_f,5.71,-0.22,'{tb_rapid_test}'),
    (outp,'FAKE beds test outpatient '||outp,5.72,-0.23,'{tb_rapid_test}');
  foreach uid in array array[wa, admin_a, admin_full] loop
    insert into auth.users(id,email) values (uid, 'fake-'||uid||'@example.invalid');
  end loop;
  update public.profiles set facility_id=fa where id=wa;
  update public.profiles set facility_id=fa, role='admin' where id=admin_a;
  update public.profiles set facility_id=full_f, role='admin' where id=admin_full;
  insert into public.cases(id,facility_id,created_by,age_band,client_version) values (ca,fa,wa,'35-44',1);
  update public.facilities set beds_total=40, beds_free=1, beds_updated_at=now()-interval '3 days' where id=stale_f;

  -- Table checks.
  begin update public.facilities set beds_total=10, beds_free=11 where id=fa; raise exception 'Free beds above total unexpectedly allowed'; exception when check_violation then n:=n+1; end;
  begin update public.facilities set beds_total=-1 where id=fa; raise exception 'Negative beds unexpectedly allowed'; exception when check_violation then n:=n+1; end;

  -- Only the facility's own admin sets beds; each change is stamped and audited.
  perform set_config('request.jwt.claim.sub', wa::text, true);
  set local role authenticated;
  begin perform public.update_facility_beds(fa, 10, 5); raise exception 'Worker beds edit unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;
  perform set_config('request.jwt.claim.sub', admin_a::text, true);
  set local role authenticated;
  begin perform public.update_facility_beds(full_f, 10, 5); raise exception 'Cross-facility beds edit unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  begin perform public.update_facility_beds(fa, 10, 11); raise exception 'Free above total through RPC unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  reset role;
  perform set_config('request.jwt.claim.sub', admin_full::text, true);
  set local role authenticated;
  got := public.update_facility_beds(full_f, 30, 2);
  assert (got->>'beds_free')::int = 2 and got->>'beds_updated_at' is not null, 'Admin sets own beds'; n:=n+1;
  got := public.my_facility();
  assert (got->>'beds_total')::int = 30, 'my_facility returns beds'; n:=n+1;
  reset role;
  assert exists(select 1 from public.audit_log where entity_id=full_f and action='update_beds'), 'Beds change is audited'; n:=n+1;

  -- The directory carries beds.
  perform set_config('request.jwt.claim.sub', wa::text, true);
  set local role authenticated;
  got := public.list_referral_facilities();
  assert (select (e->>'beds_free')::int from jsonb_array_elements(got) e where (e->>'id')::uuid=full_f) = 2, 'Directory includes free beds'; n:=n+1;

  -- A fresh count of 2 or fewer free beds blocks a new referral.
  r := jsonb_build_object('id',gen_random_uuid(),'case_id',ca,'to_facility',full_f,'conditions',jsonb_build_array('tb'),
                          'urgency','days','rules_version','referral-rules-v1','distance_band','under_5','initials','KAA');
  begin perform public.create_referral(r); raise exception 'Referral to a nearly full facility unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  -- An old count never blocks (the app says call first), and outpatient-only facilities (0 beds) are never blocked.
  got := public.create_referral(r || jsonb_build_object('id',gen_random_uuid(),'to_facility',stale_f));
  assert got->>'id' is not null, 'Stale low count does not block'; n:=n+1;
  got := public.create_referral(r || jsonb_build_object('id',gen_random_uuid(),'to_facility',outp));
  assert got->>'id' is not null, 'Facility with no beds listed is not blocked'; n:=n+1;
  reset role;

  -- A replay of a referral sent before the facility filled up still returns it.
  update public.facilities set beds_free=20 where id=full_f;
  perform set_config('request.jwt.claim.sub', wa::text, true);
  set local role authenticated;
  got := public.create_referral(r);
  reset role;
  update public.facilities set beds_free=0, beds_updated_at=now() where id=full_f;
  set local role authenticated;
  assert public.create_referral(r)->>'id' = r->>'id', 'Replay after the facility filled up is not blocked'; n:=n+1;
  reset role;

  raise notice 'Passed % facility beds checks; rolling back fake fixtures', n;
  perform set_config('triagelens.test_summary', 'Passed '||n||' checks',true);
end;
$$;
select current_setting('triagelens.test_summary') as test_result;
rollback;
