# ADR-23. TBX11K is used without age or patient IDs

- **Status:** Proposed
- **Date:** 23 Nov 2026
- **Decided by:** Chelsea (ML lead). Needs team agreement; Kweku decides if there is no agreement (Team Rules 2). Kweku owns safety, so the hazard-log note needs his review.
- **Related:** TRD 9.1, TRD 9.2 (ML-DATA-02, ML-DATA-03), TRD Appendix A, `E1-03`, H4, H11; data card `ml/manifests/tbx11k_v1/DATA_CARD.md`

## Context

The frozen TB model learned from Shenzhen alone, about 440 training images. On Montgomery its AUROC is 0.887. At the validation threshold, though, sensitivity falls from 0.92 to 0.70, below the 85% floor (TRD 3.4). One source is the main cause, so we need more training data from other sources. TRD Appendix A already lists TBX11K for training, validation and internal testing. It has 8,400 labelled images (800 TB).

TBX11K has two gaps against our data rules:

1. **No age.** TRD 9.1 limits chest X-ray tasks to people aged 15 and over. Our pipelines quarantine any record whose age can't be read. TBX11K has no age, sex or DICOM metadata. The authors said in 2021 that they would release it; we found no sign they have.
2. **No patient IDs.** ML-DATA-02 asks for splits by patient. TBX11K gives one ID per image. Two films of one patient could land in different splits.

## Options considered

1. Don't use TBX11K until metadata exists. Follows TRD 9.1 strictly, but leaves the single-source problem in place for the rest of the project.
2. Use TBX11K, accept the age gap, and split by image with near-duplicate grouping. Gets about 18 times more training images. Some children's films may be included, and two films of one patient could land on both sides of the internal split.
3. Remove likely children's films by eye or with a model. No ground truth, and it takes time we don't have.

## Decision

Option 2, the team's choice on 23 Nov 2026.

- `ml/pipeline/build_tbx11k.py` records "age not checkable" in the run report and the data card instead of quarantining.
- Each image is its own patient ID. Near-identical images (256-bit dHash, 12 bits or less) are still grouped, so a resized or re-saved copy can't cross splits.
- Latent TB counts as TB (label 1), as in Montgomery, whose label 1 includes inactive or healed TB.

## Consequences

- **Internal TBX11K test numbers may be optimistic**, because repeat films of one patient can't be found. Model choices and claims rest on the locked external sets (Montgomery, India DA and DB), as before.
- **Children's films may be in training.** The intended-use rule still holds at inference: the app gates on age (TRD 9.1), and nothing here changes that. Add a note to H4 (population mismatch) in the hazard log.
- Subgroup analysis by age and sex (TRD 9.9, `E6-03`) can't include TBX11K. Report this as a missing group.
- TRD 9.1 and ML-DATA-02 get a TBX11K exception, recorded in the change log in `docs/planning/04_Team_Rules_and_Requirements.md`.

## Results (23 Nov 2026)

TBX11K was used as Option 2 describes, and one candidate trained on Shenzhen plus TBX11K was scored once on the locked sets (details in `ml/train/README.md`). It improved internal results but **made external results worse**. Montgomery AUROC fell from 0.887 to 0.734 (paired difference -0.153, 95% CI -0.252 to -0.061), below the 0.80 floor, and active-TB AUROC fell from 0.908 to 0.687. The Shenzhen-only model (ADR-18) stays frozen. The team should decide whether TBX11K stays in training at all before more GPU time goes to it. Hazard H11 (shortcut learning) gets this as evidence.

## Revisit trigger

The authors release age or patient metadata, or a review of the TBX11K failures (ML-EVAL-04) finds children's films or repeat patients across splits.
