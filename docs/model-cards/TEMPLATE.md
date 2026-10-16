# Model card: <model name> <version>

Copy this file to `<model>-<version>.md` (for example `cxr-tb-pneu-1.0.0.md`). Fill every section. Write "Not measured" rather than leaving a section empty. Required by TRD 9.10 and Team Rules 5.3.

- **Model:** <name, for example `cxr-tb-pneu`>
- **Version:** <semantic version, for example 1.0.0>
- **Status:** Candidate | Frozen | Retired
- **Owner:** <name>
- **Date frozen:** <DD Mon YYYY>

## Intended use

Who uses it, on which images, for which population, and what it must not be used for. Must match [docs/safety/intended-use.md](../safety/intended-use.md).

## Data

| Split | Datasets | Images | Patients | Manifest file and hash |
|-------|----------|--------|----------|------------------------|
| Train | | | | |
| Validation | | | | |
| Internal test | | | | |
| External test (locked) | | | | |
| Phone-photo test | | | | |

Excluded datasets and why (for example the Kermany paediatric set, ML-DATA-05). Known label problems.

## Metrics (95% confidence intervals)

Bootstrap with 1,000 resamples (ML-EVAL-02). Report every row, including weak results (Team Rules 7).

| Test set | AUROC (95% CI) | AUPRC | Sensitivity at threshold | Specificity at threshold | Notes |
|----------|----------------|-------|--------------------------|--------------------------|-------|
| Internal | | | | | |
| External | | | | | |
| Phone photos | | | | | |
| On-device int8 | | | | | |

Positive and negative predictive value at assumed prevalence of 1, 5 and 10 percent (ML-EVAL-01).

## Calibration

Temperature values, expected calibration error before and after, reliability plot link, thresholds version. All fitted on the validation split only (ML-CALIB-01, ML-CALIB-02).

## Subgroups

Metrics by sex, age band, source site and image type where available. List groups that are missing. Flag any subgroup with sensitivity more than 10 points below overall (TRD 9.9).

## Robustness

Clean vs simulated vs real phone-photo results; CheXphoto result for chest X-ray models (ML-ROBUST-03 to 05). AUROC drop from int8 vs full precision (TRD 9.5).

## Limits and known failure modes

Top categories from the review of the 20 worst failures (ML-EVAL-04). Shortcut checks done. What the model must not be trusted for.

## Version and hash

| Item | Value |
|------|-------|
| File | |
| SHA-256 | |
| Size (MB) | |
| Input shape and normalization | |
| Thresholds version | |
| Minimum app version | |
| Signature (ECDSA P-256) | |
| Training code commit | |
| Data manifest hash | |
| Seeds | |
