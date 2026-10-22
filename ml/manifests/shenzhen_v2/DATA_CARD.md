# Data card: Shenzhen TB chest X-ray set, version 2

Story `E1-03`. Built by `ml/pipeline/build_dataset.py` (pipeline 0.2.1, code commit `b21a47f`, seed 591), with splits carried over from version 1. Pipeline 0.2.1 gives the same records, splits and hash as 0.2.0; only the quarantine reasons and the run report changed.
Dataset version hash: `0445b087fed038c4`. Log this hash with every training run (Team Rules 7).

**What changed from version 1 (`702a4658c7447e13`).** Stricter label checks (Korantengnator, commit `1b7161c`): a TB-labelled reading that is negated, uncertain or mixed ("possible", "no", "?", "normal" and similar) now goes to human review, and a normal label needs a reading that is plainly normal. 17 more TB-labelled records were quarantined: 16 because the whole-word rule does not recognise the abbreviation `STB`, and 1 for a question mark. Every remaining record keeps the split it had in version 1 (`carry_splits`, agreed 21 Oct 2026), so a model trained on version 1 never meets its own training images in the version 2 held-out split. Version 1 stays committed as the historical record of pipeline 0.1.0.

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

## Version 2 contents

| Item | Count |
| --- | --- |
| Images found | 662 |
| Kept | 618 (316 TB, 302 normal) |
| Quarantined | 44 |
| Train / validation / held-out validation (`test`) | 431 / 94 / 93 |
| TB rate train / validation / held-out | 51.0% / 52.1% / 50.5% (overall 51.1%) |
| Records that changed split since version 1 | 0 (618 of 618 carried) |
| Removed since version 1 | 17, all TB-labelled: 13 train, 1 validation, 3 held-out |
| Sex (kept) | 416 male, 202 female |
| Age bands (kept) | 15-24: 104, 25-34: 228, 35-44: 145, 45-54: 65, 55-64: 48, 65+: 28 |
| Exact duplicates | 0 |
| Near duplicates (256-bit dHash, 12 bits or less) | 0 |

## Quarantined records

| Check | Count | Why |
| --- | --- | --- |
| Under 15 | 25 (23 normal, 2 TB) | Outside intended use (TRD 9.1) |
| Label disagrees with reading, or reading is ambiguous | 18 (all TB-labelled) | 1 reads pneumonia (as in version 1). 1 has a question mark. **16 use the abbreviation `STB`** (5 add `NATB`, 3 `ATB`), which the stricter whole-word TB rule does not recognise; they are probably TB readings, not ambiguous ones (found when pipeline 0.2.1 named the matched word in `quarantine.csv`, PR #78 review). All 18 stay excluded, not relabelled, so they cannot affect training. |
| Age not readable | 1 | Reading gives a number with no unit |

## Known limits

- One hospital, one country, one machine type. No African patients. Results may not hold in Ghana (H4).
- About two thirds of kept images are from men.
- The TB label comes from the provider's reading. We checked it against the written reading, not against a lab test or a second reader.
- The ambiguity check is a word list, not a clinical reader. It sends doubtful TB readings to review; it can also remove some that a radiologist would keep. The 18 quarantined readings await review.
- Children are removed, so this version says nothing about TB in children.
- **Results on version 1 and version 2 are not directly comparable.** Version 2 removes 17 records (13 train, 1 validation, 3 held-out), so the same model scores on slightly different images. Compare models only on the same version hash.
- **16 TB images are excluded by a gap in the word list, not by doubt.** Their readings say `STB` (probably secondary TB; `ATB` and `NATB` probably active and non-active TB). Restoring them changes the dataset hash and needs a retrain, so it is deferred to version 3, after confirming the abbreviations and whether non-active TB should count as TB.
- The 2 other quarantined readings need a radiologist; nobody on the team can review them. Planned for M3.
