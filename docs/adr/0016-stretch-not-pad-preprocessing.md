# ADR-16. Stretch chest X-rays to square instead of padding

- **Status:** Proposed
- **Date:** 18 Oct 2026
- **Decided by:** Chelsea (ML lead). Needs team agreement; Kweku decides if there is no agreement (Team Rules 2).
- **Related:** TRD 9.3, TRD 10.6, `E2-01`, hazard H11 (shortcut learning), ADR-14, ADR-15

## Context

TRD 9.3 says chest X-rays are resized "with padding": the aspect ratio is kept and the image is centred on a square with black bars. The first baseline run on Modal (18 Oct 2026, `ml/train/baselines.py`) found that image shape predicts TB in the Shenzhen set.

| Feature, used alone | AUROC for TB, train split | AUROC for TB, validation split |
| --- | --- | --- |
| Width | 0.281 (narrower = TB) | 0.308 |
| Aspect ratio (width / height) | 0.279 | 0.297 |
| File size | 0.512 (no signal) | 0.419 |

A logistic regression on width, height and file size alone reached validation AUROC 0.801 (95% CI 0.706 to 0.885). In the whole set, 42% of normal images are exactly 3,000 pixels wide, against 7% of TB images: TB images were cropped narrower by the provider.

With padding, a narrower image gets wider black bars. The bars carry the label, and a network can learn them instead of the lungs (H11).

## Options considered

1. Stretch to square: resize straight to 320 by 320, ignoring the aspect ratio. Removes the bars completely. Distorts anatomy slightly (median aspect ratio 0.95 to 1.01). Common in chest X-ray models and easy for the app to match.
2. Centre-crop to square, then resize. Removes the bars, but can cut off lung edges or apices, where TB often shows.
3. Keep padding and report the risk. The model may learn the shortcut.

## Decision

Option 1. Preprocessing version `cxr-pre-2` (`ml/train/preprocess_spec.json`) resizes straight to 320 by 320 with no padding. Every training run also records a shape check (`metrics.py`, `shape_check`): AUROC within thirds of the aspect-ratio range, and the rank correlation between the model's score and aspect ratio inside each class.

## Consequences

- TRD 9.3 "resize with padding" no longer applies to chest X-rays. The app must stretch the same way, or training and serving will differ.
- Stretching removes the bars but not every trace of cropping: TB images may still show the body filling more of the frame. The shape check measures what is left rather than assuming the fix worked.
- The rung 0 baseline will still score about 0.80. It measures the dataset, not the model, and is reported as a dataset artefact.
- Arrays are rebuilt into a new folder per preprocessing version (`processed_v1_cxr-pre-2`), so old and new arrays are never mixed.
- Change-log entry in `docs/planning/04_Team_Rules_and_Requirements.md`.

## Follow-up: bake-off 1 (18 Oct 2026)

The first bake-off on `cxr-pre-2` (2 backbones x 3 seeds, no shape augmentation) hit the first revisit trigger. The models still separated TB from normal within each third of the aspect-ratio range (validation AUROC 0.833 to 0.951; no third more than 0.10 below the overall score), so they read the lungs. But their scores followed aspect ratio inside each class: Spearman correlation -0.39 to -0.53 for normal images and -0.26 to -0.45 for TB images. Narrow normal X-rays scored as more TB-like, which would raise false referrals.

Part of this may be physiology rather than cropping: thinner people have narrower chests, and TB causes weight loss. The data cannot separate the two.

Response: training augmentation now stretches width and height independently by up to 15% and centre-crops back (`shape_jitter` in `ml/train/data.py`). It only enlarges, so it adds no padding. Bake-off 1 is kept as the "before" result for comparison.

## Revisit trigger

The shape check shows a within-class correlation stronger than 0.3 in either class, or AUROC within an aspect-ratio third falls more than 0.10 below the overall validation AUROC. Also revisit when other datasets join, since their image shapes may differ.
