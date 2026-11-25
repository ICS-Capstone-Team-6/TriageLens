-- E10-07 facility key checks (ADR-28 section 4). Fake keys and users only; all writes roll back.
-- Run with: bash supabase/test-local.sh
begin;
set local plpgsql.check_asserts = on;
do $$
declare
  fa uuid := gen_random_uuid(); fb uuid := gen_random_uuid();
  adm_a uuid := gen_random_uuid(); wa uuid := gen_random_uuid(); wb uuid := gen_random_uuid(); maint uuid := gen_random_uuid();
  pending uuid := gen_random_uuid(); uid uuid; got jsonb; n integer := 0;
  pub constant jsonb := '{"kty":"EC","crv":"P-256","x":"FAKEx","y":"FAKEy"}';
  wrapped constant jsonb := '{"v":1,"salt":"FAKE","iv":"FAKE","ct":"FAKE","rounds":600000}';
begin
  insert into public.facilities(id,name) values (fa,'FAKE key test A '||fa), (fb,'FAKE key test B '||fb);
  foreach uid in array array[adm_a, wa, wb, maint, pending] loop
    insert into auth.users(id,email) values (uid, 'fake-'||uid||'@example.invalid');
  end loop;
  update public.profiles set facility_id=fa, role='admin' where id=adm_a;
  update public.profiles set facility_id=fa where id=wa;
  update public.profiles set facility_id=fb where id=wb;
  update public.profiles set role='maintainer' where id=maint;

  assert not has_table_privilege('authenticated','public.facility_keys','SELECT'), 'Keys only through RPCs'; n:=n+1;

  -- Only a facility admin sets the key; a worker cannot.
  perform set_config('request.jwt.claim.sub', wa::text, true);
  set local role authenticated;
  begin perform public.set_facility_key(pub, wrapped); raise exception 'Worker key setup unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  assert (public.own_facility_key())->>'has_key' = 'false', 'No key yet'; n:=n+1;
  reset role;
  perform set_config('request.jwt.claim.sub', adm_a::text, true);
  set local role authenticated;
  begin perform public.set_facility_key(pub || '{"d":"secret"}', wrapped); raise exception 'Private part in public key unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  begin perform public.set_facility_key(pub, wrapped || '{"rounds":1000}'); raise exception 'Weak passphrase rounds unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  begin perform public.set_facility_key('{"kty":"RSA"}', wrapped); raise exception 'Wrong key type unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  assert (public.set_facility_key(pub, wrapped))->>'facility_id' = fa::text, 'Admin sets the facility key'; n:=n+1;
  begin perform public.set_facility_key(pub, wrapped); raise exception 'Second key unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  reset role;

  -- Members of A get the wrapped key; members of B only the public key.
  perform set_config('request.jwt.claim.sub', wa::text, true);
  set local role authenticated;
  got := public.own_facility_key();
  assert got->>'has_key' = 'true' and got->'wrapped_private_key' = wrapped, 'Worker at A gets the wrapped key'; n:=n+1;
  reset role;
  perform set_config('request.jwt.claim.sub', wb::text, true);
  set local role authenticated;
  assert (public.own_facility_key())->>'has_key' = 'false', 'Worker at B does not get A''s wrapped key'; n:=n+1;
  got := public.facility_public_keys(array[fa, fb]);
  assert got->fa::text = pub and not (got ? fb::text), 'Anyone assigned gets public keys only'; n:=n+1;
  begin perform public.reset_facility_key(fa); raise exception 'Worker reset unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;
  perform set_config('request.jwt.claim.sub', pending::text, true);
  set local role authenticated;
  begin perform public.facility_public_keys(array[fa]); raise exception 'Unassigned key read unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;

  -- A maintainer can reset (audited).
  perform set_config('request.jwt.claim.sub', maint::text, true);
  set local role authenticated;
  perform public.reset_facility_key(fa);
  reset role;
  assert not exists (select 1 from public.facility_keys where facility_id = fa), 'Maintainer reset removes the key'; n:=n+1;
  assert (select count(*) from public.audit_log where entity_id = fa and action in ('set_key','reset_key')) = 2, 'Set and reset audited'; n:=n+1;

  raise notice 'Passed % facility key checks; rolling back fake fixtures', n;
  perform set_config('triagelens.test_summary', 'Passed '||n||' checks',true);
end;
$$;
select current_setting('triagelens.test_summary') as test_result;
rollback;
