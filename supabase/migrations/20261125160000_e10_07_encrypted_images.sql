-- E10-07 follow-up (ADR-28 section 4): end-to-end encrypted referral images, plus the
-- heatmap. The server stores only ciphertext and wrapped keys; it cannot read either file.
--
--   facility_keys          one ECDH P-256 public key per facility, and its private key
--                          wrapped with the facility passphrase (PBKDF2 + AES-GCM, on the phone)
--   referral_image_keys    the referral's content key, wrapped for one facility
--                          (the receiving facility, and the sender when it has a key)
--   files                  '<referral_id>/image.enc' and optional '<referral_id>/heatmap.enc'
--
-- Only a facility admin sets the facility key, once. A maintainer can reset it, which
-- makes that facility's existing images unreadable (audited). Shape checks below stop a
-- private key ('d') from ever being stored in the public column.

create table public.facility_keys (
  facility_id uuid primary key references public.facilities(id),
  public_key jsonb not null check (
    public_key->>'kty' = 'EC' and public_key->>'crv' = 'P-256' and public_key ? 'x' and public_key ? 'y'
    and not (public_key ? 'd') and octet_length(public_key::text) <= 1024),
  wrapped_private_key jsonb not null check (
    (wrapped_private_key->>'v')::int = 1 and (wrapped_private_key->>'rounds')::int >= 100000
    and wrapped_private_key ? 'salt' and wrapped_private_key ? 'iv' and wrapped_private_key ? 'ct'
    and octet_length(wrapped_private_key::text) <= 4096),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.referral_image_keys (
  referral_id uuid not null references public.referrals(id),
  facility_id uuid not null references public.facilities(id),
  wrapped_key jsonb not null check (
    (wrapped_key->>'v')::int = 1 and wrapped_key->'epk'->>'crv' = 'P-256' and not (wrapped_key->'epk' ? 'd')
    and wrapped_key ? 'iv' and wrapped_key ? 'ct' and octet_length(wrapped_key::text) <= 2048),
  created_at timestamptz not null default now(),
  primary key (referral_id, facility_id)
);

alter table public.facility_keys enable row level security;
alter table public.referral_image_keys enable row level security;
revoke all on public.facility_keys, public.referral_image_keys from public, anon, authenticated;
grant all on public.facility_keys, public.referral_image_keys to service_role;
create trigger immutable_referral_image_keys before update or delete on public.referral_image_keys
  for each row execute function private.reject_mutation();

alter table public.referrals add column heatmap_shared boolean not null default false;

-- Encrypted files are opaque bytes; a 1600 px JPEG plus 28 bytes of IV and tag fits in 3 MB.
update storage.buckets set allowed_mime_types = array['application/octet-stream'], file_size_limit = 3145728
 where id = 'referral-images';

create or replace function private.referral_of_path(p_name text) returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(image|heatmap)\.enc$' then return null; end if;
  return split_part(p_name, '/', 1)::uuid;
end;
$$;

-- Facility keys ---------------------------------------------------------------------

create function private.set_facility_key(p_public jsonb, p_wrapped jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid() and role = 'admin' and disabled_at is null and facility_id is not null;
  if not found then raise exception 'Only a facility admin can set up image sharing' using errcode = '42501'; end if;
  if exists (select 1 from public.facility_keys where facility_id = me.facility_id) then
    raise exception 'This facility already has a key' using errcode = '22023';
  end if;
  insert into public.facility_keys(facility_id, public_key, wrapped_private_key, created_by)
  values (me.facility_id, p_public, p_wrapped, auth.uid());
  insert into public.audit_log(actor, action, entity, entity_id) values (auth.uid(), 'set_key', 'facilities', me.facility_id);
  return jsonb_build_object('facility_id', me.facility_id);
exception when check_violation or invalid_text_representation then
  raise exception 'Bad key format' using errcode = '22023';
end;
$$;

create function private.reset_facility_key(p_facility_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'maintainer' and disabled_at is null) then
    raise exception 'Only a maintainer can reset a facility key' using errcode = '42501';
  end if;
  delete from public.facility_keys where facility_id = p_facility_id;
  insert into public.audit_log(actor, action, entity, entity_id) values (auth.uid(), 'reset_key', 'facilities', p_facility_id);
end;
$$;

-- Public keys of the given facilities (for wrapping). Any active, assigned member.
create function private.facility_public_keys(p_ids uuid[]) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and facility_id is not null and disabled_at is null) then
    raise exception 'An active facility assignment is required' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) > 10 then raise exception 'At most 10 facilities' using errcode = '22023'; end if;
  return coalesce((select jsonb_object_agg(facility_id, public_key) from public.facility_keys where facility_id = any(p_ids)), '{}');
end;
$$;

-- The caller's own facility key, wrapped. Only members of that facility; unwrapping still needs the passphrase.
create function private.own_facility_key() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare f uuid; k public.facility_keys;
begin
  select facility_id into f from public.profiles
   where id = auth.uid() and role in ('health_worker','reviewer','admin') and disabled_at is null;
  if f is null then raise exception 'An active facility assignment is required' using errcode = '42501'; end if;
  select * into k from public.facility_keys where facility_id = f;
  if not found then return jsonb_build_object('facility_id', f, 'has_key', false); end if;
  return jsonb_build_object('facility_id', f, 'has_key', true, 'public_key', k.public_key, 'wrapped_private_key', k.wrapped_private_key);
