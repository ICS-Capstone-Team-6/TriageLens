---
title: "Sprint Plan"
subtitle: "TriageLens: Nine-Week Fast-Track Delivery"
date: "15 October 2026"
---

> Baseline v1.0 (15 Oct 2026). Do not edit in place. Change requirements through an ADR in docs/adr/ and record the change in the change log of docs/planning/04_Team_Rules_and_Requirements.md.

# 1. Plan at a Glance

The build runs for **nine weeks**: a one-week Sprint 0 and four two-week sprints. Dates assume a start on **Monday 19 October 2026** and a final delivery on **Friday 18 December 2026**. If the real deadline is different, keep the sprint order and cut from the Should list (see the backlog cut order).

The plan follows one idea: **get a thin slice working on a real phone by the end of Sprint 1, then widen and prove it.** Every sprint ends with something that can be demonstrated, not just code merged.

![Nine-week roadmap](../figures/roadmap.png){ width=100% }

## 1.1 Calendar and Capacity

| Sprint | Dates | Working days | Points | Stories | Gate |
|----------|------------------------------|---------|--------|--------|------------------------------|
| Sprint 0 | Mon 19 Oct to Fri 23 Oct 2026 | 5 | 16 | 11 | G0: Fri 23 Oct |
| Sprint 1 | Mon 26 Oct to Fri 6 Nov 2026 | 10 | 32 | 15 | G1: Fri 6 Nov |
| Sprint 2 | Mon 9 Nov to Fri 20 Nov 2026 | 10 | 32 | 12 | G2: Fri 20 Nov |
| Sprint 3 | Mon 23 Nov to Fri 4 Dec 2026 | 9 | 32 | 13 | G3: Thu 3 Dec (feature freeze) |
| Sprint 4 | Mon 7 Dec to Fri 18 Dec 2026 | 10 | 32 | 12 | G4: Fri 18 Dec |

Totals: **144 points**, 63 stories. Must 121 points, Should 23 points.

Notes on the calendar:

- Friday 4 December 2026 is expected to be Farmers' Day, a public holiday in Ghana. Sprint 3 is planned as 9 working days. The 15 to 20 percent buffer absorbs this; if not, cut from the Should list. Please confirm the date.
- Add any exam or assignment weeks from the MPhil timetable to this table in Sprint 0. If a person is away for a week, move their Should stories out first.
- Gate G3 is a **feature freeze**. After Thursday 3 December, only fixes, tests, documentation and the report are allowed.

## 1.2 Capacity Model

| Item | Value | Why |
|--------------------------------------|------------------|----------------------------------------------------|
| Available hours per person per week | 12 (assumed) | Team members also carry other courses and work. Update after Sprint 0 if wrong. |
| Planned hours per person per week | 10 | About 83 percent of availability; the rest is buffer. |
| Hours per point | 2.5 | Includes review, testing and notes. |
| Points per person per two-week sprint | 8 | 8 x 2.5 = 20 hours. |
| Team commitment per two-week sprint | 32 | Four people. |
| Sprint 0 | 16 | One week, 4 points each. |

**Velocity check.** After Sprint 1, compare points finished with points committed. If the team finishes fewer than 26 points in a two-week sprint, the project manager and team lead move Should stories out immediately instead of working longer hours.

# 2. Sprint Rhythm (Light Ceremonies)

Meeting time is capped at about 2.5 hours per person per week. Everything else is async.

| Ritual | When | Length | Purpose |
|--------------------|----------------------------|------------------|----------------------------------------------------|
| Sprint planning | First Monday of the sprint | 45 min (30 in Sprint 0) | Confirm the sprint goal, check dependencies, confirm owners can really fit their load. |
| Async check-in | Every working day by 10:00, in the team chat | 3 lines | Done, next, blocked. No meeting. |
| Live sync | Tuesday and Thursday | 15 min | Unblock people, decide quickly, agree who pairs with whom. |
| Backlog refinement | Wednesday of week 1 | 30 min | Check the next sprint's stories are ready and sized. |
| Sprint review and demo | Last Friday of the sprint | 30 min | Demo against the exit criteria on a real phone. |
| Retrospective and health check | Last Friday, right after the review | 30 min | What to start, stop, keep. Everyone rates workload from 1 (too light) to 5 (too heavy). |

# 3. Sprint-by-Sprint Plan

## 3.1 Sprint 0: Mon 19 Oct to Fri 23 Oct 2026

**Goal.** Everyone can ship: repo, CI, data, a baseline model and a plan.

**Gate G0 (Fri 23 Oct). Exit criteria:**

- Repo and CI are live; every member has merged a pull request.
- Core datasets are downloaded, checksummed and versioned; split manifests committed.
- A baseline TB classifier trains and evaluates with one command.
- Intended-use statement and success metrics are frozen.
- Ethics route is named and a clinic contact is identified.
- Low-fidelity user flows drafted from at least 3 health-worker interviews.

