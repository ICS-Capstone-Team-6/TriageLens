-- E10-04 receiving-facility checks (ADR-22, ADR-28; H14, H15). Fake users and data only; all writes roll back.
-- Run with: bash supabase/test-local.sh
begin;
set local plpgsql.check_asserts = on;
do $$
declare
  fa uuid := gen_random_uuid(); fb uuid := gen_random_uuid(); fc uuid := gen_random_uuid();
  wa uuid := gen_random_uuid(); wb uuid := gen_random_uuid(); wc uuid := gen_random_uuid();
  rb uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); guesser uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); rid uuid := gen_random_uuid(); old_rid uuid := gen_random_uuid();
  uid uuid; got jsonb; code1 text; old_code text; n integer := 0; i integer;
begin
  insert into public.facilities(id,name) values
    (fa,'FAKE receiving test A '||fa), (fb,'FAKE receiving test B '||fb), (fc,'FAKE receiving test C '||fc);
  foreach uid in array array[wa, wb, wc, rb, adm, guesser] loop
    insert into auth.users(id,email) values (uid, 'fake-'||uid||'@example.invalid');
  end loop;
  update public.profiles set facility_id=fa where id=wa;
  update public.profiles set facility_id=fb where id in (wb, guesser);
  update public.profiles set facility_id=fc where id=wc;
  update public.profiles set facility_id=fb, role='reviewer' where id=rb;
  update public.profiles set facility_id=fb, role='admin' where id=adm;
  insert into public.cases(id,facility_id,created_by,age_band,symptoms,client_version) values (ca,fa,wa,'35-44','{"cough_2_weeks":true}',1);
  insert into public.inferences(id,case_id,model_name,model_version,thresholds_version,outputs,zone,quality_scores,latency_ms)
  values (gen_random_uuid(),ca,'demo-tb','demo-only','demo-only','{"tb_probability":0.8}','refer_now','{"passed":true}',10);

  perform set_config('request.jwt.claim.sub', wa::text, true);
  set local role authenticated;
  code1 := public.create_referral(jsonb_build_object('id',rid,'case_id',ca,'to_facility',fb,'conditions',jsonb_build_array('tb'),
            'urgency','days','rules_version','referral-rules-v1','initials','KAM'))->>'code';
  perform public.create_referral(jsonb_build_object('id',old_rid,'case_id',ca,'to_facility',fb,'conditions',jsonb_build_array('tb'),
            'rules_version','referral-rules-v1'));
  -- The sender cannot look up its own referral by code, or move its status.
  assert public.lookup_referral(code1) is null, 'Sender cannot look up by code'; n:=n+1;
  begin perform public.advance_referral(rid,'arrived'); raise exception 'Sender status change unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;
  update public.referrals set expires_at = now() - interval '1 day' where id = old_rid returning code into old_code;

  -- Facility C cannot look up or open it (H14).
  perform set_config('request.jwt.claim.sub', wc::text, true);
  set local role authenticated;
  assert public.lookup_referral(code1) is null, 'Third facility lookup finds nothing'; n:=n+1;
  assert public.get_referral(rid) is null, 'Third facility cannot open the referral'; n:=n+1;
  begin perform public.advance_referral(rid,'arrived'); raise exception 'Third facility status change unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;

  -- Admins do not read case data.
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  begin perform public.lookup_referral(code1); raise exception 'Admin lookup unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;

  -- The receiving reviewer looks it up (spaces and lower case allowed); first look marks it seen.
  perform set_config('request.jwt.claim.sub', rb::text, true);
  set local role authenticated;
  got := public.lookup_referral(lower(left(code1,3)||' '||substr(code1,4)));
  assert got is not null, 'Receiver finds the referral by code'; n:=n+1;
  assert got->'referral'->>'status' = 'seen', 'First lookup marks it seen'; n:=n+1;
  assert got->'case'->>'age_band' = '35-44' and got->'case'->'symptoms'->>'cough_2_weeks' = 'true', 'Receiver sees the case summary'; n:=n+1;
  assert got->'inferences'->0->>'zone' = 'refer_now' and got->'inferences'->0->>'thresholds_version' = 'demo-only', 'Receiver sees the result with versions'; n:=n+1;
  assert got->'referral'->>'from_name' like 'FAKE receiving test A%', 'Receiver sees who sent it'; n:=n+1;
  assert not (got->'case' ? 'notes') and not (got->'case' ? 'created_by'), 'Case notes and author stay with the sender'; n:=n+1;
  assert not (got->'inferences'->0 ? 'outputs') and not (got->'inferences'->0 ? 'quality_scores'), 'No raw scores reach the receiving facility'; n:=n+1;
  assert public.lookup_referral(old_code) is null, 'Expired code is not found'; n:=n+1;
  assert jsonb_array_length(public.list_referrals('received')) = 2, 'Reviewer sees the received list'; n:=n+1;

  -- Status moves forward only; tested needs an outcome; replays are safe (H15).
  begin perform public.advance_referral(rid,'tested'); raise exception 'Tested without outcome unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  begin perform public.advance_referral(rid,'arrived','confirmed'); raise exception 'Outcome without tested unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  begin perform public.advance_referral(rid,'tested','positive'); raise exception 'Unknown outcome unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  begin perform public.advance_referral(rid,'created'); raise exception 'Created status unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  got := public.advance_referral(rid,'arrived',null,'FAKE note');
  assert got->'referral'->>'status' = 'arrived', 'Receiver marks arrival'; n:=n+1;
  assert (public.advance_referral(rid,'arrived'))->'referral'->>'status' = 'arrived', 'Repeating arrival is a safe replay'; n:=n+1;
  got := public.advance_referral(rid,'tested','confirmed');
  assert got->'referral'->>'outcome' = 'confirmed' and got->'referral'->>'outcome_at' is not null, 'Outcome recorded with time'; n:=n+1;
  begin perform public.advance_referral(rid,'arrived'); raise exception 'Backward status unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  begin perform public.advance_referral(old_rid,'arrived'); raise exception 'Expired referral arrival unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  assert (public.advance_referral(old_rid,'closed',null,'Did not arrive'))->'referral'->>'status' = 'closed', 'Expired referral can be closed'; n:=n+1;
  reset role;

  -- The outcome goes back to the sender (closed loop).
  perform set_config('request.jwt.claim.sub', wa::text, true);
  set local role authenticated;
  got := public.get_referral(rid);
  assert got->'referral'->>'outcome' = 'confirmed', 'Sender sees the outcome'; n:=n+1;
  assert (select count(*) from jsonb_array_elements(got->'events')) = 4, 'Sender sees created, seen, arrived, tested'; n:=n+1;
  assert (public.list_referrals('sent')->0->>'outcome') is not null or (public.list_referrals('sent')->1->>'outcome') is not null, 'Sent list carries the outcome'; n:=n+1;
  reset role;

  -- Guessing: 10 failed lookups in 15 minutes lock the caller out (H14).
  perform set_config('request.jwt.claim.sub', guesser::text, true);
  set local role authenticated;
  for i in 1..10 loop
    assert public.lookup_referral('KAMZZZZZ') is null, 'Wrong code finds nothing';
  end loop;
  n:=n+1;
  begin perform public.lookup_referral(code1); raise exception 'Lookup after 10 failures unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;
  assert (select count(*) from public.audit_log where actor=guesser and action='lookup_failed') = 10, 'Each failed lookup audited'; n:=n+1;
  assert (select count(*) from public.audit_log where entity_id=rid and action='update' and actor=rb) = 2, 'Each status change audited once'; n:=n+1;

  raise notice 'Passed % receiving-facility checks; rolling back fake fixtures', n;
  perform set_config('triagelens.test_summary', 'Passed '||n||' checks',true);
end;
$$;
select current_setting('triagelens.test_summary') as test_result;
rollback;
