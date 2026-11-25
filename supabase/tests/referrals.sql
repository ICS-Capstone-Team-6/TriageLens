-- E10-03 referral checks (ADR-22, ADR-28; hazards H14, H15). Fake users and data only; all writes roll back.
-- Run with: bash supabase/test-local.sh
begin;
set local plpgsql.check_asserts = on;
do $$
declare
  fa uuid := gen_random_uuid(); fb uuid := gen_random_uuid(); fc uuid := gen_random_uuid();
  wa uuid := gen_random_uuid(); wb uuid := gen_random_uuid(); wc uuid := gen_random_uuid();
  rev uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  rid uuid := gen_random_uuid(); uid uuid; got jsonb; r jsonb; n integer := 0; code1 text;
begin
  insert into public.facilities(id,name) values
    (fa,'FAKE referral test A '||fa), (fb,'FAKE referral test B '||fb), (fc,'FAKE referral test C '||fc);
  foreach uid in array array[wa, wb, wc, rev] loop
    insert into auth.users(id,email) values (uid, 'fake-'||uid||'@example.invalid');
  end loop;
  update public.profiles set facility_id=fa where id=wa;
  update public.profiles set facility_id=fb where id=wb;
  update public.profiles set facility_id=fc where id=wc;
  update public.profiles set facility_id=fa, role='reviewer' where id=rev;
  insert into public.cases(id,facility_id,created_by,age_band,client_version) values (ca,fa,wa,'35-44',1), (cb,fb,wb,'25-34',1);

  assert not has_table_privilege('authenticated','public.referrals','SELECT'), 'Referral reads go through RPCs'; n:=n+1;
  assert not has_table_privilege('authenticated','public.referral_events','SELECT'), 'Event reads go through RPCs'; n:=n+1;

  set local role anon;
  begin perform public.create_referral('{}'); raise exception 'Anonymous referral unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;

  -- Sender at facility A.
  perform set_config('request.jwt.claim.sub', wa::text, true);
  set local role authenticated;
  r := jsonb_build_object('id',rid,'case_id',ca,'to_facility',fb,'conditions',jsonb_build_array('tb'),
                          'urgency','days','rules_version','referral-rules-v1','distance_band','20_50','initials','KAA');
  begin perform public.create_referral(r || jsonb_build_object('to_facility',fa)); raise exception 'Referral to own facility unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  begin perform public.create_referral(r || jsonb_build_object('case_id',cb)); raise exception 'Referral of another facility''s case unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  begin perform public.create_referral(r || '{"from_facility":"00000000-0000-0000-0000-000000000000"}'); raise exception 'Client-set sender unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  begin perform public.create_referral(r || '{"code":"AAAAAAAA"}'); raise exception 'Client-set code unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  begin perform public.create_referral(r || '{"conditions":["flu"]}'); raise exception 'Unknown condition unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  got := public.create_referral(r);
  code1 := got->>'code';
  assert length(code1) = 8 and left(code1,3) = 'KAA' and substr(code1,4) ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$', 'Code is the initials then random characters, 8 in all'; n:=n+1;
  begin perform public.create_referral(r || jsonb_build_object('id',gen_random_uuid(),'initials','kaa')); raise exception 'Lower-case initials unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  begin perform public.create_referral(r || jsonb_build_object('id',gen_random_uuid(),'initials','ABCDE')); raise exception 'Five initials unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  got := public.create_referral(r || jsonb_build_object('id',gen_random_uuid(),'initials','ABCD'));
  assert left(got->>'code',4) = 'ABCD' and substr(got->>'code',5) ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$', 'Four initials leave four random characters'; n:=n+1;
  got := public.create_referral((r - 'initials') || jsonb_build_object('id',gen_random_uuid()));
  assert got->>'code' ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' and got->>'initials' = '', 'No initials gives a fully random code'; n:=n+1;
  assert (got->>'from_facility')::uuid = fa and (got->>'created_by')::uuid = wa, 'Server sets sender and author'; n:=n+1;
  assert got->>'status' = 'created', 'New referral starts as created'; n:=n+1;
  assert (got->>'expires_at')::timestamptz between now() + interval '59 days' and now() + interval '61 days', 'Code expires after 60 days'; n:=n+1;
  assert public.create_referral(r)->>'code' = code1, 'Replay returns the same referral and code'; n:=n+1;
  begin perform public.create_referral(r || jsonb_build_object('to_facility',fc)); raise exception 'Reused referral id unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  assert jsonb_array_length(public.list_referrals('sent')) = 3, 'Sender sees the sent referrals'; n:=n+1;
  assert jsonb_array_length(public.list_referrals('received')) = 0, 'Sender received nothing'; n:=n+1;
  assert public.list_referrals('sent')->2->>'to_name' like 'FAKE referral test B%', 'List names the receiving facility'; n:=n+1;
  begin perform public.list_referrals('all'); raise exception 'Unknown direction unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  begin perform public.list_referrals('sent', 101); raise exception 'Unbounded list unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  reset role;

  -- Receiver at facility B sees it as received; facility C sees nothing (H14).
  perform set_config('request.jwt.claim.sub', wb::text, true);
  set local role authenticated;
  got := public.list_referrals('received');
  assert jsonb_array_length(got) = 3 and exists(select 1 from jsonb_array_elements(got) e where e->>'code' = code1 and e->>'initials' = 'KAA'), 'Receiver sees the referrals with initials'; n:=n+1;
  assert public.get_case(ca) is null, 'Receiver still cannot read the sender''s case through get_case'; n:=n+1;
  reset role;
  perform set_config('request.jwt.claim.sub', wc::text, true);
  set local role authenticated;
  assert jsonb_array_length(public.list_referrals('sent')) = 0 and jsonb_array_length(public.list_referrals('received')) = 0, 'Third facility sees no referral'; n:=n+1;
  reset role;
  perform set_config('request.jwt.claim.sub', rev::text, true);
  set local role authenticated;
  begin perform public.create_referral(r || jsonb_build_object('id',gen_random_uuid())); raise exception 'Non-worker referral unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;

  -- Status only moves forward; identity is fixed; nothing is deleted (H15).
  update public.referrals set status='arrived' where id=rid;
  begin update public.referrals set status='seen' where id=rid; raise exception 'Backward status unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  begin update public.referrals set to_facility=fc where id=rid; raise exception 'Changing the receiver unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  begin delete from public.referrals where id=rid; raise exception 'Referral delete unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  begin update public.referral_events set note='x' where referral_id=rid; raise exception 'Event edit unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  assert (select count(*) from public.referral_events where referral_id=rid and status='created')=1, 'Created event written once'; n:=n+1;
  assert (select count(*) from public.audit_log where entity_id=rid and action='insert' and actor=wa)=1, 'Creation audited once'; n:=n+1;
  assert (select count(*) from public.audit_log where entity_id=rid and action='access' and actor=wb)=1, 'Receiver access audited'; n:=n+1;
  begin update public.referrals set initials='ZZ' where id=rid; raise exception 'Changing initials unexpectedly allowed'; exception when insufficient_privilege or check_violation then n:=n+1; end;

  raise notice 'Passed % referral checks; rolling back fake fixtures', n;
  perform set_config('triagelens.test_summary', 'Passed '||n||' checks',true);
end;
$$;
select current_setting('triagelens.test_summary') as test_result;
rollback;
