-- E10-03 (ADR-22, ADR-28): referral record. A health worker refers a case from their
-- facility to another. Only the sending and the named receiving facility can see it
-- (hazard H14). The referral code is 8 characters: the person's initials typed by the
-- health worker (0 to 4 letters, the first letter of each name), then random characters
-- from an alphabet with no look-alikes. It is never sequential and expires after 60 days.
-- Initials are personal data and shorten the random part (4 random characters with 4
-- initials), so code lookup must stay limited to the receiving facility (ADR-28, H14). Status only moves
-- forward: created, seen, arrived, tested, closed (hazard H15). Every change writes a
-- referral_events row and an audit row (FR-17). Tables are reached only through RPCs.

create table public.referrals (
  id uuid primary key,
  case_id uuid not null references public.cases(id),
  from_facility uuid not null references public.facilities(id),
  to_facility uuid not null references public.facilities(id),
  created_by uuid not null references auth.users(id),
  initials text not null default '' check (initials ~ '^[A-Z]{0,4}$'),
  code text not null unique check (length(code) = 8 and code ~ '^[A-Z]{0,4}[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4,8}$'),
  status text not null default 'created' check (status in ('created','seen','arrived','tested','closed')),
  conditions text[] not null check (cardinality(conditions) between 1 and 3 and conditions <@ array['tb','pneumonia','dr']::text[]),
  urgency text check (urgency in ('same_day','days','weeks')),
  rules_version text not null check (length(rules_version) between 1 and 64),
  distance_band text check (distance_band in ('under_5','5_20','20_50','50_100','over_100')),
  image_shared boolean not null default false,
  expires_at timestamptz not null default now() + interval '60 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referrals_two_facilities check (from_facility <> to_facility),
  constraint referrals_code_starts_with_initials check (left(code, length(initials)) = initials)
);
create index referrals_from_idx on public.referrals(from_facility, created_at desc);
create index referrals_to_idx on public.referrals(to_facility, created_at desc);
create index referrals_case_idx on public.referrals(case_id);

create table public.referral_events (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id),
  status text not null check (status in ('created','seen','arrived','tested','closed')),
  actor uuid,
  note text not null default '' check (length(note) <= 500),
  occurred_at timestamptz not null default now()
);
create index referral_events_referral_idx on public.referral_events(referral_id, occurred_at);

alter table public.referrals enable row level security;
alter table public.referral_events enable row level security;
revoke all on public.referrals, public.referral_events from public, anon, authenticated;
grant all on public.referrals, public.referral_events to service_role;

create function private.referral_rank(s text) returns integer language sql immutable set search_path = '' as $$
  select array_position(array['created','seen','arrived','tested','closed']::text[], s);
$$;

-- Status never moves backwards, and identity fields never change.
create function private.referral_forward_only() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.case_id, new.from_facility, new.to_facility, new.created_by, new.initials, new.code, new.created_at)
     is distinct from (old.id, old.case_id, old.from_facility, old.to_facility, old.created_by, old.initials, old.code, old.created_at) then
    raise exception 'Referral identity fields are fixed' using errcode = '42501';
  end if;
  if private.referral_rank(new.status) < private.referral_rank(old.status) then
    raise exception 'Referral status cannot move backwards (% to %)', old.status, new.status using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger referral_forward_only before update on public.referrals for each row execute function private.referral_forward_only();
create trigger referral_no_delete before delete on public.referrals for each row execute function private.reject_mutation();
create trigger immutable_referral_events before update or delete on public.referral_events for each row execute function private.reject_mutation();

-- Initials, then random characters up to 8 in all. Random characters come from
-- gen_random_uuid() bytes over a 32-symbol alphabet (256 is a multiple of 32, so each is
-- uniform): 4 to 8 random characters, 20 to 40 bits. The table enforces uniqueness.
create function private.new_referral_code(p_initials text) returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  out text := coalesce(p_initials, ''); i integer;
begin
  for i in 0..(7 - length(out)) loop
    out := out || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return out;
end;
$$;