**Commitment:** 16 points, 11 stories.

Order of work: repo and CI first (Nana Yaw), so everyone can open pull requests on day 1. Data download and checksums, then splits and the baseline model (Nana Yaw, then Chelsea).

**Kweku** (4 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E0-04 | Freeze intended-use statement and success metrics | Must | 1 | Micheal | none |
| E8-01 | UX plan: interview 3+ health workers; low-fidelity flows | Must | 2 | Micheal | none |
| E12-01 | Ethics pathway: IRB route, protocol outline, clinic contact | Must | 1 | Micheal | none |

**Chelsea** (4 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E1-03 | EDA, data cards, patient-level splits and duplicate check (TB, pneumonia) | Must | 2 | Nana Yaw | E1-02 |
| E2-01 | Pipeline smoke test: baseline TB classifier end to end | Must | 2 | Kweku | E1-03 |

**Nana Yaw** (4 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E0-01 | Set up monorepo, branch rules, PR template and CODEOWNERS | Must | 1 | none | none |
| E0-02 | CI skeleton: lint, type-check and unit tests on every PR | Must | 1 | Kweku | E0-01 |
| E1-02 | Download, checksum and version core datasets (downsized copies) | Must | 2 | Chelsea | E1-01 |

**Micheal** (4 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E0-03 | Board, Definition of Done and working agreement agreed | Must | 1 | Kweku | none |
| E1-01 | Request dataset access; build licence and usage register | Must | 1 | Chelsea | none |
| E4-01 | Spike: live capture guidance (frame, tilt, glare detection) | Should | 2 | Kweku | none |

**Sprint risks and fallbacks**

- Dataset access requests take longer than a week. Fallback: start with fully public sets (TBX11K, Shenzhen, Montgomery, APTOS).
- Reference phone not available. Fallback: borrow one team member's budget phone and record its model and specs.

## 3.2 Sprint 1: Mon 26 Oct to Fri 6 Nov 2026

**Goal.** A thin slice on a real phone: capture a chest X-ray photo and get a TB and pneumonia result offline.

**Gate G1 (Fri 6 Nov). Exit criteria:**

- Demo on the reference phone: camera or upload, quality check, TB and pneumonia output, fully offline.
- Models export to ONNX and quantize to int8; parity test runs in CI.
- Supabase schema and row-level security are in place and tested.
- DR data is prepared and split; hazard log v1 exists.
- Benchmark harness reports latency and memory on the reference phone.

**Commitment:** 32 points, 15 stories.

Order of work: week 1 is ONNX export (Chelsea) and the inference worker skeleton (Micheal) on a stub model. Week 2 swaps in the real model and runs parity and device benchmarks. Capture screen (Kweku) lands before the quality checks (Micheal).

**Kweku** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E3-01 | DR data prep: APTOS plus EyePACS subsample, splits, preprocessing | Must | 2 | Chelsea | E1-02 |
| E8-02 | PWA shell: install, offline cache, routing, design tokens | Must | 3 | Micheal | E0-01 |
| E8-03 | Capture screen: camera and file upload | Must | 2 | Micheal | E8-02 |
| E12-02 | Hazard log v1 | Must | 1 | Chelsea | E0-04 |

**Chelsea** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E2-02 | TB model v1 (small backbone, transfer learning) | Must | 3 | Kweku | E1-03 |
| E2-03 | Pneumonia model; compare multi-task (masked loss) with separate models | Must | 3 | Micheal | E2-02 |
| E5-02 | ONNX export and int8 quantization pipeline | Must | 2 | Nana Yaw | E2-02 |

**Nana Yaw** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E5-01 | Reference low-end phone and benchmark harness | Must | 2 | none | none |
| E5-03 | ONNX parity and accuracy-drop checks in CI | Must | 2 | Chelsea | E5-02 |
| E9-01 | Supabase project, schema v1, row-level security by facility, audit log | Must | 3 | Kweku | none |
| E13-01 | Preview deploys, environments and secrets handling | Must | 1 | none | E0-02 |

**Micheal** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E0-05 | Risk register live and sprint rituals running | Must | 1 | none | E0-03 |
| E1-04 | Phone-photo capture protocol and capture kit | Must | 1 | Chelsea | none |
| E4-02 | Quality checks: blur, glare, exposure, framing, with retake advice | Must | 3 | Nana Yaw | E8-03 |
| E8-04 | Inference worker: run ONNX in a web worker with model cache | Must | 3 | Chelsea, Nana Yaw | E5-02 |

**Sprint risks and fallbacks**

- Quantized model is too slow on the reference phone. Fallback: smaller backbone or lower input size (see TRD ADR-3).
- Cross-origin isolation headers break threading. Fallback: single-thread build, measure, decide in Sprint 3.

## 3.3 Sprint 2: Mon 9 Nov to Fri 20 Nov 2026

**Goal.** All three conditions, safe outputs, and data syncing.

**Gate G2 (Fri 20 Nov). Exit criteria:**

- DR model runs on-device next to the chest X-ray models.
- Results are calibrated and shown in three zones with plain-language advice.
- Modality gate rejects non-medical and wrong-type images.
- Cases are saved locally (encrypted) and sync after being offline; sign-in and roles work.
- Phone-photo simulation pipeline exists and 300+ real phone photos of X-rays are captured.
- Offline end-to-end tests run in CI.

**Commitment:** 32 points, 12 stories.

Order of work: the local case log (Kweku) lands first, because sync tests (Nana Yaw) and offline end-to-end tests depend on it. The photo set (Micheal) can be captured in two short sessions in week 1.

**Kweku** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E6-01 | Calibration (temperature scaling) and three-zone thresholds | Must | 3 | Chelsea | E2-03 |
| E8-05 | Result screen: risk zone, confidence, referral advice, 4-symptom checklist | Must | 3 | Micheal | E6-01 |
| E8-06 | Local case log: pseudonymous ID, notes, encrypted images | Must | 2 | Nana Yaw | E8-02 |

**Chelsea** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E2-04 | Tune TB and pneumonia models; try teacher-student distillation | Must | 3 | Nana Yaw | E2-03 |
| E3-02 | DR model v1 (5-grade ordinal plus referable-DR flag) | Must | 3 | Kweku | E3-01 |
| E7-01 | Phone-photo simulation pipeline (glare, tilt, moire, blur, lighting) | Must | 2 | Micheal | E1-04 |

**Nana Yaw** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E9-02 | Sync outbox with idempotent upserts and conflict rules | Must | 3 | Kweku | E9-01, E8-06 |
| E9-03 | Auth and roles; offline PIN unlock | Must | 3 | Kweku | E9-01 |
| E13-02 | Offline end-to-end tests (Playwright) | Must | 2 | Kweku | E8-06 |

**Micheal** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E1-05 | Photograph test set: 300+ displayed or printed X-rays, 2+ phones | Must | 3 | Chelsea | E1-04 |
| E4-03 | Modality and out-of-distribution gate (X-ray, fundus, other) | Must | 3 | Chelsea | E2-02 |
| E6-02 | Heatmap (class activation map) from model features in the browser | Should | 2 | Kweku | E5-02 |

**Sprint risks and fallbacks**

- DR model needs higher resolution than the latency budget allows. Fallback: 384 px with a lighter backbone; document the trade-off.
- Sync and auth both land late. Fallback: ship auth first; sync can be tested with a seeded local queue.

## 3.4 Sprint 3: Mon 23 Nov to Fri 4 Dec 2026

**Goal.** Prove it works: external validation, device performance and the first user tests.

**Gate G3 (Thu 3 Dec (feature freeze)). Exit criteria:**

- External validation results for all three conditions, with confidence intervals.
- Photo-robust model trained; ablation shows clean vs simulated vs real photo results.
- Device benchmark report meets the performance budget or documents the gap.
- Usability round 1 done and top issues fixed; consent and privacy controls work.
- Clinician review screen and admin dashboard work (Should items; cut if behind).
- Feature freeze: no new features after this gate.

**Commitment:** 32 points, 13 stories.

Order of work: external validation (Chelsea) runs in week 1 on locked sets, one time only. Usability round 1 (Kweku) needs the result screen from Sprint 2. Perf tuning (Nana Yaw) needs the inference worker.

**Kweku** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E8-08 | Usability round 1 (5+ users) and fixes | Must | 3 | Micheal | E8-05 |
| E10-01 | Clinician review screen and feedback loop | Should | 3 | Nana Yaw | E9-02 |
| E12-03 | Consent and privacy controls (consent screen, deletion, no image upload by default) | Must | 2 | Nana Yaw | E9-03 |

**Chelsea** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E6-03 | Subgroup and failure analysis (sex, age band, source site, image type) | Should | 2 | Kweku | E11-01 |
| E7-02 | Photo-robust retraining and ablation (clean vs simulated vs real photos) | Must | 3 | Kweku | E7-01, E1-05 |
| E11-01 | External validation runs (locked external sets, one-shot) | Must | 3 | Kweku | E2-04, E3-02 |

**Nana Yaw** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E5-04 | Low-end performance tuning (WASM SIMD and threads, warm-up, memory) | Must | 2 | Micheal | E8-04 |
| E9-04 | Model registry, over-the-air update and rollback | Should | 2 | Chelsea | E5-02, E9-01 |
| E11-02 | Device benchmark report (reference phone plus one mid-range) | Must | 2 | Micheal | E5-04 |
| E13-03 | Performance budgets and security scan in CI | Should | 2 | none | E13-01 |

**Micheal** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E8-07 | Capture guidance overlay (live frame, tilt, glare hints, auto-capture) | Should | 3 | Kweku | E4-01 |
| E8-09 | Localization framework and plain-language, icon-first UI | Should | 2 | Kweku | E8-05 |
| E10-02 | Admin dashboard: volumes, referral rate, reviewer agreement | Should | 3 | Kweku | E10-01 |

**Sprint risks and fallbacks**

- External validation shows a large drop. This is a result, not a failure: report it, try photo-aware and distilled variants, and state limits clearly.
- Usability participants are hard to find. Fallback: nursing students or community health volunteers, with consent.

## 3.5 Sprint 4: Mon 7 Dec to Fri 18 Dec 2026

**Goal.** Freeze, verify and deliver.

**Gate G4 (Fri 18 Dec). Exit criteria:**

- Final models frozen with signed manifests and model cards.
- Regression, offline soak and load tests pass.
- Usability round 2 reaches SUS of at least 75.
- Capstone report, demo video, user guide and ops runbook are delivered.
- Repo tagged v1.0 and handover pack complete.

**Commitment:** 32 points, 12 stories.

Order of work: model freeze comes first (Chelsea, start of week 1) so documentation and soak tests use final artifacts. The report, demo and user guide fill week 2. Do not start new features.

**Kweku** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E8-10 | Usability round 2 (5+ users) and polish | Must | 3 | Micheal | E8-08 |
| E12-04 | Safety case and limitations section | Must | 2 | Chelsea | E12-02 |
| E14-03 | Report: system design, HCI and safety | Must | 3 | Micheal | E12-04 |

**Chelsea** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E2-05 | Final model selection, freeze and signed manifests | Must | 2 | Nana Yaw | E11-01 |
| E11-03 | Model cards and results tables | Must | 2 | Kweku | E11-01 |
| E14-01 | Report: ML methods and results | Must | 4 | Kweku | E11-01 |

**Nana Yaw** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E11-04 | Regression, offline soak and load tests | Must | 3 | Micheal | All features |
| E13-04 | Release pipeline, backups and monitoring | Must | 3 | Kweku | E13-01 |
| E14-02 | Deployment and operations runbook | Must | 2 | none | E13-04 |

**Micheal** (8 points)

| ID | Story | Pri | Pts | Support | Depends on |
|--------|----------------------------------------------------|------|----|--------------|--------------|
| E0-06 | Final retro, handover pack and repo archive | Should | 2 | Kweku | All |
| E14-04 | Demo video and live demo script | Must | 3 | Kweku | E8-10 |
| E14-05 | User guide, README and developer docs | Must | 3 | Nana Yaw | E14-02 |

**Sprint risks and fallbacks**

- Late bug found during soak tests. Fallback: freeze, fix, re-run; do not add features.
- Demo has no internet. Fallback: demo fully offline; keep a recorded backup video.

# 4. Quality Gates

A gate is a short checkpoint (30 minutes, part of the sprint review). The team lead and project manager decide pass, pass with actions, or hold.

| Gate | Date | Checks |
|--------|--------------|--------------------------------------------------------------------------------------|
| G0 | Fri 23 Oct | Repo and CI green; datasets versioned; baseline trained; intended use frozen; ethics route named. |
| G1 | Fri 6 Nov | Offline TB and pneumonia result on the reference phone; parity test in CI; RLS tested; hazard log v1. |
| G2 | Fri 20 Nov | Three conditions on-device; calibrated three-zone results; sync, auth and offline end-to-end tests pass; 300+ photos captured. |
| G3 | Thu 3 Dec | External validation done; device report; usability round 1 fixes; consent flows; feature freeze. |
| G4 | Fri 18 Dec | Models frozen with cards; soak tests; SUS of 75 or more; report, demo, guide and runbook delivered; v1.0 tag. |

# 5. Tracking Progress

- **Board columns:** Ready, In progress (max 2 per person), In review, Done.
- **Burndown:** the project manager updates a simple points-remaining line every Friday. A flat line for a full week triggers an extra live sync.
- **Demo-first:** a story is not done until it is merged, tested and visible in the latest preview build.
- **Escalation:** blocked for more than 1 working day goes to the project manager; a blocker that threatens a gate goes to the team lead the same day.
- **Change control:** scope changes use the swap rule. Anything that moves a gate date needs both the team lead and project manager.

# 6. If Ahead of Plan

Pull from the icebox in the order listed in the backlog (DICOM support first). Do not pull stretch work before the sprint's Must stories are done and the buffer is protected. A team that finishes early should rest or help pair, not take on more.
