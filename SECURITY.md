# Security and privacy

TriageLens handles health-related data. Treat any suspected leak as urgent.

## Report privately

- **Do not open a public issue.** This repository is public.
- Use GitHub's private reporting: **Security → Report a vulnerability** ([new advisory](https://github.com/ICS-Capstone-Team-6/TriageLens/security/advisories/new)).
- Or tell the team lead (Kweku) directly. Team members: report a suspected leak or lost device to Kweku **immediately**, at any hour. The quiet-hours rule does not apply (Team Rules 3, 8.9).

Please include what you found, where, and how to reproduce it. Do not include real patient data in the report.

## What is in scope

- The app (`apps/pwa`), shared packages, the Supabase schema and policies, CI, and model signing.
- Any secret committed to the repository or its history.
- Any real patient data anywhere in the project. The project uses **public datasets and fake data only** until ethics approval and a data-sharing agreement exist (Team Rules 8.1, TRD 12.3).

## Incident steps (TRD 11.4)

1. Report to the team lead at once. No blame.
2. **Revoke keys**: rotate any exposed secret (Supabase, Vercel, signing keys) and invalidate sessions.
3. **Preserve logs**: keep the audit log, CI logs and any evidence. Do not delete history before the team lead agrees.
4. **Follow the ethics committee's instructions** if personal or health data may be involved.
5. Record what happened and what changed in `docs/runbook/` (incident procedure, E14-02).

## Controls in place

- Secret scanning (gitleaks) on every pull request and push to `main` (`.github/workflows/ci.yml`).
- `.gitignore` blocks `.env*`, datasets, checkpoints and model binaries.
- Planned controls: row-level security on every table, encrypted images on the phone, signed models, and dependency scanning (TRD 8, NFR-SEC-01 to 06).

This is a student research prototype, not a certified medical device.
