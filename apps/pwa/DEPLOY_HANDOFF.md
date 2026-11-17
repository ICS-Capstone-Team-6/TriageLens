# M2 slice: what is needed from Nana Yaw to deploy it

For: Nana Yaw (DevOps, deploy owner), or an agent working on his behalf.
From: Kweku. Date: 21 Oct 2026. Demo: **Fri 23 Oct 2026**. Target: live on a phone by **Thu 22 Oct, midday**, so the monitoring page has a day of data.

The app is ready in [PR #91](https://github.com/ICS-Capstone-Team-6/TriageLens/pull/91) (branch `feat/E8-02-m2-slice`, folder `apps/pwa`). CI is green. It uses your live Supabase project and changes nothing in it. Background: [ADR-19](../../docs/adr/0019-m2-thin-slice-pulled-forward.md), [app README](README.md), [your backend handoff](../../supabase/TEAM_HANDOFF.md).

## Rules that apply to every step

- Never commit the model file, `.env.local`, a secret key, a service-role key or a database password.
- Only the Supabase **publishable** key goes into the app.
- No real patient data anywhere. Test images must come from the team's public datasets.
- Keep the deployed address private (no public links) until the Shenzhen licence terms are confirmed (PR #78).

## What to do, in order

### 1. Supabase: accounts and settings

The backend is live (`triagelens-dev`, `https://bfmkhvysjwhqrlkbitvd.supabase.co`). The app signs in with email and password, then calls `save_case`, `append_inference`, `list_cases` and `get_case`. It does not need a schema change.

1. Create a confirmed team account for **each person who will screen or open the monitoring page**: Kweku, Micheal, Chelsea and one shared demo account for the presentation. Then run `supabase/provision_member.sql` for each, with `clinic_name` = `FAKE Test Clinic A`. An account without a clinic is refused by the app with "Your account has no clinic yet".
2. In Authentication > URL Configuration, add the Vercel address from step 3 (production and preview) and `http://localhost:5173` plus `http://localhost:5180` (local development; 5180 is used when another app holds 5173).
3. Share the credentials through the team's private password channel only.

### 2. Model file: host it where the app can fetch it

The app downloads one file at start-up, checks its SHA-256, and runs it on the phone.

1. Get the file **privately from Kweku** (WhatsApp or Drive; never git, because model files are never committed and the repository is public). It is the exact file the thresholds were set for:

   | Property | Value |
   |----------|-------|
   | File name | `tb_efficientnet_lite0_seed1_20261021T114608Z_fp32.onnx` |
   | Size | 13,444,074 bytes (12.8 MiB) |
   | SHA-256 | `ef9c7dc7a8882703a4db24422c27b065d504358087216e86b8ff40a07584a289` |
   | Input / outputs | `image` [1, 3, 320, 320] / `tb_logit`, `features` |

2. Check the hash before hosting it. It must match the table **exactly**: `public/config/thresholds.json` is bound to this hash, and the app shows no results for any other file.

   ```bash
   shasum -a 256 tb_efficientnet_lite0_seed1_20261021T114608Z_fp32.onnx
   # expect ef9c7dc7a8882703a4db24422c27b065d504358087216e86b8ff40a07584a289
   ```

3. Host it at a URL that meets **all** of these. The app page is cross-origin isolated (`COEP: require-corp`), so a URL without these headers is blocked by the browser:
   - served over HTTPS;
   - `Access-Control-Allow-Origin` allows the Vercel address (or `*`);
   - `Cross-Origin-Resource-Policy: cross-origin` is present, unless the file is served from the app's own origin;
   - not listed or linked publicly.

   Any host is fine (for example Supabase Storage, Vercel Blob, or the same Vercel origin). Check the headers before going further:

   ```bash
   curl -sI "<MODEL_URL>" | grep -iE "^HTTP|access-control-allow-origin|cross-origin-resource-policy|content-length"
   ```

### 3. Vercel: create the project

1. New project from `ICS-Capstone-Team-6/TriageLens`. **Root Directory: `apps/pwa`.** Node.js 22. Leave the build settings to `apps/pwa/vercel.json`: framework Vite, `npm run build`, output `dist`. It also sets the COOP, COEP, `noindex` and `no-store` headers.
2. Environment variables (Production and Preview):

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | `https://bfmkhvysjwhqrlkbitvd.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | the publishable key (never a secret or service-role key) |
   | `VITE_MODEL_URL` | the model URL from step 2 |
   | `VITE_MODEL_SHA256` | `ef9c7dc7a8882703a4db24422c27b065d504358087216e86b8ff40a07584a289` |
   | `VITE_APP_BUILD` | optional, for example the commit SHA |

   These are read at build time. Redeploy after changing any of them.
3. Deploy the preview from branch `feat/E8-02-m2-slice` (PR #91). Production can follow once the PR is merged.
4. Keep it private: use Vercel deployment protection, or share the address only inside the team.

### 4. Check the deployment

Run these against the deployed address. All must pass.

```bash
URL="https://<your-vercel-address>"
curl -sI "$URL" | grep -iE "cross-origin-opener-policy|cross-origin-embedder-policy|x-robots-tag"
#   expect: same-origin, require-corp, noindex
curl -sI "$URL/ort/ort-wasm-simd-threaded.wasm" | grep -iE "^HTTP|content-type"
#   expect: 200 and application/wasm
curl -s "$URL/config/thresholds.json" | grep -E '"run_id"|"status"'
#   expect: the frozen run ID and status "set"
```

Then on a phone:

1. Open the address. You should see **Sign in** (not "not connected to the team backend").
2. Sign in with a provisioned account. Home appears with the age choice.
3. The thresholds are set (screen-out 0.0905, refer 0.902, `v0-uncalibrated`), so Home shows "TB model ready on this phone" once the model has loaded. If it shows "Screening is not available yet" or "does not match this model", the hosted file is not the one in the table above.
4. Open `#/monitor`. The page loads and shows "No records yet". If it says "Could not load records", the account has no clinic (step 1).

### 5. Test screenings

The thresholds are already in `public/config/thresholds.json` (set from Chelsea's validation file and this exact model file). After the deploy:

1. Run at least 5 screenings on a real phone with public-dataset X-ray images, plus 1 photo that is not an X-ray (expect "Retake").
2. Open `#/monitor` and check: screenings counted, quality failures counted, p95 model time shown (budget 2.5 s), preprocessing mismatches = 0.
3. If the app says the thresholds file does not match this model, the hosted file and the thresholds were made from different files. Re-check both hashes.

## What to send back to Kweku

| Item | Example |
|------|---------|
| Deployed address (preview, then production) | `https://triagelens-xxxx.vercel.app` |
| Model URL and its SHA-256 | the values from step 2 |
| Accounts created and provisioned to the demo clinic | Kweku, Micheal, Chelsea, demo (credentials privately) |
| Output of the three `curl` checks in step 4 | pasted text |
| Phone check result | "Sign-in OK, pending screen shown, monitor loads" |
| The phone used and its RAM, for the latency note (decision D2) | for example "Tecno Spark 10, 4 GB" |

## Not Nana Yaw's job (so do not wait on it)

- The two thresholds: done (ADR-20, committed in PR #91).
- The monitoring reference (`public/config/reference.json`): Chelsea runs `scripts/make_reference.py`. Until then the page shows live numbers without drift scores.

## If something fails

| Symptom | Likely cause |
|---------|--------------|
| "not connected to the team backend" | Supabase variables missing at build time; set them and redeploy |
| "The TB model could not be loaded" | Model URL unreachable, missing CORS or CORP headers, or `VITE_MODEL_SHA256` does not match the file |
| "The thresholds file does not match this model" | `model_sha256` in `thresholds.json` differs from the hosted file |
| "Your account has no clinic yet" | `provision_member.sql` not run for that account |
| Very slow first load | Expected once: the app downloads the 12.8 MB model and the ONNX Runtime files |
