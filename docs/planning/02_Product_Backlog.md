---
title: "Product Backlog"
subtitle: "TriageLens: AI Triage for District Clinics in Ghana and Africa"
date: "15 October 2026"
---

# 1. How to Read This Backlog

This is the single ordered list of everything the team will build. Each story has a priority, a size in points, an owner (who is accountable) and a supporter (who pairs or reviews). The sprint plan and the TRD tables are generated from the same data, so the totals always match.

| Term | Meaning |
|--------------|------------------------------------------------------------------------------------------|
| Must | The product does not meet its goals without it. Defines the minimum viable product (MVP). |
| Should | Important and planned, but the project still works without it. First to be cut if the team falls behind. |
| Could | Stretch ideas, not scheduled. Pulled in only when ahead of plan. |
| Points | Relative size. One point is about 2.5 focused hours including review and testing. Most stories are 1 to 4 points. |
| Owner / Support | Owner is accountable for finishing the story. Support pairs, reviews or unblocks. Owners are not the only ones allowed to touch the work. |
| Req | The TRD requirement the story satisfies (FR = functional, NFR = non-functional, ML = machine learning). |

# 2. Summary

The plan commits **144 points** across five sprints: **121 Must** and **23 Should**. Another **50 points** of Could ideas sit in the icebox.

## 2.1 By Workstream

| Epic | Workstream | Stories | Points | Must | Should | Sprints |
|------|----------------------------------------|---------|---------|--------|--------|--------------|
| E0 | Project Setup and Governance | 6 | 7 | 5 | 2 | S0, S1, S4 |
| E1 | Data Acquisition and Preparation | 5 | 9 | 9 | 0 | S0, S1, S2 |
| E2 | Chest X-ray Models (TB, Pneumonia) | 5 | 13 | 13 | 0 | S0, S1, S2, S4 |
| E3 | Retinal Model (Diabetic Retinopathy) | 2 | 5 | 5 | 0 | S1, S2 |
| E4 | Image Quality and Modality Gate | 3 | 8 | 6 | 2 | S0, S1, S2 |
| E5 | Compression and On-Device Inference | 4 | 8 | 8 | 0 | S1, S3 |
| E6 | Calibration, Uncertainty and Explainability | 3 | 7 | 3 | 4 | S2, S3 |
| E7 | Phone-Photo Robustness | 2 | 5 | 5 | 0 | S2, S3 |
| E8 | Mobile App (PWA) and UX | 10 | 26 | 21 | 5 | S0, S1, S2, S3, S4 |
| E9 | Backend, Auth and Sync | 4 | 11 | 9 | 2 | S1, S2, S3 |
| E10 | Clinician Review and Admin | 2 | 6 | 0 | 6 | S3 |
| E11 | Validation and Benchmarking | 4 | 10 | 10 | 0 | S3, S4 |
| E12 | Ethics, Safety and Compliance | 4 | 6 | 6 | 0 | S0, S1, S3, S4 |
| E13 | DevOps, CI/CD and QA | 4 | 8 | 6 | 2 | S1, S2, S3, S4 |
| E14 | Capstone Delivery | 5 | 15 | 15 | 0 | S4 |
|  | **Total** | 63 | 144 | 121 | 23 |  |

## 2.2 By Sprint and Person

| Sprint | Dates | Working days | Points | Kweku | Chelsea | Nana Yaw | Micheal |
|----------|------------------------------|---------|--------|--------|--------|---------|--------|
| Sprint 0 | Mon 19 Oct to Fri 23 Oct 2026 | 5 | 16 | 4 | 4 | 4 | 4 |
| Sprint 1 | Mon 26 Oct to Fri 6 Nov 2026 | 10 | 32 | 8 | 8 | 8 | 8 |
| Sprint 2 | Mon 9 Nov to Fri 20 Nov 2026 | 10 | 32 | 8 | 8 | 8 | 8 |
| Sprint 3 | Mon 23 Nov to Fri 4 Dec 2026 | 9 | 32 | 8 | 8 | 8 | 8 |
| Sprint 4 | Mon 7 Dec to Fri 18 Dec 2026 | 10 | 32 | 8 | 8 | 8 | 8 |
| **Total** |  |  | 144 | 36 | 36 | 36 | 36 |

