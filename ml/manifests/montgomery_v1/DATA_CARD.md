# Data card: Montgomery County TB chest X-ray set, version 1 (locked external test)

Story `E11-01`. Built by `ml/pipeline/build_external.py` (pipeline 0.1.0).
Dataset version hash: `6faf25d05645dcb0`. Log this hash with every external evaluation (Team Rules 7).

**Locked (ML-DATA-04).** Never used for training, tuning, thresholds or choosing between models. Scored once per frozen model. Every kept record has split `external`.

## Source and licence

| Field | Value |
| --- | --- |
| Name | NLM Montgomery County CXR Set |
| Provider | US National Library of Medicine with the Department of Health and Human Services, Montgomery County, Maryland, USA (TB control programme) |
| Images from | Kaggle copy [`raddar/tuberculosis-chest-xrays-montgomery`](https://www.kaggle.com/datasets/raddar/tuberculosis-chest-xrays-montgomery), version 1, downloaded 18 Oct 2026 by `ml/pipeline/download_montgomery.py`. A third-party re-upload; `SOURCE.json` (git-ignored) holds the SHA-256 of every file. |
| Readings from | [NLM public file index](https://data.lhncbc.nlm.nih.gov/public/Tuberculosis-Chest-X-ray-Datasets/Montgomery-County-CXR-Set/MontgomerySet/ClinicalReadings/index.html), downloaded 18 Oct 2026. The Kaggle copy has no reading files. |
| Images | 138 PNG, 4020 by 4892 or 4892 by 4020, greyscale. Sizes, names and label counts match the NLM description. |
| Labels | In the file name: 0 = normal, 1 = TB manifestations. A reading per image gives sex, age and finding. |
| Kaggle metadata CSV | `montgomery_metadata.csv` agrees with the NLM readings on sex, age and finding for every kept record. Used as a cross-check only. |
| Terms of use | NLM terms, as for Shenzhen: do not share outside the research group; cite Jaeger et al. 2014 and Candemir et al. 2014. To confirm against the Montgomery ReadMe. |
| Personal data | Sex and age per image. No names or IDs. Kept only in git-ignored `ml/data/`. Never redistributed (ML-DATA-07). |
| Role (TRD Appendix A) | External test (TB) |

## Version 1 contents

| Item | Count |
| --- | --- |
| Images found | 138 |
| Kept | 127 (57 TB, 70 normal) |
| Quarantined | 11 |
| Patients (groups) | 124: two TB patients have 2 and 3 films |
| TB films described as inactive, healed, old, scars or calcified | 21 of 57 |
| Sex (kept) | 68 female, 59 male |
| Age bands (kept) | 15-24: 16, 25-34: 34, 35-44: 22, 45-54: 33, 55-64: 8, 65+: 14 |
| Orientation (kept) | 93 portrait, 34 landscape |
| Exact or near duplicates (256-bit dHash, 12 bits or less) | 0 |
| Overlap with Shenzhen (SHA-256 or dHash) | 0 |

## Quarantined records

| Check | Count | Why |
| --- | --- | --- |
| Under 15 | 11 (10 normal, 1 TB) | Outside intended use (TRD 9.1) |

No label disagreed with its reading.

## How it differs from Shenzhen, and why it matters

- **Label check.** Montgomery label 1 means TB, including inactive or healed TB. Many TB findings name only the lesion (granuloma, scars, infiltrate), so the check is: label 0 must read normal, label 1 must not. Shenzhen also requires the word TB, because its label 1 means any abnormality.
- **Inactive TB.** 21 of 57 TB films describe old or healed disease. The app's task is active TB triage, so report sensitivity on active and inactive TB separately (`inactive_or_healed` in the private metadata).
- **Repeat films.** Five films come from two patients. Report image-level results, and note that 127 films are 124 patients.
- **Different machines and processing (US hospital).** This is what tests the texture finding in [ADR-16](../../../docs/adr/0016-stretch-not-pad-preprocessing.md): if the model learned Shenzhen's processing, AUROC drops here.
- **Shape.** 34 of 127 films are landscape. Preprocessing stretches every film to a square (`cxr-pre-2`), so run the shape check here too.

## Known limits

- 127 films: wide confidence intervals (ML-EVAL-06). Report them as they are.
- One US county, one TB programme. No African patients (H4).
- The TB label comes from the provider's reading, not a lab test we can see; some findings mention a positive culture.
- Children are removed.
