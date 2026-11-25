-- E10-04 (ADR-22, ADR-28): the receiving facility looks a referral up by code, sees the
-- case, marks arrival and records the confirmation test outcome; the outcome goes back
-- to the sender (closed loop).
--
-- Guessing (H14, ADR-28 3a): a code with 4 initials has only 4 random characters. So:
--   * only a signed-in member of the named receiving facility can look a code up;
--   * a code past its expiry date is not found;
--   * after 10 failed lookups in 15 minutes the caller is refused for the rest of that window;
--   * every lookup, found or not, writes an audit row.
-- Only the receiving facility moves the status (H15); it only moves forward.

alter table public.referrals
  add column outcome text check (outcome in ('confirmed','not_confirmed','not_done')),
  add column outcome_at timestamptz,
  add constraint referrals_outcome_needs_tested check (outcome is null or status in ('tested','closed'));

-- Health workers and reviewers at a facility can receive. Admins and maintainers cannot read case data.
create function private.receiver_facility() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare f uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select facility_id into f from public.profiles
   where id = auth.uid() and role in ('health_worker','reviewer') and disabled_at is null;
  if f is null then raise exception 'An active facility assignment is required' using errcode = '42501'; end if;
  return f;
end;
$$;

-- The case behind a referral: summary fields only, plus results with their versions.
create function private.referral_detail(r public.referrals) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'referral', to_jsonb(r) || jsonb_build_object(
      'from_name', (select name from public.facilities where id = r.from_facility),
      'from_phone', (select phone from public.facilities where id = r.from_facility),
      'to_name', (select name from public.facilities where id = r.to_facility),
      'to_phone', (select phone from public.facilities where id = r.to_facility)),
    'case', (select jsonb_build_object('age_band', c.age_band, 'sex', c.sex, 'symptoms', c.symptoms, 'created_at', c.created_at)
               from public.cases c where c.id = r.case_id),
    'inferences', coalesce((select jsonb_agg(jsonb_build_object(
        'model_name', i.model_name, 'model_version', i.model_version, 'thresholds_version', i.thresholds_version,
        'zone', i.zone, 'outputs', i.outputs, 'quality_scores', i.quality_scores, 'created_at', i.created_at)
        order by i.created_at) from public.inferences i where i.case_id = r.case_id), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'occurred_at', e.occurred_at)
        order by e.occurred_at, e.id) from public.referral_events e where e.referral_id = r.id), '[]'));
$$;

create function private.lookup_referral(p_code text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare f uuid := private.receiver_facility(); v_code text; r public.referrals; fails integer;
begin
  select count(*) into fails from public.audit_log
   where actor = auth.uid() and action = 'lookup_failed' and occurred_at > now() - interval '15 minutes';
  if fails >= 10 then raise exception 'Too many tries. Wait 15 minutes, then try again.' using errcode = '42501'; end if;
  v_code := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  select * into r from public.referrals
   where code = v_code and to_facility = f and expires_at > now();
  if not found then
    insert into public.audit_log(actor, action, entity, entity_id, meta)
    values (auth.uid(), 'lookup_failed', 'referrals', auth.uid(), jsonb_build_object('length', length(v_code)));
    return null;
  end if;
  if r.status = 'created' then
    update public.referrals set status = 'seen', updated_at = now() where id = r.id returning * into r;
    insert into public.referral_events(referral_id, status, actor) values (r.id, 'seen', auth.uid());
  end if;
  insert into public.audit_log(actor, action, entity, entity_id) values (auth.uid(), 'access', 'referrals', r.id);
  return private.referral_detail(r);
end;
$$;

-- Open a referral from the inbox or the sent list: sender or receiver only.
create function private.get_referral(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare f uuid := private.receiver_facility(); r public.referrals;
begin
  select * into r from public.referrals where id = p_id and (from_facility = f or to_facility = f);
  if not found then return null; end if;
  if r.to_facility = f and r.status = 'created' then
    update public.referrals set status = 'seen', updated_at = now() where id = r.id returning * into r;
    insert into public.referral_events(referral_id, status, actor) values (r.id, 'seen', auth.uid());
  end if;
  insert into public.audit_log(actor, action, entity, entity_id) values (auth.uid(), 'access', 'referrals', r.id);
  return private.referral_detail(r);
end;
$$;

-- Receiver moves the status forward. 'tested' needs an outcome. Repeating the current
-- status with the same outcome is a safe replay; anything backwards is refused.
create function private.advance_referral(p_id uuid, p_status text, p_outcome text, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f uuid := private.receiver_facility(); r public.referrals;
begin
  select * into r from public.referrals where id = p_id and to_facility = f for update;
  if not found then raise exception 'Referral unavailable' using errcode = '42501'; end if;
  if p_status is null or private.referral_rank(p_status) is null or p_status = 'created' then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  if p_status = 'tested' and p_outcome is null then raise exception 'A test outcome is required' using errcode = '22023'; end if;
  if p_status <> 'tested' and p_outcome is not null then raise exception 'Outcome goes with tested only' using errcode = '22023'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'Note too long' using errcode = '22023'; end if;
  if p_status = r.status and p_outcome is not distinct from r.outcome then
    return private.referral_detail(r);
  end if;
  if private.referral_rank(p_status) <= private.referral_rank(r.status) then
    raise exception 'Referral status cannot move backwards' using errcode = '42501';
  end if;
  if r.expires_at <= now() and p_status <> 'closed' then
    raise exception 'Referral expired; it can only be closed' using errcode = '42501';
  end if;
  update public.referrals set
    status = p_status,
    outcome = coalesce(p_outcome, outcome),
    outcome_at = case when p_outcome is not null then now() else outcome_at end,
    updated_at = now()
  where id = r.id returning * into r;
  insert into public.referral_events(referral_id, status, actor, note) values (r.id, p_status, auth.uid(), coalesce(p_note, ''));
  insert into public.audit_log(actor, action, entity, entity_id, meta)
  values (auth.uid(), 'update', 'referrals', r.id, jsonb_build_object('status', p_status, 'outcome', p_outcome));
  return private.referral_detail(r);
exception when check_violation then
  raise exception 'Bad outcome' using errcode = '22023';
end;
$$;

-- Reviewers at a receiving facility also need the received list, so list_referrals now
-- uses receiver_facility() and returns the outcome.
create or replace function private.list_referrals(p_direction text, p_limit integer, p_offset integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f uuid := private.receiver_facility(); r record; result jsonb := '[]';
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
      'outcome', r.outcome, 'outcome_at', r.outcome_at,
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

create function public.lookup_referral(p_code text) returns jsonb language sql security invoker set search_path = '' as $$
  select private.lookup_referral(p_code);
$$;
create function public.get_referral(p_id uuid) returns jsonb language sql security invoker set search_path = '' as $$
  select private.get_referral(p_id);
$$;
create function public.advance_referral(p_id uuid, p_status text, p_outcome text default null, p_note text default null) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.advance_referral(p_id, p_status, p_outcome, p_note);
$$;

revoke all on function private.receiver_facility(), private.referral_detail(public.referrals), private.lookup_referral(text),
  private.get_referral(uuid), private.advance_referral(uuid, text, text, text) from public, anon, authenticated;
grant execute on function private.receiver_facility(), private.lookup_referral(text), private.get_referral(uuid),
  private.advance_referral(uuid, text, text, text) to authenticated;
revoke all on function public.lookup_referral(text), public.get_referral(uuid), public.advance_referral(uuid, text, text, text) from public, anon;
grant execute on function public.lookup_referral(text), public.get_referral(uuid), public.advance_referral(uuid, text, text, text) to authenticated;