Capacity rule: each person commits to at most 8 points per two-week sprint (about 20 hours, against an assumed 24 hours available). Sprint 0 is one week and holds 4 points each. This leaves a deliberate buffer of about 15 to 20 percent for reviews, learning and surprises.

## 2.3 If We Fall Behind: Cut Order

Cut Should items in this order. Never cut a Must item without the team lead and project manager agreeing and updating the TRD.

| Cut order | Story | Points | What we lose |
|--------|----------------------------------------------------|--------|----------------------------------------------------|
| 1 | E10-02 Admin dashboard: volumes, referral rate, reviewer agreement | 3 | Admin view of volumes and agreement; data stays in the database |
| 2 | E8-09 Localization framework and plain-language, icon-first UI | 2 | Localization framework; English-only strings stay hard-coded |
| 3 | E9-04 Model registry, over-the-air update and rollback | 2 | Over-the-air model updates; models ship with the app build |
| 4 | E13-03 Performance budgets and security scan in CI | 2 | Automated size and security gates in CI; checks become manual |
| 5 | E6-03 Subgroup and failure analysis (sex, age band, source site, image type) | 2 | Subgroup table; failure analysis moves into the report as a short note |
| 6 | E8-07 Capture guidance overlay (live frame, tilt, glare hints, auto-capture) | 3 | Live guidance overlay; users rely on the written capture protocol |
| 7 | E10-01 Clinician review screen and feedback loop | 3 | In-app clinician review; reviewer feedback collected on paper or sheets |
| 8 | E6-02 Heatmap (class activation map) from model features in the browser | 2 | Heatmap; result screen shows zone and advice only |
| 9 | E0-06 Final retro, handover pack and repo archive | 2 | Formal handover pack; keep the repo tag and README |

# 3. Backlog by Workstream

## E0. Project Setup and Governance

| ID | Story | Req | Pri | Pts | Owner (support) | Sprint | Depends on | Acceptance criteria |
|-------|----------------------------|---------|------|----|--------------|-----|---------|--------------------------------------|
| E0-01 | Set up monorepo, branch rules, PR template and CODEOWNERS | NFR-MAINT | Must | 1 | Nana Yaw | S0 | none | Repo live; main is protected; a PR needs 1 review; all four members have merged a PR |
| E0-02 | CI skeleton: lint, type-check and unit tests on every PR | NFR-MAINT | Must | 1 | Nana Yaw (Kweku) | S0 | E0-01 | CI badge is green; a failing test blocks the merge |
| E0-03 | Board, Definition of Done and working agreement agreed | - | Must | 1 | Micheal (Kweku) | S0 | none | Board holds every backlog item; each member confirmed the agreement in writing |
| E0-04 | Freeze intended-use statement and success metrics | FR-05, NFR-SAFE | Must | 1 | Kweku (Micheal) | S0 | none | One-page statement approved by all; metrics match TRD section 3 |
| E0-05 | Risk register live and sprint rituals running | - | Must | 1 | Micheal | S1 | E0-03 | Top 10 risks have owners and triggers; reviewed every week |
| E0-06 | Final retro, handover pack and repo archive | - | Should | 2 | Micheal (Kweku) | S4 | All | Retro notes written; repo tagged v1.0; credentials rotated |

## E1. Data Acquisition and Preparation

| ID | Story | Req | Pri | Pts | Owner (support) | Sprint | Depends on | Acceptance criteria |
|-------|----------------------------|---------|------|----|--------------|-----|---------|--------------------------------------|
| E1-01 | Request dataset access; build licence and usage register | NFR-PRIV | Must | 1 | Micheal (Chelsea) | S0 | none | Register lists every dataset, licence, access status and allowed use |
| E1-02 | Download, checksum and version core datasets (downsized copies) | NFR-MAINT | Must | 2 | Nana Yaw (Chelsea) | S0 | E1-01 | Datasets in versioned storage with checksums; one script reproduces the download |
| E1-03 | EDA, data cards, patient-level splits and duplicate check (TB, pneumonia) | ML-DATA | Must | 2 | Chelsea (Nana Yaw) | S0 | E1-02 | Split manifests committed; zero patient or near-duplicate overlap across splits; source overlap between TB sets checked |
| E1-04 | Phone-photo capture protocol and capture kit | FR-01, ML-ROBUST | Must | 1 | Micheal (Chelsea) | S1 | none | Protocol (distance, angle, lighting, phone settings) written and tried once |
| E1-05 | Photograph test set: 300+ displayed or printed X-rays, 2+ phones | ML-ROBUST | Must | 3 | Micheal (Chelsea) | S2 | E1-04 | 300+ labelled photos of distinct X-rays; metadata sheet; no personal data in images |

