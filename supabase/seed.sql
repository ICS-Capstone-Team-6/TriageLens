-- Fake facilities only. No patient data, accounts or passwords.
insert into public.facilities(name,district,region) values
  ('FAKE Test Clinic A','Demo district A','Demo region'),
  ('FAKE Test Clinic B','Demo district B','Demo region')
on conflict (name) do nothing;
