---
name: ml-experiment-protocol
description: Experiment discipline for TriageLens ML work. Use when writing or reviewing training, data-split, evaluation, calibration or threshold code under ml/, planning a training run, or reporting model metrics. Enforces patient-level splits, locked external test sets, validation-only thresholds, three seeds, run logging and model-card freeze rules.
paths:
  - "ml/**"
allowed-tools: Read, Grep, Glob
---

# ML experiment protocol

Enforces TRD 9 (9.2 data, 9.4 training, 9.6 calibration, 9.7 robustness, 9.8 evaluation, 9.9 subgroups, 9.10 versioning), TRD 13.2, Team Rules 5.3 and 7.
Supports stories E1-03, E2-01 to E2-05, E3-01, E3-02, E6-01, E6-03, E7-01, E7-02, E11-01, E11-03.

Phone-photo protocol and simulation requirements: see [reference.md](reference.md).

## Before any run

- [ ] Every dataset used has a data card and a licence entry (ML-DATA-01, E1-01).
- [ ] Splits are by **patient**, never by image, with a fixed seed and a **committed manifest** in `ml/manifests/` (ML-DATA-02).
- [ ] Exact and near-duplicate images removed (hash plus perceptual hash); source overlap checked (for example TBX11K vs Shenzhen and Montgomery) before external sets are assigned (ML-DATA-03, Appendix A).
- [ ] No excluded dataset in training. **Kermany paediatric set is excluded** (ML-DATA-05).
- [ ] Large sets used as downsized, versioned copies (ML-DATA-06). Datasets never committed or redistributed (ML-DATA-07).
- [ ] Check the shared GPU log first; small runs before large ones (Team Rules 7, about 80 GPU-hours in total, A3).

## Locked sets (ML-DATA-04, Team Rules 7)

External test sets: Montgomery, India TB sets (TB); VinDr-CXR (pneumonia); Messidor-2, IDRiD, mBRSET (DR) (Appendix A).

- Never used for training, tuning, early stopping or threshold choice.
- Evaluated **once per frozen model candidate** (E11-01). Record the date and candidate version of each run.
- If code reads a locked set outside an evaluation script tagged for a frozen candidate: **stop and flag it**.

## Training (TRD 9.3, 9.4)

- No horizontal flip for chest X-rays.
- Early stopping on **validation** AUROC.
- Chest X-ray multi-task uses a masked loss; fall back to two models if worse by more than 0.02 AUROC (ADR-4, E2-03).
- **Three seeds** per final configuration; report mean and spread.
- Same preprocessing code path in Python and the browser (TRD 9.3).

## Logging (TRD 9.4, Team Rules 7, Definition of Done 5.2 item 4)

Every run logs: config, seed, data manifest hash, code commit, metrics. A run missing any of these does not count as a result.

## Calibration and thresholds (TRD 9.6)

- Temperature scaling fitted on the **validation split only** (ML-CALIB-01).
- Screen-out threshold: validation sensitivity at least 90% (TB) or the DR target; refer threshold at a high-specificity point (ML-CALIB-02).
- Thresholds and temperatures live in a signed, versioned file, never in code (ML-CALIB-03).
- Report selective-prediction curves and the share of Unsure cases (ML-CALIB-04).

## Evaluation (TRD 9.8, 9.9)

- [ ] AUROC, AUPRC, sensitivity and specificity at thresholds, PPV and NPV at 1, 5 and 10% prevalence, calibration error (ML-EVAL-01).
- [ ] 95% CIs by bootstrap with 1,000 resamples; DeLong for AUROC comparisons (ML-EVAL-02).
- [ ] Internal, external, phone-photo and int8 results side by side (ML-EVAL-03).
- [ ] 20 worst failures per model reviewed and categorized: label error, image quality, shortcut, true miss (ML-EVAL-04).
- [ ] Shortcut check (text, markers, device tags) before trusting a metric (Team Rules 7, H11).
- [ ] Compared against a simple baseline (Team Rules 7).
- [ ] Subgroups by sex, age band, source site, image type; missing groups stated; flag any subgroup with sensitivity more than 10 points below overall (TRD 9.9, H12).
- [ ] Small sets reported with their wide intervals, no over-claiming (ML-EVAL-06).
- [ ] Weak and negative results reported next to strong ones (Team Rules 7, TRD 12.5).

## Freeze (TRD 9.10, Team Rules 5.3)

A model version is releasable only when: no split leakage; training reproducible (same config and seed within 0.01 AUROC, TRD 13.2); internal, external, phone-photo and int8 results with CIs; calibration on validation only; thresholds in a signed file; subgroup results; model card complete (`docs/model-cards/TEMPLATE.md`); parity test passes; hazard log updated.
Frozen models are immutable. Any change is a new version with full re-validation.

## Targets (TRD 3.4)

TB external AUROC 0.90 (floor 0.80); TB sensitivity 90% at specificity 70% or more (floor 85%); pneumonia external AUROC 0.85 (floor 0.75); DR referable sensitivity 85% at specificity 80% or more (floor 80%); DR AUROC 0.93 (floor 0.85); ECE 0.05 (floor 0.10). A result below the floor needs a recorded decision and fix plan, and is still reported.
