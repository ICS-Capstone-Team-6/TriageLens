# Supabase

Database migrations, row-level security policies, RLS tests and seed data (TRD 10.7, 11.2, 14.1; ADR-6).

**Owner:** Nana Yaw (backend, auth and sync). Kweku owns schema and RLS design.

## What goes here

- `migrations/`, RLS policies and tests, fake seed data

## What must not go here

- Real patient data, in any environment before ethics approval (TRD 10.9).
- Service keys or other secrets.

## Status

Empty on purpose. Code arrives through backlog stories; see `docs/planning/02_Product_Backlog.md`.
