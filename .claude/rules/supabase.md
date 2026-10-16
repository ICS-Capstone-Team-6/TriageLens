---
paths:
  - "supabase/**"
---

# Supabase

Source: TRD 10.7, 10.9, 11.2; FR-13, FR-17; NFR-SEC-03, NFR-PRIV. Full checklist: `supabase-rls-sync` skill.

- Every schema change is a new migration. Never edit an applied migration.
- Enable RLS on every table in the migration that creates it.
- Health workers see own facility's cases; reviewers see consented cases in assigned facilities; admins see aggregates only.
- `audit_log` is append-only: one row with actor and time for sign-in, case access, review, deletion, model change.
- `inferences` are immutable and store model version, threshold version and quality scores.
- Image upload requires a non-withdrawn consent row. Results-only is the default.
- No names, phone numbers, national IDs or birth dates. Age band only.
- Local and preview environments use obviously fake seed data only. No real patient data before ethics approval.
- RLS tests must pass in CI.
- No service keys or secrets in the repo.
