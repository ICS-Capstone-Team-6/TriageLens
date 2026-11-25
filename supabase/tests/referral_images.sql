-- E10-07 referral image checks (ADR-28 section 4; H14). Fake users and data only; no real
-- image bytes (rows in storage.objects stand in for files). All writes roll back.
-- Run with: bash supabase/test-local.sh
begin;
set local plpgsql.check_asserts = on;
do $$
declare
  fa uuid := gen_random_uuid(); fb uuid := gen_random_uuid(); fc uuid := gen_random_uuid();
  wa uuid := gen_random_uuid(); wb uuid := gen_random_uuid(); wc uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); rid uuid := gen_random_uuid(); r2 uuid := gen_random_uuid();
  uid uuid; n integer := 0; path text; path2 text;
begin
  insert into public.facilities(id,name) values
    (fa,'FAKE image test A '||fa), (fb,'FAKE image test B '||fb), (fc,'FAKE image test C '||fc);
  foreach uid in array array[wa, wb, wc, adm] loop
    insert into auth.users(id,email) values (uid, 'fake-'||uid||'@example.invalid');
  end loop;
  update public.profiles set facility_id=fa where id=wa;
  update public.profiles set facility_id=fb where id=wb;
  update public.profiles set facility_id=fc where id=wc;
  update public.profiles set facility_id=fb, role='admin' where id=adm;
  insert into public.cases(id,facility_id,created_by,age_band,client_version) values (ca,fa,wa,'35-44',1);
  path := rid::text || '/image.jpg';
  path2 := r2::text || '/image.jpg';

  assert (select not public and allowed_mime_types = array['image/jpeg'] and file_size_limit = 2097152
          from storage.buckets where id = 'referral-images'), 'Bucket is private, JPEG only, 2 MB'; n:=n+1;

  perform set_config('request.jwt.claim.sub', wa::text, true);
  set local role authenticated;
  perform public.create_referral(jsonb_build_object('id',rid,'case_id',ca,'to_facility',fb,'conditions',jsonb_build_array('tb'),'rules_version','v1'));
  perform public.create_referral(jsonb_build_object('id',r2,'case_id',ca,'to_facility',fb,'conditions',jsonb_build_array('tb'),'rules_version','v1'));
  -- No upload before consent.
  begin insert into storage.objects(bucket_id,name) values ('referral-images', path); raise exception 'Upload without consent unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  begin perform public.confirm_image_upload(rid); raise exception 'Confirm without upload unexpectedly allowed'; exception when invalid_parameter_value then n:=n+1; end;
  assert (public.consent_image_share(rid))->>'image_consent' = 'true', 'Sender records consent'; n:=n+1;
  assert (public.consent_image_share(rid))->>'image_consent' = 'true', 'Repeating consent is a safe replay'; n:=n+1;
  -- Upload only to that referral's folder, with the fixed name.
  begin insert into storage.objects(bucket_id,name) values ('referral-images', rid::text || '/other.jpg'); raise exception 'Other file name unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  begin insert into storage.objects(bucket_id,name) values ('referral-images', path2); raise exception 'Upload to a referral without consent unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  insert into storage.objects(bucket_id,name) values ('referral-images', path);
  n:=n+1;
  assert (public.confirm_image_upload(rid))->>'image_shared' = 'true', 'Upload confirmed'; n:=n+1;
  -- Nobody updates or deletes through the API (no policy: zero rows touched).
  update storage.objects set name = rid::text || '/x.jpg' where bucket_id = 'referral-images' and name = path;
  -- Storage also refuses direct deletes outright (storage.protect_delete).
  begin delete from storage.objects where bucket_id = 'referral-images' and name = path; exception when others then n:=n+1; end;
  reset role;
  assert exists (select 1 from storage.objects where bucket_id='referral-images' and name=path), 'Image cannot be changed or deleted by the sender'; n:=n+1;

  -- Receiver cannot read before an audited access; can read within 5 minutes after.
  perform set_config('request.jwt.claim.sub', wb::text, true);
  set local role authenticated;
  assert not exists (select 1 from storage.objects where bucket_id='referral-images' and name=path), 'No read without a logged access'; n:=n+1;
  assert public.record_image_access(rid), 'Receiver logs an access'; n:=n+1;
  assert exists (select 1 from storage.objects where bucket_id='referral-images' and name=path), 'Receiver reads after a logged access'; n:=n+1;
  begin insert into storage.objects(bucket_id,name) values ('referral-images', path2); raise exception 'Receiver upload unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  assert not public.record_image_access(r2), 'No access logged for a referral with no image'; n:=n+1;
  reset role;

  -- Third facility and admins cannot read, even after trying to log access.
  perform set_config('request.jwt.claim.sub', wc::text, true);
  set local role authenticated;
  assert not public.record_image_access(rid), 'Third facility cannot log an access'; n:=n+1;
  assert not exists (select 1 from storage.objects where bucket_id='referral-images'), 'Third facility reads nothing'; n:=n+1;
  reset role;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  begin perform public.record_image_access(rid); raise exception 'Admin image access unexpectedly allowed'; exception when insufficient_privilege then n:=n+1; end;
  assert not exists (select 1 from storage.objects where bucket_id='referral-images'), 'Admin reads nothing'; n:=n+1;
  reset role;

  -- An access logged more than 5 minutes ago no longer opens the image.
  -- Test only: back-date the access inside this rolled-back transaction.
  alter table public.audit_log disable trigger immutable_audit;
  update public.audit_log set occurred_at = now() - interval '6 minutes' where actor = wb and action = 'image_access';
  alter table public.audit_log enable trigger immutable_audit;
  perform set_config('request.jwt.claim.sub', wb::text, true);
  set local role authenticated;
  assert not exists (select 1 from storage.objects where bucket_id='referral-images' and name=path), 'Old access does not open the image'; n:=n+1;
  reset role;

  -- 60 days after closing: no reads, and the file is due for deletion.
  update public.referrals set status='closed', updated_at = now() - interval '61 days' where id = rid;
  perform set_config('request.jwt.claim.sub', wb::text, true);
  set local role authenticated;
  assert not public.record_image_access(rid), 'No access 60 days after closing'; n:=n+1;
  reset role;
  assert path in (select public.referral_images_due_for_deletion()), 'Image listed for deletion'; n:=n+1;
  assert not has_function_privilege('authenticated', 'public.referral_images_due_for_deletion()', 'EXECUTE'), 'Deletion list is service-role only'; n:=n+1;
  assert (select count(*) from public.audit_log where entity_id = rid and action in ('image_consent','image_upload')) = 2, 'Consent and upload audited once each'; n:=n+1;

  raise notice 'Passed % referral image checks; rolling back fake fixtures', n;
  perform set_config('triagelens.test_summary', 'Passed '||n||' checks',true);
end;
$$;
select current_setting('triagelens.test_summary') as test_result;
rollback;
