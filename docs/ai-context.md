# TriageLens: AI context digest

Short digest loaded into every Claude Code session through `CLAUDE.md`. Every fact comes from the baseline v1.0 documents and is cited. Do not add facts that are not in the documents. Update it through a pull request when an ADR changes a baseline fact.

## Project

A phone app (an installable PWA) for trained health workers at district clinics in Ghana. It checks image quality, runs AI on the phone with no internet, and shows Refer now, Unsure (retake or refer), or Low risk for TB and pneumonia (chest X-ray, ages 15 and over) and referable diabetic retinopathy (retinal image). It runs on a low-end Android phone with 2 GB RAM and syncs when online. This is a nine-week capstone research prototype, built by four people (TRD 2, 3.1).

## Intended use (TRD 3.3, frozen)

Research prototype for trained health workers. It **suggests** a screening result and referral advice. It **does not diagnose**, does not replace lab or clinician confirmation, is not for emergencies or as the only basis for a decision, and is not a certified medical device. Not for children's X-rays (TRD 3.2).

## Zones and fail-safe (TRD 7.2, 7.3)

| Zone | Rule per condition |
|------|--------------------|
| Refer now (red) | score at or above refer threshold |
| Unsure (amber) | between thresholds, or borderline image, or symptoms contradict a low score |
| Low risk (green) | at or below screen-out threshold, good quality, no symptoms raising it |

- Case zone = **worst** condition zone. Failed quality check = **no zone**. Uncertainty moves toward refer or retake (TRD 7.2).
- Symptoms can raise a zone, never lower it (FR-05).
- Thresholds are chosen on validation data only; they are stored in a signed, versioned file (TRD 7.2, ML-CALIB-03).
- Allowed words: high risk, low risk, refer, not sure, retake. Forbidden: diagnosis, positive, negative, healthy, "you do not have" (TRD 7.3).
- Every result shows "Screening support only. A clinician decides." Colour plus icon plus text (TRD 7.3).

## Target metrics and floors (TRD 3.4)

| Metric | Target | Floor |
|--------|--------|-------|
| TB external AUROC | 0.90 | 0.80 |
| TB sensitivity (spec at least 70%) | 90% | 85% |
| Pneumonia external AUROC | 0.85 | 0.75 |
| DR referable sensitivity (spec at least 80%) | 85% | 80% |
| DR external AUROC | 0.93 | 0.85 |
| AUROC drop on phone photos | at most 0.05 | 0.10 |
| AUROC drop int8 vs fp32 | at most 0.015 | 0.03 |
| ECE after calibration | at most 0.05 | 0.10 |
| Invalid images rejected | 95% | 90% |
| SUS | 75 | 68 |
| Must points on schedule | 90% | 80% |

## Budgets (TRD 8)

p95 inference per model at most 2.5 s (floor 4 s, TRD 3.4); capture to result p95 at most 5 s; quality gate at most 300 ms; peak memory at most 350 MB; app shell at most 300 KB gzip; first install at most 45 MB; each int8 model at most 15 MB, total offline footprint at most 60 MB; no main-thread task over 50 ms; offline core flow 100%; local queue at least 500 cases.

## Architecture decisions (TRD 10.3; docs/adr/)

- ADR-1: PWA first.
- ADR-2: ONNX Runtime Web, WebAssembly with SIMD, threads when available.
- ADR-3: backbone bake-off in Sprint 1; default MobileNetV3-Large (interim rules in ADR-15).
- ADR-4: chest X-ray multi-task with masked loss; two models if worse by more than 0.02 AUROC.
- ADR-5: static int8 with a calibration set.
- ADR-6: Supabase (Postgres, Auth, Storage, RLS).
- ADR-7: IndexedDB with an outbox; images encrypted with WebCrypto.
- ADR-8: temperature scaling and two thresholds.
- ADR-9: class activation map in the browser.
- ADR-10: image upload opt-in with consent; results-only by default.
- ADR-11: ECDSA P-256 model signing.
- ADR-12: React, TypeScript and Vite static PWA.
- ADR-13: Modal is the main GPU source; Kaggle plus Colab as fallback.
- ADR-14: M2 chest X-ray model has a TB output only (TB logit and feature map); pneumonia later.
- ADR-15: interim bake-off (MobileNetV3-Large vs EfficientNet-Lite0) on validation AUROC, then int8 drop, then size, until an external set exists.
- ADR-16: chest X-rays are stretched to 320 by 320, not padded (`cxr-pre-2`); TRD 9.3 "resize with padding" no longer applies.
- ADR-17: int8 calibration images come from the train split; the bake-off int8 drop is measured on validation.