## E2. Chest X-ray Models (TB, Pneumonia)

| ID | Story | Req | Pri | Pts | Owner (support) | Sprint | Depends on | Acceptance criteria |
|-------|----------------------------|---------|------|----|--------------|-----|---------|--------------------------------------|
| E2-01 | Pipeline smoke test: baseline TB classifier end to end | ML-TRAIN | Must | 2 | Chelsea (Kweku) | S0 | E1-03 | One command trains, evaluates and logs; metrics reproduce within 0.01 AUROC |
| E2-02 | TB model v1 (small backbone, transfer learning) | FR-04, ML-TRAIN | Must | 3 | Chelsea (Kweku) | S1 | E1-03 | Internal test AUROC with 95% CI over 3 seeds; backbone choice documented |
| E2-03 | Pneumonia model; compare multi-task (masked loss) with separate models | FR-04, ML-TRAIN | Must | 3 | Chelsea (Micheal) | S1 | E2-02 | Decision recorded: multi-task if within 0.02 AUROC of separate models |
| E2-04 | Tune TB and pneumonia models; try teacher-student distillation | FR-04, ML-TRAIN | Must | 3 | Chelsea (Nana Yaw) | S2 | E2-03 | Student within 0.02 AUROC of teacher; comparison table |
| E2-05 | Final model selection, freeze and signed manifests | FR-12, NFR-SEC | Must | 2 | Chelsea (Nana Yaw) | S4 | E11-01 | Each frozen model has a hash, version and model-card link; changes need a new version |

## E3. Retinal Model (Diabetic Retinopathy)

| ID | Story | Req | Pri | Pts | Owner (support) | Sprint | Depends on | Acceptance criteria |
|-------|----------------------------|---------|------|----|--------------|-----|---------|--------------------------------------|
| E3-01 | DR data prep: APTOS plus EyePACS subsample, splits, preprocessing | ML-DATA | Must | 2 | Kweku (Chelsea) | S1 | E1-02 | Patient-level splits; preprocessing documented; class balance report |
| E3-02 | DR model v1 (5-grade ordinal plus referable-DR flag) | FR-04, ML-TRAIN | Must | 3 | Chelsea (Kweku) | S2 | E3-01 | Referable-DR AUROC with CI; quadratic weighted kappa reported |

## E4. Image Quality and Modality Gate

| ID | Story | Req | Pri | Pts | Owner (support) | Sprint | Depends on | Acceptance criteria |
|-------|----------------------------|---------|------|----|--------------|-----|---------|--------------------------------------|
| E4-01 | Spike: live capture guidance (frame, tilt, glare detection) | FR-16 | Should | 2 | Micheal (Kweku) | S0 | none | Demo on reference phone detects tilt and glare at 5 fps; go/no-go note written |
| E4-02 | Quality checks: blur, glare, exposure, framing, with retake advice | FR-03 | Must | 3 | Micheal (Nana Yaw) | S1 | E8-03 | Bad images rejected with a clear reason; runs under 300 ms on the reference phone |
| E4-03 | Modality and out-of-distribution gate (X-ray, fundus, other) | FR-02 | Must | 3 | Micheal (Chelsea) | S2 | E2-02 | Rejects at least 95% of non-medical and wrong-type images on a mixed test set |

## E5. Compression and On-Device Inference

