-- E9-01: results-only Prosit 2 slice. Auth roles/facilities are provisioned by trusted admins.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 1 and 160),
  district text not null default '', region text not null default '',
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  facility_id uuid references public.facilities(id),
  role text not null default 'health_worker' check (role in ('health_worker','reviewer','admin','maintainer')),
  display_name text not null default 'Team member' check (length(display_name) <= 160),
  disabled_at timestamptz, created_at timestamptz not null default now()
);
create index profiles_facility_idx on public.profiles(facility_id);
create table public.cases (
  id uuid primary key,
  facility_id uuid not null references public.facilities(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  age_band text not null check (age_band in ('15-24','25-34','35-44','45-54','55-64','65+','unknown')),
  sex text check (sex in ('female','male','other','unknown')),
  symptoms jsonb not null default '{}' check (jsonb_typeof(symptoms) = 'object' and octet_length(symptoms::text) <= 8192),
  status text not null default 'open' check (status in ('open','referred','archived')),
  notes text not null default '' check (length(notes) <= 2000),
  client_version bigint not null check (client_version >= 1)
);
create index cases_facility_updated_idx on public.cases(facility_id, updated_at desc, id);
create index cases_creator_idx on public.cases(created_by);
create table public.inferences (
  id uuid primary key, case_id uuid not null references public.cases(id),
  model_name text not null check (length(model_name) between 1 and 128),
  model_version text not null check (length(model_version) between 1 and 128),
  thresholds_version text not null check (length(thresholds_version) between 1 and 128),
  outputs jsonb not null check (jsonb_typeof(outputs) = 'object' and octet_length(outputs::text) <= 16384),
  zone text not null check (zone in ('refer_now','unsure','low_risk','retake')),
  quality_scores jsonb not null check (jsonb_typeof(quality_scores) = 'object' and octet_length(quality_scores::text) <= 8192),
  latency_ms double precision not null check (latency_ms between 0 and 3600000),
  device_info jsonb not null default '{}' check (jsonb_typeof(device_info) = 'object' and octet_length(device_info::text) <= 4096),
  created_at timestamptz not null default now()
);
create index inferences_case_idx on public.inferences(case_id, created_at);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(), actor uuid,
  action text not null, entity text not null, entity_id uuid not null,
  occurred_at timestamptz not null default now(), meta jsonb not null default '{}'
);
create index audit_log_actor_time_idx on public.audit_log(actor, occurred_at desc);
create index audit_log_entity_idx on public.audit_log(entity, entity_id);

alter table public.facilities enable row level security;
alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.inferences enable row level security;
alter table public.audit_log enable row level security;
create policy profile_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy facility_member on public.facilities for select to authenticated using (
  id in (select facility_id from public.profiles where id = (select auth.uid()) and disabled_at is null)
);
create policy case_worker_read on public.cases for select to authenticated using (
  facility_id in (select facility_id from public.profiles where id = (select auth.uid()) and role = 'health_worker' and disabled_at is null)
);
create policy case_worker_insert on public.cases for insert to authenticated with check (
  created_by = (select auth.uid()) and facility_id in (select facility_id from public.profiles where id = (select auth.uid()) and role = 'health_worker' and disabled_at is null)
);
create policy case_worker_update on public.cases for update to authenticated using (
  facility_id in (select facility_id from public.profiles where id = (select auth.uid()) and role = 'health_worker' and disabled_at is null)
) with check (
  facility_id in (select facility_id from public.profiles where id = (select auth.uid()) and role = 'health_worker' and disabled_at is null)
);
create policy inference_worker_read on public.inferences for select to authenticated using (
  exists (select 1 from public.cases c where c.id = case_id)
);
create policy audit_admin_read on public.audit_log for select to authenticated using (
  exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('admin','maintainer') and disabled_at is null)
);
-- Case data goes through audited RPCs. Direct REST access must not bypass access logging.
revoke all on public.facilities, public.profiles, public.cases, public.inferences, public.audit_log from public, anon, authenticated;
grant select on public.facilities, public.profiles, public.audit_log to authenticated;
grant all on public.facilities, public.profiles, public.cases, public.inferences, public.audit_log to service_role;

create function private.worker_facility() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare f uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select facility_id into f from public.profiles where id = auth.uid() and role = 'health_worker' and disabled_at is null;
  if f is null then raise exception 'An active health-worker facility assignment is required' using errcode = '42501'; end if;
  return f;
end;
$$;
create function private.bootstrap_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id);
  return new;
end;
$$;
create trigger triagelens_profile_created after insert on auth.users for each row execute function private.bootstrap_profile();
create function private.audit_sign_in() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log(actor, action, entity, entity_id) values (new.user_id, 'sign_in', 'session', new.id);
  return new;
end;
$$;
create trigger triagelens_sign_in after insert on auth.sessions for each row execute function private.audit_sign_in();
create function private.audit_write() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log(actor, action, entity, entity_id)
  values (auth.uid(), lower(tg_op), tg_table_name, new.id);
  return new;
end;
$$;
create trigger case_write_audit after insert or update on public.cases for each row execute function private.audit_write();
create trigger inference_write_audit after insert on public.inferences for each row execute function private.audit_write();
create function private.reject_mutation() returns trigger language plpgsql set search_path = '' as $$
begin raise exception '% is append-only', tg_table_name using errcode = '42501'; end;
$$;
create trigger immutable_inferences before update or delete on public.inferences for each row execute function private.reject_mutation();
create trigger immutable_audit before update or delete on public.audit_log for each row execute function private.reject_mutation();

