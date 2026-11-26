-- DEV/TEST ONLY. Run in Dashboard > SQL Editor on the dev project, after dev_seed_test_facilities.sql.
-- 20 more facilities around Brekusu, for trying the facility list, map, distances, services and beds.
--
--  * LOCATIONS are real: each point is the hospital's position on OpenStreetMap (named hospitals within
--    30 km of Brekusu, spread from about 8 km to 28 km away).
--  * EVERYTHING ELSE IS MADE UP: services, bed counts, and how old the bed count is. They are not the
--    hospitals' real figures. Names carry the prefix "TEST" so nobody reads them as real records.
--  * Mix on purpose: 4 large hospitals (all services, 180 to 400 beds), 9 district hospitals, 7 community
--    hospitals (some outpatient only with 0 beds). Bed states covered: plenty free, nearly full (2 or
--    fewer free and a fresh count, which blocks a new referral), an old count (over 24 h, so "call first"),
--    no date, and no beds listed.
--  * Opening hours and phone numbers are made up too, in the shape of real ones: hospitals with emergency
--    care are open 24 hours; district and community facilities keep weekday or evening hours, so some show
--    "Closed now" depending on when you test. Phone numbers are fictional (+233 30 555 01xx).
--  * services_confirmed_at stays null (unconfirmed). No patient data.
insert into public.facilities(name, district, region, lat, lng, phone, opening_hours, services, beds_total, beds_free, beds_updated_at)
values
    ('TEST Korle Bu Teaching Hospital', '', 'Greater Accra', 5.53808, -0.22720, '+233 30 555 0110', '{"always":true}'::jsonb, '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient,eye_clinic,ambulance,retina_laser,retina_injection}', 300, 52, now() - interval '1 hours'),
    ('TEST 37 Military Hospital', '', 'Greater Accra', 5.58827, -0.18559, '+233 30 555 0111', '{"always":true}'::jsonb, '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient,eye_clinic,ambulance,retina_laser,retina_injection}', 180, 48, now() - interval '6 hours'),
    ('TEST Ridge Hospital', '', 'Greater Accra', 5.56230, -0.19939, '+233 30 555 0112', '{"always":true}'::jsonb, '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient,eye_clinic,ambulance,retina_laser,retina_injection}', 220, 18, now() - interval '3 hours'),
    ('TEST Tema General Hospital', '', 'Greater Accra', 5.67422, -0.02516, '+233 30 555 0113', '{"always":true}'::jsonb, '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient,eye_clinic,ambulance}', 220, 56, now() - interval '6 hours'),
    ('TEST University of Ghana Hospital', '', 'Greater Accra', 5.65185, -0.17811, '+233 30 555 0114', '{"mon":[["07:30","17:00"]],"tue":[["07:30","17:00"]],"wed":[["07:30","17:00"]],"thu":[["07:30","17:00"]],"fri":[["07:30","17:00"]],"sat":[["08:00","13:00"]]}'::jsonb, '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient,ambulance,eye_clinic}', 80, 23, now() - interval '20 hours'),
    ('TEST Ga North Municipal Hospital', '', 'Greater Accra', 5.65532, -0.27780, '+233 30 555 0115', '{"always":true}'::jsonb, '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient,ambulance,eye_clinic}', 80, 1, now() - interval '2 hours'),
    ('TEST Achimota Hospital', '', 'Greater Accra', 5.62974, -0.21726, '+233 30 555 0116', '{"mon":[["06:00","22:00"]],"tue":[["06:00","22:00"]],"wed":[["06:00","22:00"]],"thu":[["06:00","22:00"]],"fri":[["06:00","22:00"]],"sat":[["06:00","22:00"]],"sun":[["06:00","22:00"]]}'::jsonb, '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient}', 120, 24, now() - interval '20 hours'),
    ('TEST Shai Osudoku New District Hospital', '', 'Greater Accra', 5.89887, -0.09148, '+233 30 555 0117', '{"always":true}'::jsonb, '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient,ambulance}', 60, 0, now() - interval '10 hours'),
    ('TEST Mamobi General Hospital', '', 'Greater Accra', 5.59136, -0.19909, '+233 30 555 0118', '{"always":true}'::jsonb, '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient,ambulance,eye_clinic}', 100, 0, now() - interval '30 hours'),
    ('TEST Weija-Gbawe Municipal Hospital', '', 'Greater Accra', 5.56515, -0.29035, '+233 30 555 0119', '{"always":true}'::jsonb, '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient,eye_clinic}', 120, 22, now() - interval '5 hours'),
    ('TEST Tetteh Quarshie Hospital', '', 'Greater Accra', 5.92164, -0.13237, '+233 30 555 0120', '{"mon":[["07:00","20:00"]],"tue":[["07:00","20:00"]],"wed":[["07:00","20:00"]],"thu":[["07:00","20:00"]],"fri":[["07:00","20:00"]],"sat":[["07:00","20:00"]]}'::jsonb, '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient}', 100, 6, now() - interval '20 hours'),
    ('TEST Amasaman Hospital', '', 'Greater Accra', 5.70192, -0.29935, '+233 30 555 0121', '{"always":true}'::jsonb, '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient,ambulance}', 60, 2, now() - interval '5 hours'),
    ('TEST Ashaiman Community Hospital', '', 'Greater Accra', 5.71087, -0.03708, '+233 30 555 0122', '{"mon":[["07:00","19:00"]],"tue":[["07:00","19:00"]],"wed":[["07:00","19:00"]],"thu":[["07:00","19:00"]],"fri":[["07:00","19:00"]],"sat":[["07:00","19:00"]]}'::jsonb, '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient}', 80, 15, null),
    ('TEST Greater Grace Hospital', '', 'Greater Accra', 5.71849, -0.17410, '+233 30 555 0123', '{"mon":[["07:00","21:00"]],"tue":[["07:00","21:00"]],"wed":[["07:00","21:00"]],"thu":[["07:00","21:00"]],"fri":[["07:00","21:00"]],"sat":[["07:00","21:00"]],"sun":[["07:00","21:00"]]}'::jsonb, '{tb_rapid_test}', 0, 0, null),
    ('TEST Mother-Love Hospital', '', 'Greater Accra', 5.71655, -0.16636, '+233 30 555 0124', '{"always":true}'::jsonb, '{tb_rapid_test,oxygen,chest_xray}', 20, 1, now() - interval '30 hours'),
    ('TEST Ashongman Community Hospital', '', 'Greater Accra', 5.68536, -0.23181, '+233 30 555 0125', '{"mon":[["08:00","17:00"]],"tue":[["08:00","17:00"]],"wed":[["08:00","17:00"]],"thu":[["08:00","17:00"]],"fri":[["08:00","17:00"]]}'::jsonb, '{tb_rapid_test,oxygen,chest_xray}', 0, 0, null),
    ('TEST North Legon Hospital', '', 'Greater Accra', 5.66942, -0.18245, '+233 30 555 0126', '{"mon":[["08:00","18:00"]],"tue":[["08:00","18:00"]],"wed":[["08:00","18:00"]],"thu":[["08:00","18:00"]],"fri":[["08:00","18:00"]],"sat":[["08:00","18:00"]]}'::jsonb, '{tb_rapid_test}', 20, 2, now() - interval '3 hours'),
    ('TEST Ghana Atomic Energy Commission Hospital', '', 'Greater Accra', 5.66858, -0.23157, '+233 30 555 0127', '{"mon":[["08:00","17:00"]],"tue":[["08:00","17:00"]],"wed":[["08:00","17:00"]],"thu":[["08:00","17:00"]],"fri":[["08:00","17:00"]]}'::jsonb, '{tb_rapid_test}', 10, 5, null),
    ('TEST Esidem Hospital', '', 'Greater Accra', 5.66018, -0.15498, '+233 30 555 0128', '{"mon":[["07:00","22:00"]],"tue":[["07:00","22:00"]],"wed":[["07:00","22:00"]],"thu":[["07:00","22:00"]],"fri":[["07:00","22:00"]],"sat":[["07:00","22:00"]],"sun":[["07:00","22:00"]]}'::jsonb, '{tb_rapid_test,ambulance,oxygen}', 10, 8, now() - interval '30 hours'),
    ('TEST Lapaz Community Hospital', '', 'Greater Accra', 5.63542, -0.21536, '+233 30 555 0129', '{"mon":[["08:00","17:00"]],"tue":[["08:00","17:00"]],"wed":[["08:00","17:00"]],"thu":[["08:00","17:00"]],"fri":[["08:00","17:00"]],"sat":[["08:00","17:00"]]}'::jsonb, '{tb_rapid_test,oxygen,chest_xray}', 0, 0, null)
on conflict (name) do update set
  lat = excluded.lat, lng = excluded.lng, phone = excluded.phone, opening_hours = excluded.opening_hours, services = excluded.services,
  beds_total = excluded.beds_total, beds_free = excluded.beds_free, beds_updated_at = excluded.beds_updated_at;

-- Check: expect 20 rows.
select count(*) as test_facilities from public.facilities where name like 'TEST %' and name <> 'TEST Danfa Clinic' and name <> 'TEST Valley View University Hospital';
