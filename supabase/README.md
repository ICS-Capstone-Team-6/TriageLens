# Supabase: Prosit 2 development slice

Story E9-01; TRD 10.7, 10.9 and 11.2; ADR-6. Owner: Nana Yaw. Schema/RLS support: Kweku.

The shared development project supports email/password sign-in, facility-scoped cases, immutable inference results and append-only audit records. Use fake demo data only.

- Project: `triagelens-dev`, Nana Yaw's Org, region `eu-west-1` (Ireland).
- API URL: `https://bfmkhvysjwhqrlkbitvd.supabase.co`
- Dashboard: [triagelens-dev](https://supabase.com/dashboard/project/bfmkhvysjwhqrlkbitvd)
- [Teammate handoff](TEAM_HANDOFF.md): account setup, environment variables and application calls.
- `database.types.ts`: generated types for this schema.
- `migrations/`: schema, RLS, audited RPCs and triggers. The filename matches the applied cloud migration version.
- `seed.sql`: two clearly fake facilities; no accounts, passwords or patient data.
- `provision_member.sql`: trusted-owner facility assignment after Auth account creation.
- `tests/authorization.sql`: 41 live-database checks, all fixtures rolled back.

## API and access

| Capability | Slice API |
| --- | --- |
| Sign in | Supabase Auth email/password |
| Own profile/facility | SELECT from `profiles` / `facilities`, restricted by RLS |
| Create/update case | `save_case(p_case)` |
| Read case and results | `get_case(p_case_id)` |
| List facility cases | `list_cases(p_limit, p_offset)` |
| Save immutable result | `append_inference(p_inference)` |
| Audit log | SELECT for provisioned admin/maintainer roles only |

Case and inference tables have RLS and deny direct client table access. Use the RPCs: a successful case read/list writes an access event, which direct REST reads cannot provide. Public RPC wrappers are security invokers; privileged implementations stay in the unexposed `private` schema, verify `auth.uid()` and read the current, trusted profile assignment on every call. Client-editable user metadata never grants access.

Only active health workers with an assigned facility can use case RPCs. Admins and reviewers do not gain case-level access. Reviewer consent flows, aggregate dashboards, image uploads, model publishing, account management APIs, deletion workflows and offline PIN unlock remain later work. No image bucket is created for this results-only slice.

Every inference stores model name/version, thresholds version, outputs, zone, quality scores, latency and device information. Inferences and audit records cannot be updated or deleted through normal roles; immutable triggers also reject ordinary SQL mutations. A new Auth session writes one sign-in audit event. Case writes and successful reads write audit events without copying notes or symptoms into the log.

## Versions and retries

The client supplies stable UUIDs. `save_case` takes the complete mutable case payload, not a partial patch. Start `client_version` at 1; increment it for edits. Same version and same data is a no-op; same version with different data is an error. An older version returns the saved, newer case without overwriting it. Higher versions replace mutable fields; server-owned facility, author and timestamps cannot be supplied by the client.

`append_inference` accepts an identical retry for the same UUID. Changed content under an existing inference UUID is rejected. A genuinely new inference needs a new UUID. Retry no-ops do not duplicate write audit events. Reads still log each access.

## Reproduce and verify

Pinned CLI: `2.121.0`; local PostgreSQL major: `17`. Docker must be running and the PostgreSQL `psql` client must be installed.

```sh
supabase start
bash supabase/test-local.sh
supabase stop --no-backup
```

CI runs these commands against an isolated local database, without cloud credentials. The test runner uses `psql` with `ON_ERROR_STOP`, because the pinned CLI query command does not accept this multi-statement transaction. The test SQL sets `plpgsql.check_asserts=on`; any failed assertion or unexpected permission result fails the command. It covers anonymous denial, facility isolation, self-promotion denial, unassigned/disabled users, role restrictions, immutable results/audits, sign-in and case-access audit counts, and case/inference retry behavior.

The cloud migration and the same 41 checks passed on 21 Oct 2026. Security advisors reported no findings. New unused-index performance notices are expected before a new project has workload; retain the foreign-key indexes ([Supabase advisory reference](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)).

Generate each future migration with `supabase migration new <name>`. Never edit an applied migration. `supabase/config.toml` configures the local stack; it does not automatically change hosted Auth settings.
