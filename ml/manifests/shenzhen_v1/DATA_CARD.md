# Data card: Shenzhen TB chest X-ray set, version 1

> Validation status: these outputs were generated with pipeline 0.1.0. Rerun pipeline 0.1.1 on the licensed raw files and review its quarantine results before using these outputs for training. See [pipeline validation notes](../../pipeline/README.md#pipeline-011-validation).

Story `E1-03`. Built by `ml/pipeline/build_dataset.py` (pipeline 0.1.0, seed 591).
Dataset version hash: `702a4658c7447e13`. Log this hash with every training run (Team Rules 7).

## Source and licence

| Field | Value |
| --- | --- |
| Name | NLM Shenzhen Hospital CXR Set (China Set) |
| Provider | US National Library of Medicine with Shenzhen No.3 People's Hospital, China |
| Where from | [NLM public file index](https://data.lhncbc.nlm.nih.gov/public/Tuberculosis-Chest-X-ray-Datasets/Shenzhen-Hospital-CXR-Set/index.html), downloaded 17 Oct 2026 |
| Images | 662 PNG, about 3K by 3K, Philips digital X-ray, out-patient clinics |
| Labels | In the file name: 0 = normal, 1 = abnormal lung. A text reading per image gives sex, age and finding. |
| Ethics | De-identified by the provider. Release exempted from IRB review by NIH (No. 5357), per the ReadMe. |
| Terms of use | Do not share outside the research group. Report errors to NLM. Cite Jaeger et al. 2014 and Candemir et al. 2014. |
| Personal data | Sex and age per image. No names or IDs. Kept only in git-ignored `ml/data/`. Never redistributed (ML-DATA-07). |
| Role (TRD Appendix A) | Train, validate and internal test for TB |

## Version 1 contents

| Item | Count |
| --- | --- |
| Images found | 662 |
| Kept | 635 (333 TB, 302 normal) |
| Quarantined | 27 |
| Train / validation / test | 444 / 95 / 96 |
| Sex (kept) | 430 male, 205 female |
| Age bands (kept) | 15-24: 106, 25-34: 235, 35-44: 150, 45-54: 67, 55-64: 49, 65+: 28 |
| Exact duplicates | 0 |
| Near duplicates (256-bit dHash, 12 bits or less) | 0 |

## Quarantined records

| Check | Count | Why |
| --- | --- | --- |
| Under 15 | 25 (23 normal, 2 TB) | Outside intended use (TRD 9.1) |
| Label disagrees with reading | 1 | Label 1 but the reading says pneumonia, not TB |
| Age not readable | 1 | Reading gives a number with no unit |

## Known limits

- One hospital, one country, one machine type. No African patients. Results may not hold in Ghana (H4).
- About two thirds of kept images are from men.
- The TB label comes from the provider's reading. We checked it against the written reading, not against a lab test or a second reader.
- Children are removed, so this version says nothing about TB in children.
