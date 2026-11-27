# Model card: cxr-tb, M2 slice (run efficientnet_lite0_seed1_20261021T114608Z)

Story `E11-03`. Covers the TB model that the M2 thin slice runs today ([ADR-19](../adr/0019-m2-thin-slice-pulled-forward.md)). It is **not a release model**: final selection, freeze and signed manifests are `E2-05` (Sprint 4). Every number below is copied from the source named next to it.

- **Model:** `cxr-tb` (TB output only, [ADR-14](../adr/0014-tb-only-output-m2.md)). Not yet the `cxr-tb-pneu` model in TRD 10.6.
- **Version:** no semantic version yet. The app records the run ID `efficientnet_lite0_seed1_20261021T114608Z` as the model version (`apps/pwa/src/lib/records.ts`).
- **Status:** Frozen for the M2 slice ([ADR-18](../adr/0018-efficientnet-lite0-full-precision.md), proposed). Not a release candidate until `E2-05`.
- **Owner:** Chelsea
- **Date frozen:** 21 Oct 2026

## Intended use

Same as [docs/safety/intended-use.md](../safety/intended-use.md) (TRD 3.3). A research prototype for trained health workers. It suggests a TB screening zone (Refer now, Unsure, Low risk) for a chest X-ray of a person aged 15 or over. It does not diagnose, does not replace a TB confirmation test or a clinician, and must not be used for emergencies or as the only basis for a decision.

Extra limits for this model:

- TB only. It gives no pneumonia score.
- Not for children's X-rays. Under-15 films were removed from training (Shenzhen v2 data card).
- Not tested on phone photos of films. Only digital files were used in every evaluation.
- No learned image-type gate is in front of it yet, so a grey non-chest image can get a zone (hazard H3).

## Data

