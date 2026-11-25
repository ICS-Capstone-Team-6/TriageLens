-- E10-07 (ADR-28 section 4): share the X-ray image with the receiving facility, only with
-- the person's consent. The heatmap (ADR-9) is not computed by the app yet, so only the
-- image is shared for now.
--
-- Flow: the sender records consent (consent_image_share), uploads one image to the
-- private bucket at '<referral_id>/image.jpg', then confirms (confirm_image_upload).
-- Rules enforced here, not in the app:
--   * upload only by a health worker at the sending facility, only after consent,
--     only to that referral's folder, only image/jpeg, at most 2 MB;
--   * read only by the sending or receiving facility, and only within 5 minutes of an
--     audited record_image_access call for that referral (every view is logged, FR-17);
--   * no reads once the referral has been closed for 60 days; the files are then due for
--     deletion (referral_images_due_for_deletion, run by a scheduled job with the
--     service role; the job itself is not built yet);
--   * nobody can change or delete an image through the API.

alter table public.referrals
  add column image_consent boolean not null default false,
  add column image_consented_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('referral-images', 'referral-images', false, 2097152, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Referral id from an object path '<uuid>/image.jpg'; null for anything else.
create function private.referral_of_path(p_name text) returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/image\.jpg$' then return null; end if;
  return split_part(p_name, '/', 1)::uuid;
end;
$$;

create function private.can_upload_referral_image(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.referrals r
    join public.profiles p on p.id = auth.uid() and p.role = 'health_worker' and p.disabled_at is null
    where r.id = private.referral_of_path(p_name)
      and r.from_facility = p.facility_id and r.image_consent and r.status <> 'closed');
$$;

create function private.can_read_referral_image(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.referrals r
    join public.profiles p on p.id = auth.uid() and p.role in ('health_worker','reviewer') and p.disabled_at is null
    where r.id = private.referral_of_path(p_name)
      and p.facility_id in (r.from_facility, r.to_facility)
      and r.image_consent
      and not (r.status = 'closed' and r.updated_at < now() - interval '60 days')
      and exists (select 1 from public.audit_log a
                  where a.actor = auth.uid() and a.action = 'image_access' and a.entity_id = r.id
                    and a.occurred_at > now() - interval '5 minutes'));
$$;

create policy referral_image_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'referral-images' and private.can_upload_referral_image(name));
create policy referral_image_read on storage.objects for select to authenticated
  using (bucket_id = 'referral-images' and private.can_read_referral_image(name));
-- No update or delete policy: images cannot be replaced or removed through the API.

create function private.consent_image_share(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare f uuid := private.worker_facility(); r public.referrals;
begin
  select * into r from public.referrals where id = p_id and from_facility = f for update;
  if not found then raise exception 'Referral unavailable' using errcode = '42501'; end if;
  if r.image_consent then return jsonb_build_object('image_consent', true, 'image_shared', r.image_shared); end if;
  if r.status = 'closed' then raise exception 'Referral closed' using errcode = '42501'; end if;
  update public.referrals set image_consent = true, image_consented_at = now(), updated_at = now() where id = r.id;
  insert into public.audit_log(actor, action, entity, entity_id) values (auth.uid(), 'image_consent', 'referrals', r.id);
  return jsonb_build_object('image_consent', true, 'image_shared', false);
end;
$$;

create function private.confirm_image_upload(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare f uuid := private.worker_facility(); r public.referrals;
begin
  select * into r from public.referrals where id = p_id and from_facility = f for update;
  if not found then raise exception 'Referral unavailable' using errcode = '42501'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'referral-images' and name = p_id::text || '/image.jpg') then
    raise exception 'Image not uploaded' using errcode = '22023';
  end if;
  if not r.image_shared then
    update public.referrals set image_shared = true, updated_at = now() where id = r.id;
    insert into public.audit_log(actor, action, entity, entity_id) values (auth.uid(), 'image_upload', 'referrals', r.id);
  end if;
  return jsonb_build_object('image_consent', r.image_consent, 'image_shared', true);
end;
$$;

-- Logs a view, then lets the caller create a short signed URL within 5 minutes.
create function private.record_image_access(p_id uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare f uuid := private.receiver_facility(); r public.referrals;
begin
  select * into r from public.referrals where id = p_id and f in (from_facility, to_facility);
  if not found or not r.image_shared then return false; end if;
  if r.status = 'closed' and r.updated_at < now() - interval '60 days' then return false; end if;
  insert into public.audit_log(actor, action, entity, entity_id) values (auth.uid(), 'image_access', 'referrals', r.id);
  return true;
end;
$$;

-- For the scheduled deletion job (service role only).
create function public.referral_images_due_for_deletion() returns setof text language sql stable security definer set search_path = '' as $$
  select o.name from storage.objects o
  join public.referrals r on r.id = private.referral_of_path(o.name)
  where o.bucket_id = 'referral-images' and r.status = 'closed' and r.updated_at < now() - interval '60 days';
$$;

create function public.consent_image_share(p_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.consent_image_share(p_id); $$;
create function public.confirm_image_upload(p_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.confirm_image_upload(p_id); $$;
create function public.record_image_access(p_id uuid) returns boolean language sql security invoker set search_path = '' as $$ select private.record_image_access(p_id); $$;

revoke all on function private.referral_of_path(text), private.can_upload_referral_image(text), private.can_read_referral_image(text),
  private.consent_image_share(uuid), private.confirm_image_upload(uuid), private.record_image_access(uuid) from public, anon, authenticated;
grant execute on function private.referral_of_path(text), private.can_upload_referral_image(text), private.can_read_referral_image(text),
  private.consent_image_share(uuid), private.confirm_image_upload(uuid), private.record_image_access(uuid) to authenticated;
revoke all on function public.consent_image_share(uuid), public.confirm_image_upload(uuid), public.record_image_access(uuid),
  public.referral_images_due_for_deletion() from public, anon, authenticated;
grant execute on function public.consent_image_share(uuid), public.confirm_image_upload(uuid), public.record_image_access(uuid) to authenticated;
grant execute on function public.referral_images_due_for_deletion() to service_role;
