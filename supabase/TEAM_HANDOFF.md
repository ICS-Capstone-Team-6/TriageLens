# TriageLens Supabase handoff

For the teammate building the Prosit 2 vertical slice. This backend is live; application integration can begin before the infrastructure PR is merged.

## Connection

| Item | Value |
| --- | --- |
| Project | `triagelens-dev` |
| Project ref | `bfmkhvysjwhqrlkbitvd` |
| API URL | `https://bfmkhvysjwhqrlkbitvd.supabase.co` |
| Dashboard | [Open project](https://supabase.com/dashboard/project/bfmkhvysjwhqrlkbitvd) |
| Environment | Development, fake demo data only |
| Region | Ireland (`eu-west-1`) |

Nana Yaw has the shareable environment file containing the project URL and publishable key. Copy it to the frontend's ignored `.env.local`, then restart the dev server. `.env.example` shows the variable names. The publishable key belongs in the browser; secret/service-role keys and database passwords never do.

For the planned React/Vite app:

```dotenv
VITE_SUPABASE_URL=https://bfmkhvysjwhqrlkbitvd.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=copy_the_publishable_key_from_the_shared_env_file
```

If the app does not already have the client installed, use Node 22 or newer and pin it in the app's package file and lockfile:

```sh
npm install --save-exact @supabase/supabase-js@2.118.0
```

## Give each teammate a sign-in

Nana Yaw performs these trusted-owner steps in the project dashboard:

1. Open Authentication > Users and create an email/password user for the teammate with email confirmed. Give the teammate their credentials through the team's private password-sharing channel. Do not commit passwords.
2. Copy that Auth user's UUID.
3. Open SQL Editor and run `provision_member.sql`, setting `member_id` to that UUID and keeping `clinic_name` as `FAKE Test Clinic A`. This grants the health-worker role for the demo clinic.
4. Give the teammate the environment file. For dashboard access as well, invite their Supabase account through the organization's team settings; app sign-in and dashboard membership are separate.

Every signup automatically creates a profile with no facility. A signed-in but unassigned account will receive an access error until step 3. Users cannot assign themselves a facility or elevate their own role.

Hosted email/password Auth is enabled and email confirmation is on. Custom SMTP has not been configured: use owner-created, confirmed team accounts for the immediate demo. The default email service has restrictions ([Supabase SMTP docs](https://supabase.com/docs/guides/auth/auth-smtp)). Before using self-service confirmation/password-reset flows in the deployed app, configure its actual site URL and redirect allowlist in Authentication > URL Configuration and configure SMTP as needed. The local config already uses Vite's `localhost:5173`.

## Client calls

Use the generated `database.types.ts` file in your frontend (adjust its import path).

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)

// Each caller signs in with their own account.
const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
if (signInError) throw signInError

// Check the facility assignment after sign-in. Profiles are read-only to the client.
const { data: profile, error: profileError } = await supabase
  .from('profiles').select('id, facility_id, role, disabled_at').single()
if (profileError) throw profileError
if (!profile?.facility_id) throw new Error('Ask Nana Yaw to assign your demo clinic')

// Create a case with a UUID generated once and kept for offline retries.
const caseId = crypto.randomUUID()
const { data: savedCase, error: caseError } = await supabase.rpc('save_case', {
  p_case: {
    id: caseId,
    age_band: '25-34',
    sex: 'unknown',
    symptoms: {},
    status: 'open',
    notes: 'FAKE demo case',
    client_version: 1,
  },
})
if (caseError) throw caseError

// Save the actual inference metadata from your model/threshold configuration.
// These values are examples, not validated clinical thresholds or model releases.
const inferenceId = crypto.randomUUID()
const { error: inferenceError } = await supabase.rpc('append_inference', {
  p_inference: {
    id: inferenceId,
    case_id: caseId,
    model_name: 'demo-tb',
    model_version: 'demo-only',
    thresholds_version: 'demo-only',
    outputs: { tb_probability: 0.2 },
    zone: 'unsure',
    quality_scores: { passed: true },
    latency_ms: 250,
    device_info: { platform: 'demo-browser' },
  },
})
if (inferenceError) throw inferenceError

const { data: details, error: readError } = await supabase.rpc('get_case', { p_case_id: caseId })
if (readError) throw readError
// details = { case: {...}, inferences: [...] }, or null if unavailable.

const { data: cases, error: listError } = await supabase.rpc('list_cases', {
  p_limit: 50, p_offset: 0,
})
if (listError) throw listError
```

Do not call `.from('cases')` or `.from('inferences')`: direct table access is intentionally denied so reads cannot bypass audit logging. Call the four RPCs instead. Their JSON results are represented as `Json` in the generated types; validate/narrow them in the app before rendering.

## Contract

- Required case fields: `id` (UUID), `age_band`, `client_version` (integer >= 1).
- Age bands: `15-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65+`, `unknown`. No birth date or patient name fields.
- Sex: `female`, `male`, `other`, `unknown`, or omitted.
- Status: `open`, `referred`, `archived`. Notes: at most 2,000 characters.
- Inference fields: all shown above except optional `device_info`; stable inference UUID required.
- Zones: `refer_now`, `unsure`, `low_risk`, `retake`. A failed quality gate must not produce a reassuring zone; `retake` records the rejected capture outcome.
- Keep model and threshold versions with every result. Do not reuse the example `demo-only` versions for real model outputs.
- For edits, send the complete mutable case fields and increment `client_version`. Reuse UUID/version only for an identical retry. Use a new inference UUID for a new result.
- Results-only storage: no image upload path or public image bucket is enabled.

[Backend rules and verification](README.md).
