# Data card: Shenzhen TB chest X-ray set, version 2

Story `E1-03`. Built by `ml/pipeline/build_dataset.py` (pipeline 0.2.0, seed 591), with splits carried over from version 1.
Dataset version hash: `0445b087fed038c4`. Log this hash with every training run (Team Rules 7).

**What changed from version 1 (`702a4658c7447e13`).** Stricter label checks (Korantengnator, commit `1b7161c`): a TB-labelled reading that is negated, uncertain or mixed ("possible", "no", "?", "normal" and similar) now goes to human review, and a normal label needs a reading that is plainly normal. 17 more TB-labelled records were quarantined. Every remaining record keeps the split it had in version 1 (`carry_splits`, agreed 21 Oct 2026), so a model trained on version 1 never meets its own training images in the version 2 test split. Version 1 stays committed as the historical record of pipeline 0.1.0.

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

## Version 2 contents

| Item | Count |
| --- | --- |
| Images found | 662 |
| Kept | 618 (316 TB, 302 normal) |
| Quarantined | 44 |
| Train / validation / test | 431 / 94 / 93 |
| TB rate train / validation / test | 51.0% / 52.1% / 50.5% (overall 51.1%) |
| Records that changed split since version 1 | 0 (618 of 618 carried) |
| Removed since version 1 | 17, all TB-labelled: 13 train, 1 validation, 3 test |
| Sex (kept) | 416 male, 202 female |
| Age bands (kept) | 15-24: 104, 25-34: 228, 35-44: 145, 45-54: 65, 55-64: 48, 65+: 28 |
| Exact duplicates | 0 |
| Near duplicates (256-bit dHash, 12 bits or less) | 0 |

## Quarantined records

| Check | Count | Why |
| --- | --- | --- |
| Under 15 | 25 (23 normal, 2 TB) | Outside intended use (TRD 9.1) |
| Label disagrees with reading, or reading is ambiguous | 18 (all TB-labelled) | 1 reads pneumonia (as in version 1); 17 are negated, uncertain or mixed. Held for human review, not relabelled. |
| Age not readable | 1 | Reading gives a number with no unit |

## Known limits

- One hospital, one country, one machine type. No African patients. Results may not hold in Ghana (H4).
- About two thirds of kept images are from men.
- The TB label comes from the provider's reading. We checked it against the written reading, not against a lab test or a second reader.
- The ambiguity check is a word list, not a clinical reader. It sends doubtful TB readings to review; it can also remove some that a radiologist would keep. The 18 quarantined readings await review.
- Children are removed, so this version says nothing about TB in children.