end;
$$;

-- Upload confirmation, now with wrapped keys ----------------------------------------

drop function public.confirm_image_upload(uuid);
drop function private.confirm_image_upload(uuid);

-- p_keys: { "<facility_id>": <wrapped content key>, ... }. Must include the receiving
-- facility, and may include the sending facility; nothing else.
create function private.confirm_image_upload(p_id uuid, p_keys jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare f uuid := private.worker_facility(); r public.referrals; k text; has_heatmap boolean;
begin
  select * into r from public.referrals where id = p_id and from_facility = f for update;
  if not found then raise exception 'Referral unavailable' using errcode = '42501'; end if;
  if jsonb_typeof(p_keys) is distinct from 'object' or not (p_keys ? r.to_facility::text) then
    raise exception 'A key for the receiving facility is required' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_keys) loop
    if k not in (r.to_facility::text, r.from_facility::text) then
      raise exception 'Keys only for the two facilities' using errcode = '22023';
    end if;
  end loop;
  if not exists (select 1 from storage.objects where bucket_id = 'referral-images' and name = p_id::text || '/image.enc') then
    raise exception 'Image not uploaded' using errcode = '22023';
  end if;
  has_heatmap := exists (select 1 from storage.objects where bucket_id = 'referral-images' and name = p_id::text || '/heatmap.enc');
  insert into public.referral_image_keys(referral_id, facility_id, wrapped_key)
  select p_id, key::uuid, value from jsonb_each(p_keys)
  on conflict (referral_id, facility_id) do nothing;
  if not r.image_shared or (has_heatmap and not r.heatmap_shared) then
    update public.referrals set image_shared = true, heatmap_shared = has_heatmap, updated_at = now() where id = r.id;
    insert into public.audit_log(actor, action, entity, entity_id, meta)
    values (auth.uid(), 'image_upload', 'referrals', r.id, jsonb_build_object('heatmap', has_heatmap));
  end if;
  return jsonb_build_object('image_consent', r.image_consent, 'image_shared', true, 'heatmap_shared', has_heatmap);
exception when check_violation or invalid_text_representation then
  raise exception 'Bad key format' using errcode = '22023';
end;
$$;

-- Opening an image: logs the view (which unlocks storage reads for 5 minutes) and returns
-- the content key wrapped for the caller's facility.
drop function public.record_image_access(uuid);
drop function private.record_image_access(uuid);
create function private.open_referral_image(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare f uuid := private.receiver_facility(); r public.referrals; wk jsonb;
begin
  select * into r from public.referrals where id = p_id and f in (from_facility, to_facility);
  if not found or not r.image_shared then return null; end if;
  if r.status = 'closed' and r.updated_at < now() - interval '60 days' then return null; end if;
  select wrapped_key into wk from public.referral_image_keys where referral_id = r.id and facility_id = f;
  if wk is null then return jsonb_build_object('wrapped_key', null); end if;
  insert into public.audit_log(actor, action, entity, entity_id) values (auth.uid(), 'image_access', 'referrals', r.id);
  return jsonb_build_object('wrapped_key', wk, 'heatmap', r.heatmap_shared);
end;
$$;

create function public.set_facility_key(p_public jsonb, p_wrapped jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select private.set_facility_key(p_public, p_wrapped); $$;
create function public.reset_facility_key(p_facility_id uuid) returns void language sql security invoker set search_path = '' as $$ select private.reset_facility_key(p_facility_id); $$;
create function public.facility_public_keys(p_ids uuid[]) returns jsonb language sql security invoker set search_path = '' as $$ select private.facility_public_keys(p_ids); $$;
create function public.own_facility_key() returns jsonb language sql security invoker set search_path = '' as $$ select private.own_facility_key(); $$;
create function public.confirm_image_upload(p_id uuid, p_keys jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select private.confirm_image_upload(p_id, p_keys); $$;
create function public.open_referral_image(p_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.open_referral_image(p_id); $$;

revoke all on function private.set_facility_key(jsonb, jsonb), private.reset_facility_key(uuid), private.facility_public_keys(uuid[]),
  private.own_facility_key(), private.confirm_image_upload(uuid, jsonb), private.open_referral_image(uuid) from public, anon, authenticated;
grant execute on function private.set_facility_key(jsonb, jsonb), private.reset_facility_key(uuid), private.facility_public_keys(uuid[]),
  private.own_facility_key(), private.confirm_image_upload(uuid, jsonb), private.open_referral_image(uuid) to authenticated;
revoke all on function public.set_facility_key(jsonb, jsonb), public.reset_facility_key(uuid), public.facility_public_keys(uuid[]),
  public.own_facility_key(), public.confirm_image_upload(uuid, jsonb), public.open_referral_image(uuid) from public, anon;
grant execute on function public.set_facility_key(jsonb, jsonb), public.reset_facility_key(uuid), public.facility_public_keys(uuid[]),
  public.own_facility_key(), public.confirm_image_upload(uuid, jsonb), public.open_referral_image(uuid) to authenticated;
