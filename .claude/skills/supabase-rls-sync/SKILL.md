---
name: supabase-rls-sync
description: Supabase schema, migration and row-level security rules for TriageLens. Use when writing or reviewing anything under supabase/ (migrations, RLS policies, RLS tests, seed data, edge functions) or server-side sync endpoints, roles, audit logging or consent checks.
paths:
  - "supabase/**"
allowed-tools: Read, Grep, Glob
---

# Supabase, RLS and sync

Enforces TRD 10.7 (data model), 10.8 (sync), 10.9 (environments), 11.1 to 11.4, FR-08, FR-09, FR-13, FR-17, NFR-SEC-03, NFR-PRIV-01/02/04, ADR-6, ADR-10, Team Rules 8.
Supports stories E9-01, E9-02, E9-03, E9-04, E10-01, E10-02, E12-03.

## Tables (TRD 10.7)

| Table | Main fields | Rule |
|-------|-------------|------|
| facilities | id, name, district, region | Scope for RLS |
| profiles | user id, facility id, role, display name | Roles: health worker, reviewer, admin |
| cases | id (client UUID), facility id, created by, created at, updated at, age band, sex (optional), symptoms, status, notes, client version | No names or phone numbers |
| inferences | id, case id, model name and version, thresholds version, outputs, zone, quality scores, latency, device info | Immutable |
| case_images | id, case id, storage path, sha256, consent id | Only with consent |
| consents | id, case id, scope, given at, withdrawn at | Required before upload |
| reviews | id, case id, reviewer id, decision, note, created at | One or more per case |
| model_versions | id, name, version, sha256, signature, status, released at | Registry |
| audit_log | id, actor, action, entity, entity id, time, meta | Append-only |

## Migrations

- [ ] Every schema change is a new migration file in `supabase/migrations/`. Never edit an applied migration.
- [ ] RLS is enabled on **every** table in the same migration that creates it (NFR-SEC-03).
- [ ] No personal identifiers: no names, phone numbers, national IDs; age band, not birth date (NFR-PRIV-01).
- [ ] `inferences` and `audit_log` have no UPDATE or DELETE path for normal roles.
- [ ] Every inference row stores model version, thresholds version and quality scores (NFR-SAFE-03).

## Role matrix (TRD 11.2)

| Capability | Health worker | Reviewer | Admin | Maintainer |
|------------|---------------|----------|-------|------------|
| Create and view own facility's cases | Yes | No | No | No |
| View consented cases for review | No | Yes | No | No |
| Add review | No | Yes | No | No |
| See aggregate dashboards | No | No | Yes | Yes |
| Manage users and facilities | No | No | Yes | No |
| Publish model versions | No | No | No | Yes |
| Read audit log | No | No | Yes | Yes |

RLS summary (TRD 10.7): health workers see their own facility's cases; reviewers see cases **with consent** in their assigned facilities; admins see only aggregate views with no identifiers.

## Audit log (FR-17)

- [ ] One row with actor and time for each: sign-in, case access, review, deletion, model change.
- [ ] Append-only: no role can update or delete rows.

## Consent (FR-13, ADR-10, NFR-PRIV-02)

- [ ] Image upload is refused unless a non-withdrawn consent row exists for the case.
- [ ] Deletion on request removes the case and its images (deletion within 30 days, NFR-PRIV-04).
- [ ] Results-only is the default.

## Sync server side (TRD 10.8)

- [ ] Upsert keyed by id and version; repeating a batch changes nothing.
- [ ] Server answers with accepted versions.
- [ ] Reviews: server wins. Notes: last-write-wins by version. Inferences: insert-only.

## Environments and data (TRD 10.9, Team Rules 8)

- [ ] Local and preview: seeded **fake** data only. Staging: fake or consented test data. Production: real data only after ethics approval.
- [ ] Seed data must be obviously fake (for example facility "Test Clinic A"); never derived from real records.
- [ ] No service-role keys or secrets in the repo; use environment secrets (NFR-SEC-04).

## RLS tests (E9-01; must pass in CI)

- [ ] A health worker from facility A cannot read, update or delete facility B's cases.
- [ ] A reviewer cannot read a case without consent, or outside assigned facilities.
- [ ] An admin cannot read row-level case data, only aggregates.
- [ ] A health worker cannot write a review or publish a model version.
- [ ] Nobody can update or delete `audit_log` or `inferences`.
- [ ] Each audited event writes exactly one audit row.
- [ ] Upload without consent is rejected.
