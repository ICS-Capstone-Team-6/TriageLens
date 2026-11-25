-- Fake facilities only. No patient data, accounts or passwords.
insert into public.facilities(name,district,region) values
  ('FAKE Test Clinic A','Demo district A','Demo region'),
  ('FAKE Test Clinic B','Demo district B','Demo region')
on conflict (name) do nothing;

-- E10-06 (ADR-28): FAKE referral directory for the demo. Made-up facilities placed near
-- real towns; names, phone numbers, hours and services are invented. Not a real directory.
-- The mix is deliberate: full and partial services, a stale confirmation, unknown hours,
-- and a facility with no services, so every matcher path can be shown.
insert into public.facilities(name,district,region,lat,lng,phone,opening_hours,services,services_confirmed_at) values
  ('FAKE Regional Hospital Accra','Demo Accra','Demo Greater Accra',5.6037,-0.1870,'+233000000101','{"always":true}',
    '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient,eye_clinic,retina_laser,retina_injection,ambulance}',now()-interval '12 days'),
  ('FAKE District Hospital Kumasi','Demo Kumasi','Demo Ashanti',6.6885,-1.6244,'+233000000102','{"always":true}',
    '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient,ambulance}',now()-interval '30 days'),
  ('FAKE Eye Clinic Kumasi','Demo Kumasi','Demo Ashanti',6.7000,-1.6100,'+233000000103',
    '{"mon":[["08:00","16:00"]],"tue":[["08:00","16:00"]],"wed":[["08:00","16:00"]],"thu":[["08:00","16:00"]],"fri":[["08:00","16:00"]]}',
    '{eye_clinic,retina_laser}',now()-interval '45 days'),
  ('FAKE Health Centre Koforidua','Demo Koforidua','Demo Eastern',6.0941,-0.2591,'+233000000104',
    '{"mon":[["08:00","17:00"]],"tue":[["08:00","17:00"]],"wed":[["08:00","17:00"]],"thu":[["08:00","17:00"]],"fri":[["08:00","17:00"]],"sat":[["09:00","13:00"]]}',
    '{tb_treatment}',now()-interval '20 days'),
  ('FAKE District Hospital Ho','Demo Ho','Demo Volta',6.6008,0.4713,'+233000000105','{"always":true}',
    '{tb_rapid_test,chest_xray,oxygen,inpatient}',now()-interval '200 days'),
  ('FAKE Polyclinic Cape Coast','Demo Cape Coast','Demo Central',5.1053,-1.2466,'+233000000106',
    '{"mon":[["08:00","17:00"]],"tue":[["08:00","17:00"]],"wed":[["08:00","17:00"]],"thu":[["08:00","17:00"]],"fri":[["08:00","17:00"]]}',
    '{tb_rapid_test,tb_treatment,eye_clinic}',now()-interval '60 days'),
  ('FAKE Hospital Takoradi','Demo Takoradi','Demo Western',4.8845,-1.7554,'+233000000107','{"always":true}',
    '{chest_xray,oxygen,inpatient,ambulance}',now()-interval '15 days'),
  ('FAKE Teaching Hospital Tamale','Demo Tamale','Demo Northern',9.4008,-0.8393,'+233000000108','{"always":true}',
    '{tb_rapid_test,tb_treatment,chest_xray,oxygen,inpatient,eye_clinic,retina_laser,ambulance}',now()-interval '25 days'),
  ('FAKE Health Centre Bolgatanga','Demo Bolgatanga','Demo Upper East',10.7856,-0.8514,'+233000000109',null,
    '{tb_rapid_test}',now()-interval '40 days'),
  ('FAKE Clinic Wa','Demo Wa','Demo Upper West',10.0601,-2.5099,'+233000000110',null,'{}',null)
on conflict (name) do update set
  district=excluded.district, region=excluded.region, lat=excluded.lat, lng=excluded.lng, phone=excluded.phone,
  opening_hours=excluded.opening_hours, services=excluded.services, services_confirmed_at=excluded.services_confirmed_at;

-- The two sign-in test clinics get a place on the map so referrals can start from them.
update public.facilities set lat=5.6500, lng=-0.1900, phone='+233000000001',
  services='{tb_treatment}', services_confirmed_at=now()-interval '10 days' where name='FAKE Test Clinic A';
update public.facilities set lat=6.6500, lng=-1.6000, phone='+233000000002' where name='FAKE Test Clinic B';