## Model interfaces (TRD 10.6)

| Model | Input (float32, normalized) | Outputs | Size |
|-------|-----------------------------|---------|------|
| `cxr-tb-pneu` | [1, 3, 320, 320], stretched not padded (ADR-16) | TB logit, pneumonia logit, feature map (M2: TB logit and feature map only, ADR-14) | at most 15 MB |
| `dr` | [1, 3, 384, 384] | 4 ordinal logits, feature map | at most 15 MB |
| `gate` | [1, 3, 224, 224] | 5 class logits | at most 3 MB |

## Data and split rules (TRD 9.2)

Data card and licence entry before use; splits by **patient** with fixed seed and committed manifest; remove duplicates and check source overlap; external test sets **locked** (no training, tuning or thresholds; once per frozen candidate); Kermany paediatric set excluded; downsized versioned copies; never redistribute datasets.

## Roles (TRD 15.1, Team Rules 2)

- **Kweku:** team lead and product owner. Owns UX, frontend, schema and RLS, DR data and calibration, and safety and ethics.
- **Chelsea:** ML lead. Owns data, models, evaluation, photo robustness and model cards.
- **Nana Yaw:** DevOps and QA lead. Owns CI/CD, sync and auth, device benchmarks and releases.
- **Micheal:** project manager and scrum master. Owns the inference worker, capture overlay, photo test set, admin dashboard and demo.

## Sprint calendar and gates (Sprint Plan 1.1, 4)

| Sprint | Dates (2026) | Points | Gate |
|--------|--------------|--------|------|
| 0 | 19 to 23 Oct | 16 | G0 Fri 23 Oct: repo, CI, data, baseline |
| 1 | 26 Oct to 6 Nov | 32 | G1 Fri 6 Nov: thin slice offline on a real phone |
| 2 | 9 to 20 Nov | 32 | G2 Fri 20 Nov: three conditions, safe outputs, sync, auth |
| 3 | 23 Nov to 4 Dec | 32 | G3 Thu 3 Dec: validation, device report, usability 1, feature freeze |
| 4 | 7 to 18 Dec | 32 | G4 Fri 18 Dec: frozen models, report, demo, handover |

Cap: 8 points per person per two-week sprint, 4 in Sprint 0 (Team Rules 3). Fewer than 26 points done in a sprint means cut Should stories (Sprint Plan 1.2).

## Cut order if behind (Backlog 2.3)

1 E10-02 admin dashboard; 2 E8-09 localization; 3 E9-04 model registry/OTA; 4 E13-03 CI budgets and security scan; 5 E6-03 subgroup analysis; 6 E8-07 capture overlay; 7 E10-01 clinician review; 8 E6-02 heatmap; 9 E0-06 handover pack.

## Open decisions (TRD 4.6; default applies if unanswered by 23 Oct)

| ID | Decision | Default |
|----|----------|---------|
| D1 | Real submission and demo date | 18 Dec 2026 |
| D2 | Reference phone | Cheapest Android phone a team member owns |
| D3 | Clinic or nurse contact | Kweku asks through personal network (E12-01) |
| D4 | GPU source | Kaggle plus Colab; Chelsea owns the account list |
| D5 | Final product name | TriageLens |
| D6 | Members away for exams | Micheal collects dates in Sprint 0 |