| Split | Datasets | Images | Patients | Manifest file and hash |
|-------|----------|--------|----------|------------------------|
| Train | Shenzhen v2 | 431 (51.0% TB) | 431 (one film each) | [shenzhen_v2/manifest.csv](../../ml/manifests/shenzhen_v2/manifest.csv), dataset hash `0445b087fed038c4` |
| Validation | Shenzhen v2 | 94 (49 TB) | 94 | Same file and hash |
| Internal test | None. The Shenzhen split named `test` is a second held-out validation set, not an internal test set (Shenzhen v2 data card, PR #78 review) | 93 (47 TB) | 93 | Same file and hash |
| External test (locked) | Montgomery v1 | 127 (57 TB) | 124 | [montgomery_v1](../../ml/manifests/montgomery_v1/DATA_CARD.md), hash `6faf25d05645dcb0` |
| External test (locked) | India DA, India DB | 156 (78 TB), 114 (45 TB) | Not known | [india_tb_v1](../../ml/manifests/india_tb_v1/DATA_CARD.md), hashes `f88389fc343acd0b`, `ba67e200edb7bc51` |
| Phone-photo test | Not measured. The team photo set (`E1-05`) does not exist yet | | | |

Excluded:

- **TBX11K** is not used for training. A trial with Shenzhen plus TBX11K lowered Montgomery AUROC from 0.887 to 0.734 ([ADR-23](../adr/0023-tbx11k-without-age-or-patient-ids.md), proposed).
- **Kermany paediatric set:** excluded by the baseline (ML-DATA-05).
- **44 Shenzhen records quarantined:** 25 under 15, 18 label or reading problems, 1 unreadable age.

Known label problems (Shenzhen v2 data card):

- The TB label comes from the provider's reading, checked against the written reading only. It was not checked against a lab test or a second reader.
- 16 TB films that use the abbreviation `STB` are excluded by a gap in the word list, not by doubt. Restoring them needs a new dataset version and a retrain.

## Metrics (95% confidence intervals)

Each locked set was scored once for this run. Weak results are listed next to strong ones (Team Rules 7).

**At the ADR-20 `v0` threshold** (probability 0.184, set on validation for 90% sensitivity). Source: [ADR-18](../adr/0018-efficientnet-lite0-full-precision.md), "Results".

| Test set | AUROC (95% CI) | AUPRC | Sensitivity (95% CI) | Specificity (95% CI) | Notes |
|----------|----------------|-------|----------------------|----------------------|-------|
| Shenzhen validation (94) | 0.922 (0.862 to 0.970) | 0.923 (0.854 to 0.974) | 0.918 (0.808 to 0.968) | 0.800 (0.662 to 0.891) | The threshold was set on this split |
| Shenzhen held-out validation (93) | 0.978 (0.942 to 1.000) | 0.985 (0.961 to 0.999) | 0.957 (0.858 to 0.988) | 0.891 (0.770 to 0.953) | A second validation result, not a test of generalisation |
| Montgomery, external (127) | 0.887 (0.830 to 0.938) | 0.888 (0.823 to 0.938) | **0.702 (0.573 to 0.805)** | 0.900 (0.808 to 0.951) | **Sensitivity is below the 85% floor (TRD 3.4).** The ranking held up; the threshold did not transfer between sites |

**At the `v1-calibrated` three-zone cuts** (screen-out 0.088844, refer 0.901772, raw scale; [ADR-27](../adr/0027-calibration-v1-thresholds.md)). "Not Low risk" sensitivity is the share of TB films kept out of Low risk.

| Test set | AUROC (95% CI) | TB films in Low risk | "Not Low risk" sensitivity (95% CI) | Specificity below refer (95% CI) | Normal films in Low risk | Unsure share |
|----------|----------------|----------------------|-------------------------------------|----------------------------------|--------------------------|--------------|
| Shenzhen validation (94) | 0.922 (0.862 to 0.970) | 2 of 49 | 0.959 (0.863 to 0.989) | 0.956 (0.852 to 0.988) | 27 of 45 (0.60) | 42.6% |
| India DA, external (156) | 0.846 (0.780 to 0.906) | 0 of 78 | 1.000 (0.953 to 1.000) | 0.885 (0.795 to 0.938) | 3 of 78 (0.038) | 57.1% |
| India DB, external (114) | 0.908 (0.851 to 0.957) | 0 of 45 | 1.000 (0.921 to 1.000) | 0.870 (0.770 to 0.930) | 7 of 69 (0.101) | 55.3% |

India figures: one-time score on 25 Nov 2026 ([PR #136](https://github.com/ICS-Capstone-Team-6/TriageLens/pull/136), in review). Montgomery cannot be rescored at `v1`, so its figures above are at `v0` only.

**AUPRC on the India sets:** DA 0.834 (0.740 to 0.920), DB 0.887 (0.807 to 0.948). AUPRC does not depend on a threshold.

How AUPRC was computed (27 Nov 2026): average precision, from the fp32 scores saved by the one-time runs. No set was scored again. Intervals use a percentile bootstrap with 1,000 resamples, seed 0 (`bootstrap_ci` in `ml/train/metrics.py`, ML-EVAL-02). The Shenzhen validation AUROC interval was computed the same way.

- **Check:** the AUROC recomputed from the same files matches the reported value on every set.
- **Baseline:** a model with no skill gets an AUPRC equal to the TB share of the set. That is 0.52 (validation), 0.51 (held-out), 0.45 (Montgomery), 0.50 (DA) and 0.39 (DB).

**Against TRD 3.4:**

| Metric | Target | Floor | Result |
|--------|--------|-------|--------|
| External AUROC | 0.90 | 0.80 | Montgomery 0.887, India DA 0.846, India DB 0.908. All above the floor; only DB meets the target |
| External sensitivity (specificity at least 70%) | 90% | 85% | Montgomery 70.2% at `v0`: below the floor. India 100% of TB films kept out of Low risk at `v1` |
| int8 AUROC drop | 0.015 | 0.03 | Fails on India (0.040, 0.052). See Robustness |
| ECE after calibration | 0.05 | 0.10 | 0.099 (95% CI 0.075 to 0.181): misses the target. See Calibration |

**Phone photos:** Not measured.

**On-device int8:** Not measured on the phone. The app ships fp32 (ADR-18).

### PPV and NPV at assumed prevalence (ML-EVAL-01)

These are worked out with Bayes' rule from the sensitivity and specificity counts above. The test sets are about half TB, so their own PPV and NPV would not match a clinic. The range in brackets uses the ends of the 95% Wilson intervals for sensitivity and specificity together. It is a rough range, not a formal confidence interval.

- **NPV of Low risk:** the share of Low risk results that are truly not TB. "TB per 1,000 Low risk" is the same thing as a count of missed cases.
- **PPV of Refer now:** the share of Refer now results that are truly TB.

**Low risk (`v1` screen-out cut)**

| Set (TB kept out of Low risk; normal in Low risk) | Prevalence | NPV [range] | TB per 1,000 Low risk [range] |
|-----|-----|-----|-----|
| Shenzhen validation (47/49; 27/45) | 1% | 0.9993 [0.9970 to 0.9998] | 0.7 [0.2 to 3.0] |
| | 5% | 0.9964 [0.9844 to 0.9992] | 3.6 [0.8 to 15.6] |
| | 10% | 0.9925 [0.9676 to 0.9983] | 7.5 [1.7 to 32.4] |
| India DA (78/78; 3/78) | 1% | 1.000 [0.965 to 1.000] | 0 [0 to 35] |
| | 5% | 1.000 [0.842 to 1.000] | 0 [0 to 158] |
| | 10% | 1.000 [0.716 to 1.000] | 0 [0 to 284] |
| India DB (45/45; 7/69) | 1% | 1.000 [0.984 to 1.000] | 0 [0 to 16] |
| | 5% | 1.000 [0.924 to 1.000] | 0 [0 to 76] |
| | 10% | 1.000 [0.851 to 1.000] | 0 [0 to 149] |

On India, the point estimate of 1.000 only means no TB film reached Low risk. So few films reached Low risk (3 and 7) that the range is very wide. **Do not read it as evidence that Low risk is safe on new sites.**

**Refer now (`v1` refer cut)**

| Set (TB in Refer now; normal below refer) | PPV at 1% | PPV at 5% | PPV at 10% |
|-----|-----|-----|-----|
| Shenzhen validation (23/49; 43/45) | 0.096 [0.022 to 0.333] | 0.357 [0.107 to 0.722] | 0.540 [0.202 to 0.846] |
| India DA (55/78; 69/78) | 0.058 [0.029 to 0.115] | 0.243 [0.133 to 0.403] | 0.404 [0.244 to 0.588] |
| India DB (35/45; 60/69) | 0.057 [0.027 to 0.112] | 0.239 [0.127 to 0.396] | 0.399 [0.236 to 0.581] |

At 5% prevalence, about 1 in 4 Refer now results on the India sets would be TB. Refer now is a referral for a confirmation test, not a TB finding.

**Montgomery, `v0` threshold** (sensitivity 40/57, specificity 63/70; a single cut, so it has no Unsure zone)

| Prevalence | PPV [range] | NPV [range] | TB per 1,000 below the cut [range] |
|-----|-----|-----|-----|
| 1% | 0.066 [0.029 to 0.142] | 0.9967 [0.9947 to 0.9979] | 3.3 [2.1 to 5.3] |
| 5% | 0.270 [0.136 to 0.462] | 0.9829 [0.9730 to 0.9893] | 17.1 [10.7 to 27.0] |
| 10% | 0.438 [0.249 to 0.645] | 0.9645 [0.9446 to 0.9777] | 35.5 [22.3 to 55.4] |

## Calibration

Source: [ADR-27](../adr/0027-calibration-v1-thresholds.md) and `apps/pwa/public/config/thresholds.json` (`v1-calibrated`). Everything was fitted on Shenzhen validation only (94 films, 49 TB).

- **Temperature:** T = 1.3431, chosen by lowest log loss (ADR-8).
- **ECE, 10 bins:** 0.098 before and 0.099 after (95% CI 0.075 to 0.181). This misses the 0.05 target. The point estimate is inside the 0.10 floor, but the interval is not. With 5 bins it is 0.085 before and 0.069 after.
- **Effect on zones:** dividing by T keeps the order of scores, so no film changes zone. The cuts stay on the raw scale because the app applies no temperature. T and the calibrated cuts are recorded for information only (`for_display: false`).
- **Thresholds version:** `v1-calibrated`, replacing the interim `v0` (ADR-20).
  - Screen-out sits halfway below the lowest score that keeps validation sensitivity at 95% or more.
  - Refer sits halfway above the highest score that keeps validation specificity at 95% or more.
  - Margins to the nearest validation score: 0.0016 (screen-out) and 0.0028 (refer).
- **Reliability plot:** not committed. Per ADR-27 it zigzags because the middle bins hold few films.
- **Selective-prediction curve (ML-CALIB-04):** Not measured.
- **Main limit:** 94 films is too few to measure calibration well. ADR-27's revisit trigger is a validation set of at least 300 films.

## Subgroups

Source: ADR-18 "Results" and PR #136. Sex and age-band rows come from `subgroups.json`, written by `ml/train/subgroups.py` during the one-time Montgomery run and kept on the team's machine (counts and rates only). All sensitivity and specificity figures here use the `v0` threshold (0.184), with Wilson 95% intervals.

| Subgroup | Result | Note |
|----------|--------|------|
| Sex, Shenzhen held-out | Women (32 films, 17 TB): sensitivity 0.941 (0.730 to 0.990), specificity 0.733 (0.480 to 0.891), AUROC 0.925. Men (61 films, 30 TB): sensitivity 0.967 (0.833 to 0.994), specificity 0.968 (0.838 to 0.994), AUROC 0.997 | Small groups. More false alarms for women. Tracked |
| Sex, Montgomery | Women (68 films, 20 TB): sensitivity 0.700 (0.481 to 0.855), specificity 0.896 (0.778 to 0.955), AUROC 0.886. Men (59 films, 37 TB): sensitivity 0.703 (0.542 to 0.825), specificity 0.909 (0.722 to 0.975), AUROC 0.910 | No gap by sex on the external set |
| Age band, Shenzhen held-out | 15-34 (57 films, 26 TB): sensitivity 0.923 (0.759 to 0.979), specificity 0.903 (0.751 to 0.967), AUROC 0.960. 35-54 (25, 12 TB): 1.000 (0.757 to 1.000), 0.846 (0.578 to 0.957), 1.000. 55+ (11, 9 TB): 1.000 (0.701 to 1.000), 1.000 (0.342 to 1.000), 1.000 | Very small groups, wide intervals |
| Age band, Montgomery | 15-34 (50 films, 18 TB): sensitivity 0.722 (0.491 to 0.875), specificity 0.938 (0.799 to 0.983), AUROC 0.844. 35-54 (55, 22 TB): 0.682 (0.473 to 0.836), 0.848 (0.691 to 0.933), 0.886. 55+ (22, 17 TB): 0.706 (0.469 to 0.867), 1.000 (0.566 to 1.000), 0.918 | Every band is below the 85% floor, like the whole set. None is more than 10 points below overall (0.702) |
| TB type, Montgomery | Active TB: AUROC 0.908, sensitivity 0.722 (0.560 to 0.842). Inactive or healed: AUROC 0.850, sensitivity 0.667 (0.454 to 0.828) | Both are below the 85% floor at `v0`. Neither is more than 10 points below overall (0.702) |
| Film orientation, Montgomery | Portrait AUROC 0.920 (93 films), landscape 0.803 (34 films) | Shenzhen has almost no landscape films. Above the ADR-16 warning level |
| Film shape, India DA | Non-square AUROC 0.945 (46 films), square 0.806 (110 films) | Cause not tested |
| Source site | Montgomery 0.887, India DA 0.846, India DB 0.908 | Normal films score higher on India than on Shenzhen, so more of them are Unsure |

Missing groups:

- **No subgroup is flagged** by the TRD 9.9 rule (sensitivity more than 10 points below overall). The groups are small, so the check has little power.
- India DA and DB have no age or sex data, so the age 15 and over rule cannot be checked (ADR-24).
- **No African patients** in any training or test set (hazard H4).
- **Device type:** every film is a digital file. Phone photos have not been tested.

## Robustness

- **Clean vs simulated vs real phone photos:** Not measured. The simulation library (`E7-01`), the photo set (`E1-05`) and the ablation (`E7-02`) are not done.
- **CheXphoto:** Not measured. Licence not checked.
- **int8 vs fp32 AUROC drop:**

  | Set | Drop | Source |
  |-----|------|--------|
  | Shenzhen held-out | 0.016 | ADR-18 |
  | Montgomery | 0.029 | ADR-18 |
  | India DA | 0.040 | PR #136 |
  | India DB | 0.052 | PR #136 |

  The two India drops are above the 0.03 floor, so the app ships fp32 (12.8 MB, within the 15 MB budget). Part of the drop may come from the x86 build machine rather than ONNX Runtime Web. That has not been measured (`E5-03`).
- **Border masking:** masking the film border barely changes AUROC. India DA 0.866 against 0.846; India DB 0.898 against 0.908. So the border is not driving the score.

## Limits and known failure modes

- **The threshold does not transfer between sites.** At the Shenzhen-set threshold the model caught 70% of Montgomery TB against a 90% target (hazards H1, H4).
- **The `v1` cuts are safe but cautious on new sites.** On India, no TB film reached Low risk, but more than half of all films were Unsure. Only 4% (DA) and 10% (DB) of normal films reached Low risk, so the model saves the clinic little work there. The open fix is per-site calibration (H4).
- **Landscape films score worse** (Montgomery AUROC 0.80 against 0.92 for portrait).
- **Shortcut checks:**
  - Aspect-ratio (shape) shortcut: found and removed by stretching instead of padding ([ADR-16](../adr/0016-stretch-not-pad-preprocessing.md)). Film shape alone gives AUROC 0.51 and 0.50 on India.
  - Border-mask and heatmap review: errors are not edge-driven (PR #84; `ml/train/error_review.py`).
  - The Shenzhen plus TBX11K trial model (not this one) appeared to read each source's look as TB risk (ADR-23). This model was trained on one source only.
- **Worst-20 failure review (ML-EVAL-04):** heatmap and border review done (PR #84). A clinical review of the errors needs a radiologist and is planned for M3.
- **One training site:** one hospital in China, one machine type, about two thirds men.
- **One seed** was scored on the external sets. India sets are small, so the confidence intervals are wide.
- **Not measured on the phone:** inference latency (NFR-PERF-01, `E5-01`). ONNX Runtime Web against PyTorch parity near the two cuts is not tested (`E5-03`); the margins above are what such a test must stay inside.
- **Must not be trusted for:**
  - children
  - phone photos of films
  - sites far from Shenzhen without per-site calibration
  - a Low risk zone that ends the TB workup when symptoms point to TB (symptoms can raise a zone, FR-05)

### Locked sets used by this run

The Shenzhen held-out split, Montgomery and India DA and DB have all been scored for this run. Any model change, including recalibration, makes a new candidate. A new candidate gets one fresh scoring of each locked set (ML-DATA-04).

## Version and hash

| Item | Value |
|------|-------|
| File | fp32 ONNX, served from `VITE_MODEL_URL`; never committed (`apps/pwa/README.md`) |
| SHA-256 | `ef9c7dc7a8882703a4db24422c27b065d504358087216e86b8ff40a07584a289` (model file, from `thresholds.json`); checkpoint `014f51ef1bbba998f090143581e3cda421be6a076d3dee6e8c6e7cc6e3b330bb` |
| Size (MB) | 12.8 (fp32). The int8 version is 3.6 MB and is not shipped |
| Input shape and normalization | float32 [1, 3, 320, 320], NCHW. `cxr-pre-2`: grayscale, stretched to 320 by 320 (not padded), copied to 3 channels, divided by 255, ImageNet mean and std ([preprocess_spec.json](../../ml/train/preprocess_spec.json)) |
| Thresholds version | `v1-calibrated` (ADR-27) |
| Minimum app version | Not set. There is no signed manifest yet (`E2-05`) |
| Signature (ECDSA P-256) | None. Signing is deferred to `E2-05` (ADR-11, ADR-27). The thresholds file is bound to the model by `model_sha256`, and the app shows no result if the hash differs |
| Training code commit | `524933123889f2a149d188e49d060abbf75983d4` (20 Oct 2026), clean tree (`git_dirty: false`). From the run's `config.json` (team copy in git-ignored `ml/runs/frozen/`; original under `/bakeoff/` on the `triagelens-runs` Modal volume) |
| Data manifest hash | Shenzhen v2 `0445b087fed038c4` |
| Seeds | Seed 1 of 3. It is the median seed by validation AUROC (0.917, 0.922, 0.927; ADR-18) |
| Backbone and recipe | EfficientNet-Lite0, ImageNet start, 3-epoch head warm-up then full fine-tuning (up to 40 epochs, early stopping after 8 epochs with no better validation AUROC), batch 32 (`ml/train/train.py`) |
