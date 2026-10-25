# Intended use and success metrics (frozen)

**Story:** E0-04 (FR-05, NFR-SAFE). **Owner:** Kweku. **Support:** Micheal.
**Status:** Draft for sign-off. It becomes frozen when all four members sign below.
**Source:** [TRD 3.1 to 3.4](../planning/01_TRD.md). Every statement and number here is copied from the baseline. Nothing is new.

After sign-off, this page changes only through an ADR plus a row in the Team Rules change log (Team Rules 12).

## Intended use (TRD 3.3)

> TriageLens is a research prototype for **trained health workers** at primary-care and district facilities. It analyses a chest X-ray (people aged 15 and over) or a retinal image (adults with diabetes) and **suggests** a screening result and referral advice. It **does not diagnose**, does not replace laboratory or clinician confirmation, and must not be used for emergencies or as the only basis for a decision. It is not a certified medical device.

| | |
|---|---|
| **Users** | Trained health workers at primary-care and district facilities. Clinician reviewers and programme admins use the review and dashboard views (TRD 6.1). |
| **Patients** | Chest X-ray: people aged 15 and over. Retinal image: adults with diabetes (TRD 3.3, 6.2). |
| **Conditions** | Tuberculosis and pneumonia (chest X-ray); referable diabetic retinopathy (retinal image) (TRD 4.1). |
| **Output** | One zone per case: Refer now, Unsure (retake or refer), or Low risk, with plain advice and the model version (FR-05). |
| **Reminder on every result** | "Screening support only. A clinician decides." (TRD 7.3) |

**Not for** (TRD 3.2, 4.5): replacing radiologists, eye specialists or lab confirmation; diagnosing individual patients or recommending treatment; children's X-rays; emergencies; treatment advice or any "diagnosis" wording; medical-device approval.

## Success metrics (TRD 3.4)

The **target** is what we aim for. The **floor** is the minimum acceptable. A result below the floor triggers a recorded decision and a fix plan. Results are **always reported honestly**, including when they miss the target.

| Area | Metric | Target | Floor | Measured on |
|------|--------|--------|-------|-------------|
| TB screening | AUROC on external chest X-ray sets | at least 0.90 | at least 0.80 | Montgomery, India set (external) |
| TB screening | Sensitivity at the chosen threshold, with specificity at least 70% | at least 90% | at least 85% | Same; follows the WHO triage target |
| Pneumonia | AUROC on external set | at least 0.85 | at least 0.75 | VinDr-CXR (external) |
| DR | Referable-DR sensitivity with specificity at least 80% | at least 85% | at least 80% | Messidor-2, IDRiD, mBRSET |
| DR | AUROC on external sets | at least 0.93 | at least 0.85 | Same |
| Phone photos | AUROC drop on real phone photos vs clean images | at most 0.05 | at most 0.10 | Team photo set (300+), CheXphoto |
| Compression | AUROC drop from int8 vs full precision | at most 0.015 | at most 0.03 | Internal test set |
| Calibration | Expected calibration error after calibration | at most 0.05 | at most 0.10 | Validation and external sets |
| Image gate | Share of invalid images rejected | at least 95% | at least 90% | Mixed non-medical and wrong-type set |
| Speed | p95 inference time per image, reference phone | at most 2.5 s | at most 4 s | Benchmark harness |
| Size | Each model, int8 | at most 15 MB | at most 25 MB | Build artifact |
| Offline | Core flow works with no internet | 100% | 100% | Automated offline tests |
| Usability | System Usability Scale (SUS) | at least 75 | at least 68 | 5+ health workers, 2 rounds |
| Usability | Task success on first screening | at least 90% | at least 80% | Same |
| Usability | Median time to first result | at most 90 s | at most 150 s | Same |
| Delivery | Must points delivered on schedule | at least 90% | at least 80% | Sprint reports |

`scripts/tests/test_intended_use.py` checks in CI that this table matches TRD 3.4 row for row.

## Goals these metrics serve (TRD 3.1)

1. **G1 Triage support:** a fast, reliable "who needs referral first" signal for TB, pneumonia and DR.
2. **G2 Works where the clinics are:** fully offline on a low-end Android phone with 2 GB RAM.
3. **G3 Safe by design:** prefer "refer" or "retake" over false reassurance; make limits visible.
4. **G4 Evidence, not claims:** accuracy with confidence intervals on unseen data, phone photos and a cheap phone.
5. **G5 Deliverable in nine weeks** by four people without overwork.

## Where the statement must appear

- Every result screen: the reminder above (NFR-SAFE-01).
- The report, the demo and the user guide: who the tool is for, who it is not for, and where the data comes from (Team Rules 9.5, TRD 12.5).
- The demo says on screen that it uses public or fake data only (TRD 12.5).

Related hazards: H2 (over-reliance), H5 (out-of-scope patients), H10 (misuse as a diagnostic tool) in [hazard-log.md](hazard-log.md).

## Sign-off (E0-04 acceptance: approved by all)

By signing, each member confirms the statement and the metrics above, unchanged from the TRD.

| Name | Role | Approved (yes/no) | Date | Comment |
|------|------|-------------------|------|---------|
| Kweku | Team lead and product owner | | | |
| Chelsea | ML lead | | | |
| Nana Yaw | DevOps and QA lead | | | |
| Micheal | Project manager | | | |

Approval can also be given as a PR review approval on the PR that adds this page, or as a comment on issue #4. Copy each approval into the table above.
