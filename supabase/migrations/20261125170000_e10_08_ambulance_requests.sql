-- E10-08 (ADR-28 section 5): ambulance request from the referring clinic to the receiving
-- facility, which marks it seen, then dispatched or cannot send.
--
-- Safety rules (H18, H19):
--   * The app never decides that someone needs an ambulance; the health worker does and
--     must give a reason. This table only carries the request.
--   * A request is never queued offline: the app refuses it at once and shows the call
--     button. The database therefore only accepts a request made now.
--   * One open request per referral. Status only moves forward. The sender may cancel
--     while it is open. Every change is audited.
--   * "Not seen in 10 minutes" is computed from created_at and seen_at.

create table public.ambulance_requests (
  id uuid primary key,
  referral_id uuid not null references public.referrals(id),
  from_facility uuid not null references public.facilities(id),
  to_facility uuid not null references public.facilities(id),
  created_by uuid not null references auth.users(id),
  reason text not null check (reason in ('cannot_walk','breathing_hard','very_weak','confused','other')),
  note text not null default '' check (length(note) <= 300),
  status text not null default 'requested' check (status in ('requested','seen','dispatched','cannot_send','cancelled')),
  eta_minutes integer check (eta_minutes between 1 and 600),
  answer_note text not null default '' check (length(answer_note) <= 300),
  answered_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  answered_at timestamptz,
  constraint ambulance_other_needs_note check (reason <> 'other' or length(trim(note)) > 0),
  constraint ambulance_eta_with_dispatch check (eta_minutes is null or status = 'dispatched')
);
create unique index ambulance_one_open_per_referral on public.ambulance_requests(referral_id) where status in ('requested','seen');
create index ambulance_to_open_idx on public.ambulance_requests(to_facility, created_at desc);
create index ambulance_from_idx on public.ambulance_requests(from_facility, created_at desc);

alter table public.ambulance_requests enable row level security;
revoke all on public.ambulance_requests from public, anon, authenticated;
grant all on public.ambulance_requests to service_role;
create trigger ambulance_no_delete before delete on public.ambulance_requests for each row execute function private.reject_mutation();

create function private.ambulance_rank(s text) returns integer language sql immutable set search_path = '' as $$
  select case s when 'requested' then 1 when 'seen' then 2 else 3 end;
$$;
create function private.ambulance_forward_only() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.referral_id, new.from_facility, new.to_facility, new.created_by, new.reason, new.note, new.created_at)
     is distinct from (old.id, old.referral_id, old.from_facility, old.to_facility, old.created_by, old.reason, old.note, old.created_at) then
    raise exception 'Request details are fixed' using errcode = '42501';
  end if;
  if private.ambulance_rank(old.status) = 3 and new.status is distinct from old.status then
    raise exception 'This request is already closed' using errcode = '42501';
  end if;
  if private.ambulance_rank(new.status) < private.ambulance_rank(old.status) then
    raise exception 'Request status cannot move backwards' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger ambulance_forward_only before update on public.ambulance_requests for each row execute function private.ambulance_forward_only();

create function private.ambulance_json(a public.ambulance_requests) returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(a) || jsonb_build_object(
    'code', (select code from public.referrals where id = a.referral_id),
    'initials', (select initials from public.referrals where id = a.referral_id),
    'from_name', (select name from public.facilities where id = a.from_facility),
    'from_phone', (select phone from public.facilities where id = a.from_facility),
    'to_name', (select name from public.facilities where id = a.to_facility),
    'to_phone', (select phone from public.facilities where id = a.to_facility));
$$;

