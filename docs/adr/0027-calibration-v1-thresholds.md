# ADR-27. Thresholds v1: raw-scale zone cuts, temperature recorded, ECE target missed

- **Status:** Proposed
- **Date:** 24 Nov 2026
- **Decided by:** Chelsea (ML lead; owner of `E6-01` since 24 Nov 2026, moved from Kweku). Needs team agreement; Kweku decides if there is no agreement (Team Rules 2).
- **Related:** TRD 7.2, 9.6 (ML-CALIB-01 to 04), TRD 3.4, ADR-8, ADR-11, ADR-20, `E6-01`, `E2-05`, `E11-01`, H1, H7

## Context

`E6-01` asks for temperature scaling on validation, ECE of at most 0.05, three-zone cuts that meet the sensitivity target, and the rules documented. ML-CALIB-03 asks for a signed, versioned file.

Four facts shaped the result, all measured on Shenzhen validation (94 films, 49 TB) for the frozen model (ADR-18):

1. **The app applies no temperature.** `triage.ts` compares `sigmoid(logit)` with the cuts in `thresholds.json`. If the file held calibrated cuts, the app would compare raw scores with them. At T = 1.34 the screen-out cut would rise from 0.089 to 0.150 on the raw scale, and more TB films would land in Low risk. An old cached copy of the app reads the file the same way.
2. **Temperature does not move any film between zones.** Dividing logits by T keeps their order, and both cuts are set by rank rules (at least 95% sensitivity, at least 95% specificity). So the zones are the same before and after calibration.
3. **ECE does not reach the target.** T = 1.343 (lowest log loss). With 10 equal-width bins, ECE is 0.098 before and 0.099 after (95% CI 0.075 to 0.181). With 5 bins it is 0.085 before and 0.069 after. The reliability plot zigzags because the middle bins hold only a few films each.
4. **No signing code exists** (ADR-11). `E2-05` (Sprint 4) covers signed manifests.

## Options considered

1. Store calibrated cuts and change the app to apply T. This needs an app change, and any old cached app would give wrong zones until it updates.
2. Store the zone cuts on the raw scale the app uses, and record T and the calibrated cuts as information only. The zones are identical for every app version.
3. Fit T to minimise ECE, or use Platt scaling (two parameters), to reach 0.05. This tunes a noisy number on 94 films, and Platt scaling departs from ADR-8.

## Decision

Option 2. `ml/train/calibrate.py` writes `apps/pwa/public/config/thresholds.json` version `v1-calibrated`:

- `probability_space: raw_sigmoid`. `screen_out_probability` 0.088844 and `refer_probability` 0.901772 are the zone cuts, read by the app as before.
- **Each cut sits halfway between two neighbouring validation scores.** In `v0`, the screen-out cut sat exactly on a TB film's score, so a tiny difference between PyTorch and ONNX Runtime Web could move that film into Low risk. Each cut's margin to the nearest validation score is 0.0016 (screen-out) and 0.0028 (refer), recorded in the file. `calibrate.py` checks that the rounded values it writes give the same validation zones.
- **Zones on validation are unchanged from `v0`.** Low risk 29 (2 TB), Unsure 40 (42.6%), Refer 25 (2 normal). 47 of 49 TB films are not Low risk; 43 of 45 normal films are below the refer cut.
- **Calibration is recorded, not used.** T, the calibrated cuts and ECE are recorded with `ece_target_met: false` and `for_display: false`. The calibrated probabilities are not shown to health workers. Today the app shows no probability outside the developer score line.
- **The ECE target miss is recorded, not tuned away.** The point estimate (0.099) is inside the TRD 3.4 floor of 0.10, but the interval reaches 0.18.
- **Signing is deferred to `E2-05`.** Meanwhile the file is bound to the model by `model_sha256` (unchanged from `v0`, same model) and records the checkpoint hash.

## Consequences

- No app logic changes. `config.test.ts` now checks that the shipped file parses, keeps raw-scale cuts, and is not marked for display.
- `E6-01` is done except ECE: report it as below target and above floor, with its interval. A larger validation set is the way to measure calibration properly.
- W3 (`E11-01`, PR #117) scores DA and DB once at these cuts. Its `ml/train/zones.py` must read them as raw-scale cuts, as the app does.
- ONNX Runtime Web against PyTorch parity near each cut is not tested yet (`E5-03`). The margins above are what such a test must stay inside.
- ML-CALIB-03 (signed file) is only partly met until `E2-05`. Change-log entry in `docs/planning/04_Team_Rules_and_Requirements.md`.

## Revisit trigger

A validation set of at least 300 films, an app change that shows calibrated confidence to users, or `E2-05` adding signing.