| ID | Story | Req | Pri | Pts | Owner (support) | Sprint | Depends on | Acceptance criteria |
|-------|----------------------------|---------|------|----|--------------|-----|---------|--------------------------------------|
| E5-01 | Reference low-end phone and benchmark harness | NFR-PERF | Must | 2 | Nana Yaw | S1 | none | One script reports latency, memory and load time on the phone |
| E5-02 | ONNX export and int8 quantization pipeline | FR-04, NFR-SIZE | Must | 2 | Chelsea (Nana Yaw) | S1 | E2-02 | Model at most 15 MB; int8 AUROC within 0.015 of fp32 |
| E5-03 | ONNX parity and accuracy-drop checks in CI | NFR-MAINT | Must | 2 | Nana Yaw (Chelsea) | S1 | E5-02 | CI fails if browser output differs from PyTorch beyond tolerance |
| E5-04 | Low-end performance tuning (WASM SIMD and threads, warm-up, memory) | NFR-PERF | Must | 2 | Nana Yaw (Micheal) | S3 | E8-04 | p95 inference at most 2.5 s and peak memory at most 350 MB on the reference phone |

## E6. Calibration, Uncertainty and Explainability

| ID | Story | Req | Pri | Pts | Owner (support) | Sprint | Depends on | Acceptance criteria |
|-------|----------------------------|---------|------|----|--------------|-----|---------|--------------------------------------|
| E6-01 | Calibration (temperature scaling) and three-zone thresholds | FR-05, ML-CALIB | Must | 3 | Kweku (Chelsea) | S2 | E2-03 | ECE at most 0.05 on validation; thresholds meet the sensitivity target; rules documented |
| E6-02 | Heatmap (class activation map) from model features in the browser | FR-06 | Should | 2 | Micheal (Kweku) | S2 | E5-02 | Heatmap renders under 200 ms; sanity check passes (map changes when weights are randomized) |
| E6-03 | Subgroup and failure analysis (sex, age band, source site, image type) | ML-FAIR | Should | 2 | Chelsea (Kweku) | S3 | E11-01 | Metrics table by subgroup; top 20 failures reviewed and categorized |

## E7. Phone-Photo Robustness

| ID | Story | Req | Pri | Pts | Owner (support) | Sprint | Depends on | Acceptance criteria |
|-------|----------------------------|---------|------|----|--------------|-----|---------|--------------------------------------|
| E7-01 | Phone-photo simulation pipeline (glare, tilt, moire, blur, lighting) | ML-ROBUST | Must | 2 | Chelsea (Micheal) | S2 | E1-04 | Augmentation library with unit tests; sample outputs reviewed by the team |
| E7-02 | Photo-robust retraining and ablation (clean vs simulated vs real photos) | ML-ROBUST | Must | 3 | Chelsea (Kweku) | S3 | E7-01, E1-05 | AUROC drop on real phone photos at most 0.05 after training (target); ablation table |

## E8. Mobile App (PWA) and UX

| ID | Story | Req | Pri | Pts | Owner (support) | Sprint | Depends on | Acceptance criteria |
|-------|----------------------------|---------|------|----|--------------|-----|---------|--------------------------------------|
| E8-01 | UX plan: interview 3+ health workers; low-fidelity flows | NFR-USAB | Must | 2 | Kweku (Micheal) | S0 | none | Interview notes; 3 user journeys; first screening reachable in 5 taps or fewer |
| E8-02 | PWA shell: install, offline cache, routing, design tokens | FR-07, NFR-OFFL | Must | 3 | Kweku (Micheal) | S1 | E0-01 | Installs to home screen; opens offline; passes Lighthouse PWA checks |
| E8-03 | Capture screen: camera and file upload | FR-01 | Must | 2 | Kweku (Micheal) | S1 | E8-02 | Image from camera or gallery reaches the quality gate; EXIF and location stripped |
| E8-04 | Inference worker: run ONNX in a web worker with model cache | FR-04 | Must | 3 | Micheal (Chelsea, Nana Yaw) | S1 | E5-02 | Offline inference on the reference phone; UI stays responsive |
| E8-05 | Result screen: risk zone, confidence, referral advice, 4-symptom checklist | FR-05 | Must | 3 | Kweku (Micheal) | S2 | E6-01 | Zone shown with colour, icon and text; unsure state offers retake or refer; symptoms can raise a zone, never lower it |
| E8-06 | Local case log: pseudonymous ID, notes, encrypted images | FR-07, NFR-PRIV | Must | 2 | Kweku (Nana Yaw) | S2 | E8-02 | Cases survive restart; images encrypted at rest; 500 cases without slowdown |
| E8-07 | Capture guidance overlay (live frame, tilt, glare hints, auto-capture) | FR-16 | Should | 3 | Micheal (Kweku) | S3 | E4-01 | Fewer retakes per good capture than without the overlay (measured in usability round 2) |
| E8-08 | Usability round 1 (5+ users) and fixes | NFR-USAB | Must | 3 | Kweku (Micheal) | S3 | E8-05 | Task success at least 90%; top 5 issues fixed or logged |
| E8-09 | Localization framework and plain-language, icon-first UI | FR-14, NFR-LOC | Should | 2 | Micheal (Kweku) | S3 | E8-05 | All strings externalized; English reading level grade 8 or lower; key steps use icons |
| E8-10 | Usability round 2 (5+ users) and polish | NFR-USAB | Must | 3 | Kweku (Micheal) | S4 | E8-08 | SUS at least 75; median time to first result at most 90 s |

