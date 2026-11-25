-- E10-08 ambulance request checks (ADR-28 section 5; H18, H19). Fake users and data only; all writes roll back.
-- Run with: bash supabase/test-local.sh
begin;
set local plpgsql.check_asserts = on;
do $$
declare
  fa uuid := gen_random_uuid(); fb uuid := gen_random_uuid(); fc uuid := gen_random_uuid();
  wa uuid := gen_random_uuid(); wb uuid := gen_random_uuid(); rb uuid := gen_random_uuid(); wc uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); rid uuid := gen_random_uuid(); r2 uuid := gen_random_uuid();
  amb uuid := gen_random_uuid(); amb2 uuid := gen_random_uuid(); amb3 uuid := gen_random_uuid();
  uid uuid; got jsonb; req jsonb; n integer := 0;
begin
  insert into public.facilities(id,name,phone) values
    (fa,'FAKE ambulance test A '||fa,'+233000000901'), (fb,'FAKE ambulance test B '||fb,'+233000000902'), (fc,'FAKE ambulance test C '||fc,'');
  foreach uid in array array[wa, wb, rb, wc] loop
    insert into auth.users(id,email) values (uid, 'fake-'||uid||'@example.invalid');
  end loop;
  update public.profiles set facility_id=fa where id=wa;
  update public.profiles set facility_id=fb where id=wb;
  update public.profiles set facility_id=fb, role='reviewer' where id=rb;
  update public.profiles set facility_id=fc where id=wc;
  insert into public.cases(id,facility_id,created_by,age_band,client_version) values (ca,fa,wa,'45-54',1);

  perform set_config('request.jwt.claim.sub', wa::text, true);
  set local role authenticated;
  perform public.create_referral(jsonb_build_object('id',rid,'case_id',ca,'to_facility',fb,'conditions',jsonb_build_array('tb'),'rules_version','v1'));
  perform public.create_referral(jsonb_build_object('id',r2,'case_id',ca,'to_facility',fb,'conditions',jsonb_build_array('tb'),'rules_version','v1'));
  req := jsonb_build_object('id',amb,'referral_id',rid,'reason','breathing_hard');
  begin perform public.request_ambulance(req || '{"reason":"looks_bad"}'); raise exception 'Unknown reason unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  begin perform public.request_ambulance(jsonb_build_object('id',gen_random_uuid(),'referral_id',rid,'reason','other')); raise exception 'Other without a note unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  begin perform public.request_ambulance(req || '{"status":"dispatched"}'); raise exception 'Client-set status unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  got := public.request_ambulance(req);
  assert got->>'status' = 'requested' and (got->>'to_facility')::uuid = fb, 'Sender requests an ambulance from the receiving facility'; n:=n+1;
  assert got->>'to_phone' = '+233000000902', 'Request carries the facility phone for the call-first button'; n:=n+1;
  assert (public.request_ambulance(req))->>'id' = amb::text, 'Repeating the same request is a safe replay'; n:=n+1;
  begin perform public.request_ambulance(jsonb_build_object('id',amb2,'referral_id',rid,'reason','cannot_walk')); raise exception 'Second open request unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  begin perform public.answer_ambulance(amb,'dispatched',20); raise exception 'Sender dispatch unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;

  -- A third facility sees and answers nothing.
  perform set_config('request.jwt.claim.sub', wc::text, true);
  set local role authenticated;
  assert jsonb_array_length(public.list_ambulance_requests('received')) = 0, 'Third facility sees no request'; n:=n+1;
  begin perform public.answer_ambulance(amb,'seen'); raise exception 'Third facility answer unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  begin perform public.request_ambulance(jsonb_build_object('id',amb3,'referral_id',rid,'reason','very_weak')); raise exception 'Third facility request unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;

  -- The receiving reviewer sees it at the top, marks it seen, then dispatched with an ETA.
  perform set_config('request.jwt.claim.sub', rb::text, true);
  set local role authenticated;
  got := public.list_ambulance_requests('received');
  assert jsonb_array_length(got) = 1 and got->0->>'reason' = 'breathing_hard' and got->0->>'from_name' like 'FAKE ambulance test A%', 'Receiver sees the open request'; n:=n+1;
  got := public.answer_ambulance(amb,'seen');
  assert got->>'status' = 'seen' and got->>'seen_at' is not null, 'Marked seen with a time'; n:=n+1;
  begin perform public.answer_ambulance(amb,'dispatched'); raise exception 'Dispatch without ETA unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  begin perform public.answer_ambulance(amb,'cannot_send',null,'  '); raise exception 'Cannot send without a reason unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  got := public.answer_ambulance(amb,'dispatched',25,'FAKE driver note');
  assert got->>'status' = 'dispatched' and (got->>'eta_minutes')::int = 25 and (got->>'answered_by')::uuid = rb, 'Dispatched with ETA, answer recorded'; n:=n+1;
  assert (public.answer_ambulance(amb,'dispatched',25))->>'status' = 'dispatched', 'Repeating dispatch is a safe replay'; n:=n+1;
  begin perform public.answer_ambulance(amb,'seen'); raise exception 'Backward answer unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  begin perform public.answer_ambulance(amb,'cannot_send',null,'changed mind'); raise exception 'Changing a closed request unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;

  -- Sender sees the answer; can cancel an open request; a new request is allowed after.
  perform set_config('request.jwt.claim.sub', wa::text, true);
  set local role authenticated;
  got := public.list_ambulance_requests('sent');
  assert got->0->>'status' = 'dispatched' and (got->0->>'eta_minutes')::int = 25, 'Sender sees dispatched and the ETA'; n:=n+1;
  begin perform public.cancel_ambulance(amb); raise exception 'Cancelling a dispatched request unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  got := public.request_ambulance(jsonb_build_object('id',amb2,'referral_id',r2,'reason','other','note','FAKE note'));
  assert (public.cancel_ambulance(amb2))->>'status' = 'cancelled', 'Sender cancels an open request'; n:=n+1;
  assert (public.request_ambulance(jsonb_build_object('id',amb3,'referral_id',r2,'reason','very_weak')))->>'status' = 'requested', 'New request allowed after a cancel'; n:=n+1;
  reset role;

  -- Closed referrals take no new request; nothing is deleted; every change audited.
  update public.referrals set status='closed' where id=r2;
  perform set_config('request.jwt.claim.sub', wa::text, true);
  set local role authenticated;
  begin perform public.request_ambulance(jsonb_build_object('id',gen_random_uuid(),'referral_id',r2,'reason','very_weak')); raise exception 'Request on a closed referral unexpectedly allowed'; exception when insufficient_privilege or invalid_parameter_value then n:=n+1; end;
  reset role;
  begin delete from public.ambulance_requests where id = amb; raise exception 'Delete unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  assert (select count(*) from public.audit_log where entity_id = amb) = 3, 'Request, seen and dispatch audited once each'; n:=n+1;

  raise notice 'Passed % ambulance request checks; rolling back fake fixtures', n;
  perform set_config('triagelens.test_summary', 'Passed '||n||' checks',true);
end;
$$;
select current_setting('triagelens.test_summary') as test_result;
rollback;