create function private.create_referral(p_referral jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f uuid := private.worker_facility(); k text; tries integer := 0;
  candidate public.referrals; saved public.referrals;
begin
  if jsonb_typeof(p_referral) is distinct from 'object' then raise exception 'Expected referral object' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_referral) loop
    if not (k = any(array['id','case_id','to_facility','conditions','urgency','rules_version','distance_band','initials'])) then
      raise exception 'Unsupported referral field: %', k using errcode = '22023';
    end if;
  end loop;
  candidate := jsonb_populate_record(null::public.referrals, p_referral);
  candidate.initials := coalesce(candidate.initials, '');
  if candidate.initials !~ '^[A-Z]{0,4}$' then raise exception 'Initials must be 0 to 4 capital letters' using errcode = '22023'; end if;
  if candidate.id is null or candidate.case_id is null or candidate.to_facility is null then
    raise exception 'id, case_id and to_facility are required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.cases where id = candidate.case_id and facility_id = f) then
    raise exception 'Case unavailable' using errcode = '42501';
  end if;
  if candidate.to_facility = f then raise exception 'Choose another facility' using errcode = '22023'; end if;
  if not exists (select 1 from public.facilities where id = candidate.to_facility) then
    raise exception 'Facility unavailable' using errcode = '22023';
  end if;

  -- Replays of the same referral are no-ops; the same id with different content is a conflict.
  select * into saved from public.referrals where id = candidate.id;
  if found then
    if saved.from_facility is distinct from f or
       (saved.case_id, saved.to_facility, saved.conditions, saved.urgency, saved.rules_version, saved.distance_band, saved.initials)
       is distinct from (candidate.case_id, candidate.to_facility, candidate.conditions, candidate.urgency, candidate.rules_version, candidate.distance_band, candidate.initials) then
      raise exception 'Referral id already used' using errcode = '22023';
    end if;
    return to_jsonb(saved);
  end if;

  loop
    begin
      insert into public.referrals(id, case_id, from_facility, to_facility, created_by, initials, code, conditions, urgency, rules_version, distance_band)
      values (candidate.id, candidate.case_id, f, candidate.to_facility, auth.uid(), candidate.initials, private.new_referral_code(candidate.initials),
              candidate.conditions, candidate.urgency, candidate.rules_version, candidate.distance_band)
      returning * into saved;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries >= 5 then raise; end if;
    end;
  end loop;
  insert into public.referral_events(referral_id, status, actor) values (saved.id, 'created', auth.uid());
  insert into public.audit_log(actor, action, entity, entity_id, meta)
  values (auth.uid(), 'insert', 'referrals', saved.id, jsonb_build_object('to_facility', saved.to_facility));
  return to_jsonb(saved);
exception when check_violation or not_null_violation or invalid_text_representation then
  raise exception 'Bad referral field' using errcode = '22023';
end;
$$;

-- Referrals the caller's facility sent ('sent') or received ('received'), newest first,
-- with facility names. Each listed referral is an audited access.
create function private.list_referrals(p_direction text, p_limit integer, p_offset integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f uuid := private.worker_facility(); r record; result jsonb := '[]';
begin
  if p_direction is null or p_direction not in ('sent','received') then
    raise exception 'Direction must be sent or received' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception 'Limit must be 1..100; offset must be nonnegative' using errcode = '22023';
  end if;
  for r in
    select x.*, fa.name as from_name, fb.name as to_name, fb.phone as to_phone
    from public.referrals x
    join public.facilities fa on fa.id = x.from_facility
    join public.facilities fb on fb.id = x.to_facility
    where (p_direction = 'sent' and x.from_facility = f) or (p_direction = 'received' and x.to_facility = f)
    order by x.created_at desc, x.id limit p_limit offset p_offset
  loop
    result := result || jsonb_build_array(jsonb_build_object(
      'id', r.id, 'case_id', r.case_id, 'code', r.code, 'initials', r.initials, 'status', r.status,
      'from_facility', r.from_facility, 'from_name', r.from_name,
      'to_facility', r.to_facility, 'to_name', r.to_name, 'to_phone', r.to_phone,
      'conditions', to_jsonb(r.conditions), 'urgency', r.urgency, 'rules_version', r.rules_version,
      'distance_band', r.distance_band, 'image_shared', r.image_shared,
      'expires_at', r.expires_at, 'created_at', r.created_at, 'updated_at', r.updated_at));
    insert into public.audit_log(actor, action, entity, entity_id) values (auth.uid(), 'access', 'referrals', r.id);
  end loop;
  return result;
end;
$$;

create function public.create_referral(p_referral jsonb) returns jsonb language sql security invoker set search_path = '' as $$
  select private.create_referral(p_referral);
$$;
create function public.list_referrals(p_direction text, p_limit integer default 50, p_offset integer default 0) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.list_referrals(p_direction, p_limit, p_offset);
$$;

revoke all on function private.referral_rank(text), private.referral_forward_only(), private.new_referral_code(text),
  private.create_referral(jsonb), private.list_referrals(text, integer, integer) from public, anon, authenticated;
grant execute on function private.create_referral(jsonb), private.list_referrals(text, integer, integer) to authenticated;
revoke all on function public.create_referral(jsonb), public.list_referrals(text, integer, integer) from public, anon;
grant execute on function public.create_referral(jsonb), public.list_referrals(text, integer, integer) to authenticated;