## E9. Backend, Auth and Sync

| ID | Story | Req | Pri | Pts | Owner (support) | Sprint | Depends on | Acceptance criteria |
|-------|----------------------------|---------|------|----|--------------|-----|---------|--------------------------------------|
| E9-01 | Supabase project, schema v1, row-level security by facility, audit log | FR-08, FR-09, FR-17 | Must | 3 | Nana Yaw (Kweku) | S1 | none | RLS tests: a user from facility A cannot read facility B; audit rows written for sign-in, access, review, deletion |
| E9-02 | Sync outbox with idempotent upserts and conflict rules | FR-08 | Must | 3 | Nana Yaw (Kweku) | S2 | E9-01, E8-06 | Airplane-mode test: 50 cases queued offline sync with no duplicates or loss |
| E9-03 | Auth and roles; offline PIN unlock | FR-09, NFR-SEC | Must | 3 | Nana Yaw (Kweku) | S2 | E9-01 | Three roles enforced; offline unlock valid 14 days; PIN lockout after 5 tries; local cases kept after expiry |
| E9-04 | Model registry, over-the-air update and rollback | FR-12, NFR-SEC | Should | 2 | Nana Yaw (Chelsea) | S3 | E5-02, E9-01 | New model version downloads in background; app can roll back to the previous version |

## E10. Clinician Review and Admin

| ID | Story | Req | Pri | Pts | Owner (support) | Sprint | Depends on | Acceptance criteria |
|-------|----------------------------|---------|------|----|--------------|-----|---------|--------------------------------------|
| E10-01 | Clinician review screen and feedback loop | FR-10 | Should | 3 | Kweku (Nana Yaw) | S3 | E9-02 | Reviewer can confirm or correct each result; agreement rate stored |
| E10-02 | Admin dashboard: volumes, referral rate, reviewer agreement | FR-11 | Should | 3 | Micheal (Kweku) | S3 | E10-01 | Dashboard shows counts by facility and week; no patient identifiers |

## E11. Validation and Benchmarking

| ID | Story | Req | Pri | Pts | Owner (support) | Sprint | Depends on | Acceptance criteria |
|-------|----------------------------|---------|------|----|--------------|-----|---------|--------------------------------------|
| E11-01 | External validation runs (locked external sets, one-shot) | ML-EVAL | Must | 3 | Chelsea (Kweku) | S3 | E2-04, E3-02 | Results table with 95% CIs; external sets untouched until this run |
| E11-02 | Device benchmark report (reference phone plus one mid-range) | NFR-PERF, NFR-COMP | Must | 2 | Nana Yaw (Micheal) | S3 | E5-04 | Report covers latency, memory, load time, battery estimate and device compatibility (Android and Chrome versions) |
| E11-03 | Model cards and results tables | ML-EVAL | Must | 2 | Chelsea (Kweku) | S4 | E11-01 | One model card per model: data, metrics, limits, intended use |
| E11-04 | Regression, offline soak and load tests | NFR-REL | Must | 3 | Nana Yaw (Micheal) | S4 | All features | 72-hour soak with no crash; regression suite green |