create function private.save_case(p_case jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare f uuid := private.worker_facility(); candidate public.cases; saved public.cases; k text;
begin
  if jsonb_typeof(p_case) is distinct from 'object' then raise exception 'Expected case object' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_case) loop
    if not (k = any(array['id','age_band','sex','symptoms','status','notes','client_version'])) then
      raise exception 'Unsupported case field: %', k using errcode = '22023';
    end if;
  end loop;
  candidate := jsonb_populate_record(null::public.cases, p_case);
  candidate.facility_id := f; candidate.created_by := auth.uid();
  candidate.created_at := now(); candidate.updated_at := now();
  candidate.symptoms := coalesce(candidate.symptoms, '{}');
  candidate.status := coalesce(candidate.status, 'open'); candidate.notes := coalesce(candidate.notes, '');
  insert into public.cases select (candidate).* on conflict (id) do nothing returning * into saved;
  if found then return to_jsonb(saved); end if;
  select * into saved from public.cases where id = candidate.id for update;
  if saved.facility_id is distinct from f then raise exception 'Case unavailable' using errcode = '42501'; end if;
  -- Replays are no-ops; a reused version with different content is an explicit conflict.
  if candidate.client_version <= saved.client_version then
    if candidate.client_version = saved.client_version and
       (candidate.age_band, candidate.sex, candidate.symptoms, candidate.status, candidate.notes) is distinct from
       (saved.age_band, saved.sex, saved.symptoms, saved.status, saved.notes) then
      raise exception 'Version conflict: increment client_version' using errcode = '22023';
    end if;
    return to_jsonb(saved);
  end if;
  update public.cases set age_band = candidate.age_band, sex = candidate.sex, symptoms = candidate.symptoms,
    status = candidate.status, notes = candidate.notes, client_version = candidate.client_version, updated_at = now()
  where id = saved.id returning * into saved;
  return to_jsonb(saved);
end;
$$;
create function private.append_inference(p_inference jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare f uuid := private.worker_facility(); candidate public.inferences; saved public.inferences; k text;
begin
  if jsonb_typeof(p_inference) is distinct from 'object' then raise exception 'Expected inference object' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_inference) loop
    if not (k = any(array['id','case_id','model_name','model_version','thresholds_version','outputs','zone','quality_scores','latency_ms','device_info'])) then
      raise exception 'Unsupported inference field: %', k using errcode = '22023';
    end if;
  end loop;
  candidate := jsonb_populate_record(null::public.inferences, p_inference);
  candidate.device_info := coalesce(candidate.device_info, '{}'); candidate.created_at := now();
  if not exists (select 1 from public.cases where id = candidate.case_id and facility_id = f) then
    raise exception 'Case unavailable' using errcode = '42501';
  end if;
  insert into public.inferences select (candidate).* on conflict (id) do nothing returning * into saved;
  if found then return to_jsonb(saved); end if;
  select * into saved from public.inferences where id = candidate.id;
  if (to_jsonb(saved) - 'created_at') is distinct from (to_jsonb(candidate) - 'created_at') then
    raise exception 'Inference is immutable; use a new UUID for a new result' using errcode = '22023';
  end if;
  return to_jsonb(saved);
end;
$$;
create function private.get_case(p_case_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare f uuid := private.worker_facility(); c public.cases; result jsonb;
begin
  select * into c from public.cases where id = p_case_id and facility_id = f;
  if not found then return null; end if;
  select jsonb_build_object('case', to_jsonb(c), 'inferences', coalesce(jsonb_agg(to_jsonb(i) order by i.created_at, i.id), '[]'))
    into result from public.inferences i where i.case_id = c.id;
  insert into public.audit_log(actor, action, entity, entity_id) values (auth.uid(), 'access', 'cases', c.id);
  return result;
end;
$$;
create function private.list_cases(p_limit integer, p_offset integer) returns jsonb language plpgsql security definer set search_path = '' as $$
declare f uuid := private.worker_facility(); c public.cases; result jsonb := '[]';
begin
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception 'Limit must be 1..100; offset must be nonnegative' using errcode = '22023';
  end if;
  for c in select * from public.cases where facility_id = f order by updated_at desc, id limit p_limit offset p_offset loop
    result := result || jsonb_build_array(to_jsonb(c));
    insert into public.audit_log(actor, action, entity, entity_id) values (auth.uid(), 'access', 'cases', c.id);
  end loop;
  return result;
end;
$$;

create function public.save_case(p_case jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select private.save_case(p_case); $$;
create function public.append_inference(p_inference jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select private.append_inference(p_inference); $$;
create function public.get_case(p_case_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.get_case(p_case_id); $$;
create function public.list_cases(p_limit integer default 50, p_offset integer default 0) returns jsonb language sql security invoker set search_path = '' as $$ select private.list_cases(p_limit, p_offset); $$;
-- Trigger functions cannot be called directly. Only the five checked private functions are executable by signed-in callers.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.worker_facility(), private.save_case(jsonb), private.append_inference(jsonb), private.get_case(uuid), private.list_cases(integer,integer) to authenticated;
revoke all on function public.save_case(jsonb), public.append_inference(jsonb), public.get_case(uuid), public.list_cases(integer,integer) from public, anon;
grant execute on function public.save_case(jsonb), public.append_inference(jsonb), public.get_case(uuid), public.list_cases(integer,integer) to authenticated;
