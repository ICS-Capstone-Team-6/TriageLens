# ADR-26. DR training data: APTOS without patient IDs, EyePACS subsample, padded fundus crop

- **Status:** Proposed
- **Date:** 24 Nov 2026
- **Decided by:** Kweku (owns DR data). Needs team agreement; Chelsea reviews the ML parts for E3-02.
- **Related:** E3-01, E3-02, E1-01; TRD 9.2 (ML-DATA-02, ML-DATA-06), 9.3, 10.6, Appendix A; H4, H11; [ADR-23](https://github.com/ICS-Capstone-Team-6/TriageLens/pull/116) (same patient-ID gap for TBX11K)

## Context

TRD Appendix A lists APTOS 2019 (about 3,700 images) and EyePACS (Kaggle DR 2015, about 88,000; use about 20,000) for DR training and validation. The pipeline is `ml/pipeline/build_dr.py`.

1. **APTOS has no patient IDs.** It gives one ID per image. ML-DATA-02 asks for splits by patient, so two images of one eye or person could sit in different splits.
2. **No age or sex in either source.** Both come from diabetic screening programmes, which matches the intended population (adults with diabetes), but it cannot be checked per record.
3. **TRD 9.3 says "crop black borders, resize"** for retinal images but does not say whether to pad or stretch to a square.

## Options considered

1. Use EyePACS only, which has patient IDs (`<patient>_<left|right>`). Clean splits, but loses the second source and the India population.
2. Use both. Treat each APTOS image as its own patient and group near-identical images (256-bit dHash) so re-saved copies cannot cross splits. The same approach as ADR-23.

## Decision

Option 2.

- EyePACS: both eyes of a patient share a split. A seeded subsample of about 20,000 images keeps whole patients and the natural grade mix (ML-DATA-06).
- APTOS: each image is its own patient; near-identical images are grouped. Near-identical images with different grades all go to quarantine for review.
- Split 70/15/15 by group, stratified by the group's worst grade, seed 591. Thresholds and calibration later come from the validation split only.
- Preprocessing `dr-pre-1`: crop the black border, **pad** to a square with black, resize. Padding keeps the disc round; stretching would change lesion shapes. The browser port must match it (parity test, E3-02 and E8-04).

## Consequences

- Internal APTOS test numbers may be optimistic. Claims rest on the locked external sets (Messidor-2, IDRiD, mBRSET), as for TB.
- Subgroup analysis by age and sex (E6-03) cannot cover DR training data. Report it as a missing group.
- The near-duplicate threshold (12 bits) is copied from Shenzhen. Fundus images may sit closer together. The run report gives nearest-distance quantiles; re-check the threshold on the first real run before training.
- **Blocker:** neither licence is checked yet (E1-01, draft PR #104). The pipeline must not run on real data until the licence register says the terms allow it.
- If accepted, add an ML-DATA-02 exception for APTOS to the change log in `docs/planning/04_Team_Rules_and_Requirements.md`.

## Revisit trigger

The first real run shows many cross-split near-duplicates or grade conflicts; a licence check rules out a source; or the external DR results fall below the floor (AUROC 0.85).
