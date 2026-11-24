# ADR-24. India DA and DB are external test sets without age, scored locally

- **Status:** Proposed
- **Date:** 24 Nov 2026
- **Decided by:** Chelsea (ML lead), with the team's answers on 24 Nov 2026. Needs team agreement; Kweku decides if there is no agreement (Team Rules 2).
- **Related:** TRD 9.1, TRD 9.2 (ML-DATA-04), TRD Appendix A, ADR-13, ADR-23, `E11-01`, `E6-01`, H4; data card `ml/manifests/india_tb_v1/DATA_CARD.md`

## Context

Montgomery is spent for the frozen TB model (ADR-18): it was scored once, and the threshold set on Shenzhen validation let sensitivity fall to 0.70. The fix in `E6-01` (calibration and cautious three-zone thresholds) needs a check on images the model has never seen. TRD Appendix A names the India sets DA and DB as external TB tests.

The sets have three gaps:

1. **No age.** DA is plain JPEG, and DB's DICOM headers are stripped. TRD 9.1 needs age 15 or over, so the age check cannot run.
2. **No explicit licence.** The paper says only that the datasets "are available freely". ADR-13 asks that a dataset's terms allow private cloud storage before it goes into a Modal volume.
3. **DB is incomplete.** The published folders hold 122 DB images, not the 150 in the paper.

## Options considered

1. Don't use DA and DB. Follows TRD 9.1 strictly, but leaves no fresh external check for the `E6-01` thresholds.
2. Use them as locked external sets, accept and record the age gap, and keep and score them only on the team's machine. Gives an honest check, with the limits stated.
3. Wait for the authors to confirm terms. Safest on licence, but no answer is likely before G3 (Thu 3 Dec).

## Decision

Option 2.

- `ml/pipeline/build_india.py` builds DA and DB as two separate locked sets (split `external`), with the age gap recorded.
- `ml/train/evaluate_external.py` scores the frozen model once, locally, at the `E6-01` thresholds file. It refuses the interim ADR-20 file.
- The images never go to Modal or any other service.

## Consequences

- The `E6-01` thresholds get a real external check before G3, if W2 lands first.
- Results carry three caveats: unknown age, radiologist-only labels, and small sets (156 and 114 films).
- TRD 9.1 gets an exception for DA and DB. It is recorded in the change log in `docs/planning/04_Team_Rules_and_Requirements.md`.
- A licence-register entry is needed (`E1-01`).
- Add a note to H4 (population mismatch) in the hazard log.

## Revisit trigger

The authors state terms that forbid this use, or a review of the DA and DB failures (ML-EVAL-04) finds children's films.
