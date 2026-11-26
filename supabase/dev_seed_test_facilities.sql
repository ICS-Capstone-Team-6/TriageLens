-- DEV/TEST ONLY. Run by the project owner in Dashboard > SQL Editor on the dev project, never in production.
-- Test facilities near Brekusu so the referral screens (facility list, map, distances, beds) can be tried.
--
-- What is real and what is not:
--  * Locations of the two TEST facilities are real map points taken from OpenStreetMap (Danfa Clinic,
--    Valley View University Hospital). Names are prefixed "TEST" so nobody mistakes them for real records.
--  * Services and beds are MADE-UP TEST VALUES. They were not scraped: no public source lists them, and
--    services_confirmed_at stays null on purpose (unconfirmed).
--  * Brekusu Clinic's point is APPROXIMATE: it is the Brekusu road end near Agyemanti, not the building.
--    Brekusu is not mapped as a facility in OpenStreetMap. Replace lat/lng with a surveyed point.
--  * No passwords here. Create the three Auth users first (Authentication > Users > Add user, tick
--    "Auto Confirm User", choose your own passwords), using the emails below, then run this file.
--  * No patient data.
--
--  * Opening hours and phone numbers are made up too (fictional +233 30 555 01xx numbers). Brekusu Clinic is
--    open Mon-Fri 08:00-17:00 and Sat 08:00-13:00; Valley View is open 24 hours.
--  * Brekusu Clinic's services and beds are made-up test values too (rapid TB test, chest X-ray, oxygen,
--    ambulance; 12 beds, 5 free). Re-running this file updates them in place.
--
-- Needs migrations up to 20261126120000_e10_10_facility_beds.sql applied first.
do $$
declare
  brekusu uuid; danfa uuid; valley uuid;
  missing text;
begin
  insert into public.facilities(name, district, region, lat, lng, phone, opening_hours, services, beds_total, beds_free, beds_updated_at, services_confirmed_at)
  values
    ('Brekusu Clinic',                          'Akuapem South', 'Eastern',  5.7834, -0.2089, '+233 30 555 0101', '{"mon":[["08:00","17:00"]],"tue":[["08:00","17:00"]],"wed":[["08:00","17:00"]],"thu":[["08:00","17:00"]],"fri":[["08:00","17:00"]],"sat":[["08:00","13:00"]]}'::jsonb, '{tb_rapid_test,chest_xray,oxygen,ambulance}',                          12, 5, now(), null),
    ('TEST Danfa Clinic',                       'Ga East',       'Greater Accra / Eastern border', 5.78945, -0.15954, '+233 30 555 0102', '{"mon":[["07:30","17:00"]],"tue":[["07:30","17:00"]],"wed":[["07:30","17:00"]],"thu":[["07:30","17:00"]],"fri":[["07:30","17:00"]],"sat":[["07:30","17:00"]]}'::jsonb, '{tb_rapid_test,chest_xray}',                   0,  0, null,  null),
    ('TEST Valley View University Hospital',    'Akuapem South', 'Eastern',  5.79806, -0.12592, '+233 30 555 0103', '{"always":true}'::jsonb, '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient,ambulance}', 40, 12, now(), null)
  on conflict (name) do update set
    lat = excluded.lat, lng = excluded.lng, phone = excluded.phone, opening_hours = excluded.opening_hours, services = excluded.services,
    beds_total = excluded.beds_total, beds_free = excluded.beds_free, beds_updated_at = excluded.beds_updated_at;

  select id into brekusu from public.facilities where name = 'Brekusu Clinic';
  select id into danfa   from public.facilities where name = 'TEST Danfa Clinic';
  select id into valley  from public.facilities where name = 'TEST Valley View University Hospital';

  -- Accounts: the Auth users must already exist. Admins can edit their own beds and services.
  select string_agg(e, ', ') into missing from unnest(array[
    'brekusu.worker.test@example.invalid', 'danfa.admin.test@example.invalid', 'valleyview.admin.test@example.invalid'
  ]) e where not exists (select 1 from auth.users u where u.email = e);
  if missing is not null then raise exception 'Create these Auth users first: %', missing; end if;

  update public.profiles set facility_id = brekusu, role = 'health_worker', disabled_at = null, display_name = 'Brekusu test worker'
    where id = (select id from auth.users where email = 'brekusu.worker.test@example.invalid');
  update public.profiles set facility_id = danfa, role = 'admin', disabled_at = null, display_name = 'Danfa test admin'
    where id = (select id from auth.users where email = 'danfa.admin.test@example.invalid');
  update public.profiles set facility_id = valley, role = 'admin', disabled_at = null, display_name = 'Valley View test admin'
    where id = (select id from auth.users where email = 'valleyview.admin.test@example.invalid');
end;
$$;

-- Check: expect three rows with locations, and the three accounts assigned.
select f.name, f.lat, f.lng, f.services, f.beds_total, f.beds_free from public.facilities f
  where f.name in ('Brekusu Clinic', 'TEST Danfa Clinic', 'TEST Valley View University Hospital') order by f.name;
