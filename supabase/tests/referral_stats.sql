-- E10-09 referral numbers checks (ADR-28 section 6). Fake users and data only; all writes roll back.
-- Run with: bash supabase/test-local.sh
begin;
set local plpgsql.check_asserts = on;
do $$
declare
  fa uuid := gen_random_uuid(); fb uuid := gen_random_uuid();
  wa uuid := gen_random_uuid(); rb uuid := gen_random_uuid(); adm_a uuid := gen_random_uuid(); adm_b uuid := gen_random_uuid(); maint uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid(); r3 uuid := gen_random_uuid();
  r4 uuid := gen_random_uuid(); r5 uuid := gen_random_uuid(); r6 uuid := gen_random_uuid(); x uuid;
  uid uuid; got jsonb; fa_stats jsonb; fb_stats jsonb; wk jsonb; n integer := 0; txt text;
begin
  insert into public.facilities(id,name) values (fa,'FAKE stats test A '||fa), (fb,'FAKE stats test B '||fb);
  foreach uid in array array[wa, rb, adm_a, adm_b, maint] loop
    insert into auth.users(id,email) values (uid, 'fake-'||uid||'@example.invalid');
  end loop;
  update public.profiles set facility_id=fa where id=wa;
  update public.profiles set facility_id=fb, role='reviewer' where id=rb;
  update public.profiles set facility_id=fa, role='admin' where id=adm_a;
  update public.profiles set facility_id=fb, role='admin' where id=adm_b;
  update public.profiles set role='maintainer' where id=maint;
  insert into public.cases(id,facility_id,created_by,age_band,client_version) values (ca,fa,wa,'35-44',1);

  perform set_config('request.jwt.claim.sub', wa::text, true);
  set local role authenticated;
  foreach uid in array array[r1, r2, r3, r4, r5, r6] loop
    perform public.create_referral(jsonb_build_object('id',uid,'case_id',ca,'to_facility',fb,'conditions',jsonb_build_array('tb'),'rules_version','v1','initials','KAM'));
  end loop;
  perform public.request_ambulance(jsonb_build_object('id',gen_random_uuid(),'referral_id',r1,'reason','very_weak'));
  begin perform public.referral_stats(); raise exception 'Worker stats unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  reset role;
  perform set_config('request.jwt.claim.sub', rb::text, true);
  set local role authenticated;
  perform public.advance_referral(r1,'arrived');
  perform public.advance_referral(r1,'tested','confirmed');
  perform public.advance_referral(r2,'arrived');
  perform public.advance_referral(r2,'closed');
  foreach x in array array[r4, r5, r6] loop perform public.advance_referral(x,'arrived'); end loop;
  perform public.answer_ambulance(((public.list_ambulance_requests('received'))->0->>'id')::uuid, 'dispatched', 20);
  reset role;
  -- r3: sent 9 days ago, never arrived.
  -- Test only: back-date inside this rolled-back transaction.
  alter table public.referrals disable trigger referral_forward_only;
  update public.referrals set created_at = greatest(date_trunc('week', now()), now() - interval '1 minute') where id in (r1, r2, r4, r5, r6);
  update public.referrals set created_at = now() - interval '9 days' where id = r3;
  alter table public.referrals enable trigger referral_forward_only;

  -- Admin A: own facility only. Six sent (five this week, one 9 days ago), five arrived,
  -- one tested and confirmed, one not arrived after 7 days. Counts 1 to 4 are hidden.
  perform set_config('request.jwt.claim.sub', adm_a::text, true);
  set local role authenticated;
  got := public.referral_stats(4);
  assert jsonb_array_length(got) = 1 and got->0->>'facility_id' = fa::text, 'Admin sees only their facility'; n:=n+1;
  fa_stats := got->0;
  assert jsonb_array_length(fa_stats->'weeks') = 4, 'One row per week asked for'; n:=n+1;
  assert (fa_stats->'totals'->>'sent')::int = 6 and (fa_stats->'totals'->>'arrived')::int = 5, 'Totals of 5 or more are shown'; n:=n+1;
  assert fa_stats->'totals'->'tested' = 'null' and fa_stats->'totals'->'confirmed' = 'null' and fa_stats->'totals'->'not_arrived_7d' = 'null',
    'Totals from 1 to 4 are hidden, so a single confirmed result cannot be picked out'; n:=n+1;
  select w into wk from jsonb_array_elements(fa_stats->'weeks') w where w->>'week' = to_char(date_trunc('week', now()), 'YYYY-MM-DD');
  assert (wk->>'sent')::int = 5 and (wk->>'arrived')::int = 5 and not (wk ? 'confirmed'), 'Weekly rows: volumes only, no results'; n:=n+1;
  assert (select count(*) from jsonb_array_elements(fa_stats->'weeks') w where w->'sent' = 'null') = 1, 'The week with one referral is hidden'; n:=n+1;
  txt := got::text;
  assert position('KAM' in txt) = 0 and position(ca::text in txt) = 0 and position(r1::text in txt) = 0, 'No initials, case or referral ids in the numbers'; n:=n+1;
  begin perform public.referral_stats(0); raise exception 'Zero weeks unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  begin perform public.referral_stats(53); raise exception 'Over a year unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  reset role;

  -- Admin B: counts as receiver; a single ambulance request is hidden.
  perform set_config('request.jwt.claim.sub', adm_b::text, true);
  set local role authenticated;
  fb_stats := (public.referral_stats(4))->0;
  assert (fb_stats->'totals'->>'received')::int = 6 and fb_stats->'totals'->'amb_requests' = 'null' and (fb_stats->'totals'->>'sent')::int = 0,
    'Receiver: 6 received, one ambulance request hidden, zero sent shown as zero'; n:=n+1;
  assert (public.my_facility())->>'id' = fb::text, 'Admin reads their own facility for editing'; n:=n+1;
  reset role;

  -- Maintainer sees every facility; reviewers and workers cannot edit facilities.
  perform set_config('request.jwt.claim.sub', maint::text, true);
  set local role authenticated;
  got := public.referral_stats(1);
  assert (select count(*) from jsonb_array_elements(got) e where (e->>'facility_id')::uuid in (fa, fb)) = 2, 'Maintainer sees both facilities'; n:=n+1;
  assert (public.my_role())->>'role' = 'maintainer', 'my_role returns the role'; n:=n+1;
  reset role;
  perform set_config('request.jwt.claim.sub', rb::text, true);
  set local role authenticated;
  begin perform public.my_facility(); raise exception 'Reviewer facility edit unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  assert (public.my_role())->>'role' = 'reviewer', 'Reviewer role reported'; n:=n+1;
  reset role;

  raise notice 'Passed % referral stats checks; rolling back fake fixtures', n;
  perform set_config('triagelens.test_summary', 'Passed '||n||' checks',true);
end;
$$;
select current_setting('triagelens.test_summary') as test_result;
rollback;