## E12. Ethics, Safety and Compliance

| ID | Story | Req | Pri | Pts | Owner (support) | Sprint | Depends on | Acceptance criteria |
|-------|----------------------------|---------|------|----|--------------|-----|---------|--------------------------------------|
| E12-01 | Ethics pathway: IRB route, protocol outline, clinic contact | NFR-SAFE | Must | 1 | Kweku (Micheal) | S0 | none | IRB route named; submission checklist; contact person at one clinic |
| E12-02 | Hazard log v1 | NFR-SAFE | Must | 1 | Kweku (Chelsea) | S1 | E0-04 | Top hazards (missed TB, automation bias, wrong image type) have mitigations |
| E12-03 | Consent and privacy controls (consent screen, deletion, no image upload by default) | FR-13, NFR-PRIV | Must | 2 | Kweku (Nana Yaw) | S3 | E9-03 | Consent captured before upload; deletion request works end to end |
| E12-04 | Safety case and limitations section | NFR-SAFE | Must | 2 | Kweku (Chelsea) | S4 | E12-02 | Hazard log closed or accepted; limitations shown in app and report |

## E13. DevOps, CI/CD and QA

| ID | Story | Req | Pri | Pts | Owner (support) | Sprint | Depends on | Acceptance criteria |
|-------|----------------------------|---------|------|----|--------------|-----|---------|--------------------------------------|
| E13-01 | Preview deploys, environments and secrets handling | NFR-MAINT | Must | 1 | Nana Yaw | S1 | E0-02 | Every PR gets a preview URL; no secrets in the repo |
| E13-02 | Offline end-to-end tests (Playwright) | NFR-REL | Must | 2 | Nana Yaw (Kweku) | S2 | E8-06 | Offline capture-to-result flow is tested in CI |
| E13-03 | Performance budgets and security scan in CI | NFR-PERF, NFR-SEC | Should | 2 | Nana Yaw | S3 | E13-01 | CI fails on app shell over 300 KB gzip or high-severity findings |
| E13-04 | Release pipeline, backups and monitoring | NFR-REL, NFR-OBS, NFR-COST | Must | 3 | Nana Yaw (Kweku) | S4 | E13-01 | One-command release and rollback; daily DB backup restored once; opt-in error logs and billing alert set |

## E14. Capstone Delivery

| ID | Story | Req | Pri | Pts | Owner (support) | Sprint | Depends on | Acceptance criteria |
|-------|----------------------------|---------|------|----|--------------|-----|---------|--------------------------------------|
| E14-01 | Report: ML methods and results | - | Must | 4 | Chelsea (Kweku) | S4 | E11-01 | Methods, results, limits and reproducibility sections complete |
| E14-02 | Deployment and operations runbook | - | Must | 2 | Nana Yaw | S4 | E13-04 | A teammate follows the runbook and deploys from scratch |
| E14-03 | Report: system design, HCI and safety | - | Must | 3 | Kweku (Micheal) | S4 | E12-04 | Architecture, usability results and safety case sections complete |
| E14-04 | Demo video and live demo script | - | Must | 3 | Micheal (Kweku) | S4 | E8-10 | 3-minute video; offline live demo rehearsed twice; backup recording ready |
| E14-05 | User guide, README and developer docs | - | Must | 3 | Micheal (Nana Yaw) | S4 | E14-02 | Health-worker quick guide (1 page) and developer README tested by a newcomer |

# 4. Icebox: Stretch Ideas (Could)

Not scheduled. Pull in only when a sprint finishes early and the project manager and team lead agree. Swap, never add: if a Could story comes in, something of equal size goes out or the sprint ends early.

