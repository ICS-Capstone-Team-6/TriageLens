# Data card: Shenzhen TB chest X-ray set, version 1

> **Superseded by [version 2](../shenzhen_v2/DATA_CARD.md).** Kept as the record of pipeline 0.1.0. Do not train or report on version 1; version 2 keeps its splits and removes 17 records. See [pipeline versions](../../pipeline/README.md#pipeline-versions).

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
| Ethics | De-identified by the provider. "The dataset use and public release were exempted from IRB review (No. 5357) by the NIH Office of Human Research Projections Programs" (ReadMe). |
| Source terms | No standard licence. The terms are in the provider's ReadMe, `NLM-ChinaCXRSet-ReadMe.docx`, in the same NLM folder (our copy: SHA-256 `7bff523f767aa29826bfe2c2f1f52bbf79f7b1b66bba857bd8725ef31c8d6dbe`, file dated 28 Aug 2024). Quoted: "Please do not share the dataset outside of your research group/ organization, but forward new dataset requests to us. Please inform us if you find errors or inconsistencies in the data." Publications must credit NLM and Shenzhen No.3 People's Hospital and cite Jaeger et al. 2014 and Candemir et al. 2014. |
| What we commit | File names, patient numbers (the provider's image sequence numbers, not personal identifiers), labels, splits, image sizes and SHA-256 and dHash fingerprints. No images, readings, ages or sexes. A fingerprint cannot be turned back into the image. The team agreed this is within the terms (21 Oct 2026, PR #78 review). |
| Personal data | Sex and age per image. No names or IDs. Kept only in git-ignored `ml/data/`. Never redistributed (ML-DATA-07). |
| Role (TRD Appendix A) | Train and validate for TB. The 15% split named `test` in the manifest is a **second held-out validation set**, not an internal test set (decision 21 Oct 2026, PR #78 review). It stays locked like a test set: no training, tuning or threshold setting on it. The name `test` is kept in the files because renaming it would change the dataset version hash. |

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
