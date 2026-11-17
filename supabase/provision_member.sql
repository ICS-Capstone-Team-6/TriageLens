-- Run as the trusted project owner in Dashboard > SQL Editor after creating an Auth user.
-- Replace NULL with the user's UUID in quotes. No passwords belong in this file.
do $$
declare
  member_id uuid := null; -- e.g. 'the UUID from Authentication > Users'
  clinic_name text := 'FAKE Test Clinic A';
  clinic_id uuid;
begin
  if member_id is null then raise exception 'Set member_id to the Auth user UUID first'; end if;
  select id into clinic_id from public.facilities where name=clinic_name;
  if clinic_id is null then raise exception 'Unknown demo clinic: %',clinic_name; end if;
  update public.profiles set facility_id=clinic_id,role='health_worker',disabled_at=null where id=member_id;
  if not found then raise exception 'No profile found for Auth user %',member_id; end if;
end;
$$;