| ID | Idea | Points | Pull in when |
|--------|--------------------------------------------------------|--------|------------------------------------------------|
| E15-01 | DICOM file support in the browser (parse, window/level, strip tags) | 3 | Pull in first: digital X-ray files are the easy case clinics may already have |
| E15-02 | Local retrospective validation at a partner clinic | 8 | Only if ethics approval and a data-sharing agreement are in place by week 5 |
| E15-03 | Lung-field segmentation (U-Net) to crop the X-ray before classification | 5 | If external TB results show poor transfer; reuses the U-Net replication |
| E15-04 | Printable offline referral slip (PDF) | 2 | If usability tests ask for it |
| E15-05 | Twi, Ga and Ewe UI strings with native-speaker review | 3 | After the localization framework (E8-09) is done |
| E15-06 | Agentic evaluation reporter: runs the benchmark suite on each new model and drafts the model card for human review | 3 | If model versions are changing often |
| E15-07 | Native Android build (TFLite) compared with the PWA | 5 | If PWA latency misses the budget on the reference phone |
| E15-08 | Agentic referral-letter drafting (online only, clinician-edited, never diagnostic) | 5 | Only after safety case sign-off |
| E15-09 | Lung ultrasound (POCUS) pneumonia classifier prototype | 8 | Only if ahead of plan; adds a third image type |
| E15-10 | Federated learning simulation across 3 simulated sites | 8 | Research extra; only if ahead of plan |

Icebox total: 50 points.

# 5. Requirement Traceability

Every requirement in the TRD maps to at least one story. Requirements in the TRD that appear here with 0 stories would be a gap.

| Requirement | Backlog stories | Points |
|------------------|----------------------------------------------------------------------|--------|
| FR-01 | E1-04, E8-03 | 3 |
| FR-02 | E4-03 | 3 |
| FR-03 | E4-02 | 3 |
| FR-04 | E2-02, E2-03, E2-04, E3-02, E5-02, E8-04 | 17 |
| FR-05 | E0-04, E6-01, E8-05 | 7 |
| FR-06 | E6-02 | 2 |
| FR-07 | E8-02, E8-06 | 5 |
| FR-08 | E9-01, E9-02 | 6 |
| FR-09 | E9-01, E9-03 | 6 |
| FR-10 | E10-01 | 3 |
| FR-11 | E10-02 | 3 |
| FR-12 | E2-05, E9-04 | 4 |
| FR-13 | E12-03 | 2 |
| FR-14 | E8-09 | 2 |
| FR-16 | E4-01, E8-07 | 5 |
| FR-17 | E9-01 | 3 |
| ML-CALIB | E6-01 | 3 |
| ML-DATA | E1-03, E3-01 | 4 |
| ML-EVAL | E11-01, E11-03 | 5 |
| ML-FAIR | E6-03 | 2 |
| ML-ROBUST | E1-04, E1-05, E7-01, E7-02 | 9 |
| ML-TRAIN | E2-01, E2-02, E2-03, E2-04, E3-02 | 14 |
| NFR-COMP | E11-02 | 2 |
| NFR-COST | E13-04 | 3 |
| NFR-LOC | E8-09 | 2 |
| NFR-MAINT | E0-01, E0-02, E1-02, E5-03, E13-01 | 7 |
| NFR-OBS | E13-04 | 3 |
| NFR-OFFL | E8-02 | 3 |
| NFR-PERF | E5-01, E5-04, E11-02, E13-03 | 8 |
| NFR-PRIV | E1-01, E8-06, E12-03 | 5 |
| NFR-REL | E11-04, E13-02, E13-04 | 8 |
| NFR-SAFE | E0-04, E12-01, E12-02, E12-04 | 5 |
| NFR-SEC | E2-05, E9-03, E9-04, E13-03 | 9 |
| NFR-SIZE | E5-02 | 2 |
| NFR-USAB | E8-01, E8-08, E8-10 | 8 |

# 6. Backlog Rules

- New ideas go to the icebox first. The project manager reviews the icebox in backlog refinement.
- A story is ready when it has an owner, acceptance criteria, dependencies named, and fits in one sprint (4 points or fewer; split larger ones).
- A story is done only when it meets the Definition of Done in the Team Rules document.
- Points are never edited after the sprint starts. If a story turns out bigger, finish what is possible, split the rest and move it.
- Scope changes follow the swap rule: add one, remove one of similar size.