create function private.request_ambulance(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare f uuid := private.worker_facility(); r public.referrals; a public.ambulance_requests; k text;
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'Expected request object' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('id','referral_id','reason','note') then raise exception 'Unsupported field: %', k using errcode = '22023'; end if;
  end loop;
  select * into r from public.referrals where id = (p->>'referral_id')::uuid and from_facility = f;
  if not found then raise exception 'Referral unavailable' using errcode = '42501'; end if;
  if r.status = 'closed' or r.expires_at <= now() then raise exception 'Referral closed' using errcode = '42501'; end if;
  select * into a from public.ambulance_requests where id = (p->>'id')::uuid;
  if found then
    if a.referral_id <> r.id or a.reason <> p->>'reason' or a.note <> coalesce(p->>'note','') then
      raise exception 'Request id already used' using errcode = '22023';
    end if;
    return private.ambulance_json(a);
  end if;
  insert into public.ambulance_requests(id, referral_id, from_facility, to_facility, created_by, reason, note)
  values ((p->>'id')::uuid, r.id, f, r.to_facility, auth.uid(), p->>'reason', coalesce(p->>'note',''))
  returning * into a;
  insert into public.audit_log(actor, action, entity, entity_id, meta)
  values (auth.uid(), 'insert', 'ambulance_requests', a.id, jsonb_build_object('referral_id', r.id, 'to_facility', r.to_facility));
  return private.ambulance_json(a);
exception
  when unique_violation then raise exception 'An ambulance request for this referral is already open' using errcode = '22023';
  when check_violation or invalid_text_representation or not_null_violation then raise exception 'Bad request field' using errcode = '22023';
end;
$$;

-- Receiver answers: seen, dispatched (with an ETA) or cannot_send (with a note).
create function private.answer_ambulance(p_id uuid, p_status text, p_eta integer, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f uuid := private.receiver_facility(); a public.ambulance_requests;
begin
  select * into a from public.ambulance_requests where id = p_id and to_facility = f for update;
  if not found then raise exception 'Request unavailable' using errcode = '42501'; end if;
  if p_status not in ('seen','dispatched','cannot_send') then raise exception 'Unknown status' using errcode = '22023'; end if;
  if p_status = 'dispatched' and p_eta is null then raise exception 'Give an estimated time' using errcode = '22023'; end if;
  if p_status = 'cannot_send' and length(trim(coalesce(p_note,''))) = 0 then raise exception 'Say why, so the clinic can act' using errcode = '22023'; end if;
  if p_status = a.status then return private.ambulance_json(a); end if; -- safe replay
  update public.ambulance_requests set
    status = p_status,
    seen_at = coalesce(seen_at, now()),
    eta_minutes = case when p_status = 'dispatched' then p_eta else null end,
    answer_note = coalesce(p_note, ''),
    answered_by = case when p_status = 'seen' then answered_by else auth.uid() end,
    answered_at = case when p_status = 'seen' then answered_at else now() end
  where id = a.id returning * into a;
  insert into public.audit_log(actor, action, entity, entity_id, meta)
  values (auth.uid(), 'update', 'ambulance_requests', a.id, jsonb_build_object('status', p_status, 'eta_minutes', p_eta));
  return private.ambulance_json(a);
exception when check_violation then raise exception 'Bad answer' using errcode = '22023';
end;
$$;

create function private.cancel_ambulance(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare f uuid := private.worker_facility(); a public.ambulance_requests;
begin
  select * into a from public.ambulance_requests where id = p_id and from_facility = f for update;
  if not found then raise exception 'Request unavailable' using errcode = '42501'; end if;
  if a.status = 'cancelled' then return private.ambulance_json(a); end if;
  update public.ambulance_requests set status = 'cancelled', answered_by = auth.uid(), answered_at = now()
   where id = a.id returning * into a;
  insert into public.audit_log(actor, action, entity, entity_id, meta)
  values (auth.uid(), 'update', 'ambulance_requests', a.id, '{"status":"cancelled"}');
  return private.ambulance_json(a);
end;
$$;

-- 'received': this facility's queue (open first); 'sent': requests this facility made.
create function private.list_ambulance_requests(p_direction text, p_limit integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f uuid := private.receiver_facility(); a public.ambulance_requests; result jsonb := '[]';
begin
  if p_direction not in ('sent','received') then raise exception 'Direction must be sent or received' using errcode = '22023'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Limit must be 1..100' using errcode = '22023'; end if;
  for a in
    select * from public.ambulance_requests
     where (p_direction = 'received' and to_facility = f) or (p_direction = 'sent' and from_facility = f)
     order by (status in ('requested','seen')) desc, created_at desc limit p_limit
  loop
    result := result || jsonb_build_array(private.ambulance_json(a));
  end loop;
  return result;
end;
$$;

create function public.request_ambulance(p jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select private.request_ambulance(p); $$;
create function public.answer_ambulance(p_id uuid, p_status text, p_eta integer default null, p_note text default null) returns jsonb
language sql security invoker set search_path = '' as $$ select private.answer_ambulance(p_id, p_status, p_eta, p_note); $$;
create function public.cancel_ambulance(p_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.cancel_ambulance(p_id); $$;
create function public.list_ambulance_requests(p_direction text, p_limit integer default 50) returns jsonb
language sql security invoker set search_path = '' as $$ select private.list_ambulance_requests(p_direction, p_limit); $$;

revoke all on function private.ambulance_rank(text), private.ambulance_forward_only(), private.ambulance_json(public.ambulance_requests),
  private.request_ambulance(jsonb), private.answer_ambulance(uuid, text, integer, text), private.cancel_ambulance(uuid),
  private.list_ambulance_requests(text, integer) from public, anon, authenticated;
grant execute on function private.request_ambulance(jsonb), private.answer_ambulance(uuid, text, integer, text),
  private.cancel_ambulance(uuid), private.list_ambulance_requests(text, integer) to authenticated;
revoke all on function public.request_ambulance(jsonb), public.answer_ambulance(uuid, text, integer, text),
  public.cancel_ambulance(uuid), public.list_ambulance_requests(text, integer) from public, anon;
grant execute on function public.request_ambulance(jsonb), public.answer_ambulance(uuid, text, integer, text),
  public.cancel_ambulance(uuid), public.list_ambulance_requests(text, integer) to authenticated;
