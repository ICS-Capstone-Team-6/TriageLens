# PWA app

The installable React + TypeScript + Vite progressive web app (TRD 10.2, 10.4, 14.1; ADR-1, ADR-12). Today it holds the **M2 thin slice** ([ADR-19](../../docs/adr/0019-m2-thin-slice-pulled-forward.md)): one path from a chest X-ray to a TB screening result, with the model running on the phone and a numbers-only record for monitoring.

**Owner:** Kweku (app and UX lead). Micheal owns the inference worker and the capture overlay. Nana Yaw deploys.

## The slice

1. Sign in with a team account (Nana Yaw's Supabase backend, [`supabase/TEAM_HANDOFF.md`](../../supabase/TEAM_HANDOFF.md)).
2. Choose the person's age band. Under 15 stops the flow (TRD 3.2). The age band is cleared after every screening.
3. Photograph the film or upload the image.
4. In a Web Worker: decode, quality v1 (too small, blank, too dark, colourful photo), `cxr-pre-2`, then the frozen TB model `efficientnet_lite0_seed1_20261021T114608Z` (fp32 ONNX) through ONNX Runtime Web.
5. Zone from the versioned thresholds file ([ADR-20](../../docs/adr/0020-interim-slice-thresholds.md)): Refer now, Not sure or Low risk, with the exact TRD 7.2 wording, icon and the reminder "Screening support only. A clinician decides."
6. Save through `save_case` and `append_inference`: versions, input statistics, score, zone, timings. Never the image.
7. `#/monitor`: the monitoring page for the signed-in team.

Not in the slice: pneumonia, the eye check, roles and admin, offline queue and sync, case log, symptoms, heatmaps, the learned modality gate.

## Commands

```bash
cd apps/pwa
npm ci                 # Node 22 or newer
npm run dev            # http://localhost:5173 (copies ONNX Runtime's wasm into public/ort first)
npx vitest run         # unit tests
npx tsc --noEmit       # type-check
npm run build          # production build into dist/
```

Two development-only tools, both left out of production builds:

- **Clickable demo:** `?demo` runs the real screens, age check and zone logic with a stand-in for the model. Pick the next outcome in the demo bar; every screen says the result is made up, nothing is saved, and the monitoring page (`?demo#/monitor`) shows the demo screenings.
- **Score line:** in development builds, each result shows the raw TB score and both thresholds, so the team can see why a zone was chosen. Production never renders it (raw scores stay off health-worker screens, TRD 7.3).
- **Single screens:** `?preview=signin|home|checking|retake|result-refer|result-unsure|result-low|under15` for the UI checkers.

## Configuration

Copy the values into `apps/pwa/.env.local` (git-ignored) for development, and into the Vercel project settings for deploys. Names are in [`.env.example`](../../.env.example).

| Variable | What it is |
|----------|------------|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase values from Nana Yaw. Never a secret or service-role key. |
| `VITE_MODEL_URL` | Where the fp32 ONNX file is served. The model is never committed. |
| `VITE_MODEL_SHA256` | SHA-256 of that file. The app refuses a file with a different hash. |
| `VITE_APP_BUILD` | Optional build label shown on the monitoring page. |

Two reviewed files in `public/config/` control results:

- `thresholds.json`: the two thresholds, the run ID and the model SHA-256 (ADR-20). Until Chelsea sets `status` to `set` with all values, **the app shows no results**. If the loaded model's hash differs from the file's, the app shows no results.
  Fill it with `python3 scripts/set_thresholds.py --val val_logits.csv --model <fp32.onnx>`: the validation split's `label,logit` CSV and the exact model file. It applies the ADR-20 rules, reports sensitivity and specificity with 95% CIs, and refuses to write if the thresholds cross.
- `reference.json`: the validation score histogram and training input-statistic histograms for drift (PSI). Made with `scripts/make_reference.py`. Until it is set, the monitoring page shows live numbers only.

## Deploy on Vercel (Nana Yaw)

1. New project from this repo, **Root Directory `apps/pwa`**. `vercel.json` sets the framework (Vite), the build, and the headers (COOP and COEP for ONNX Runtime threads, `noindex`).
2. Set the environment variables above.
3. Host the model file where the app can fetch it with CORS and a `Cross-Origin-Resource-Policy: cross-origin` header (or on the same origin), because the page is cross-origin isolated. Keep the address private until the Shenzhen licence terms are confirmed (PR #78).
4. Add the deployed address to Supabase Authentication > URL Configuration.

## Checks this code has passed

- `cxr-pre-2` parity: grayscale conversion and the bilinear resize match Pillow 11.3 byte for byte (`src/lib/preprocess.test.ts`, fixture from `scripts/make_preprocess_fixture.py`, synthetic images only).
- Safety rules: zones, ties, invalid input, crossed or missing thresholds, the age band reset (`src/lib/*.test.ts`); `safety-reviewer` agent review.
- UI: taste-skill lint and inspector at 390 px on every screen, impeccable detect, ui-ux-pro-max guidance (touch targets, contrast, viewport, overscroll). The result screens keep one deliberate "colour sprawl" warning: the coloured card is the result.

## What must not go here

- Model binaries (served from a URL and checked by hash).
- Third-party scripts (NFR-SEC-05). ONNX Runtime and the Manrope font are self-hosted.
- Hard-coded user-facing strings (NFR-LOC-01). They live in `src/strings/en.json`, which the wording lint checks.
