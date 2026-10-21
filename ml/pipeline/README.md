# Data pipeline

Builds a validated, versioned, patient-level split of a public chest X-ray dataset (story `E1-03`).
Rules: TRD 9.2 (ML-DATA-01 to 07), Team Rules 7 and 8.

**Owner:** Chelsea. Second: Kweku.

## Run

From the repo root, with the raw data in `ml/data/raw/shenzhen/` (git-ignored):

```bash
pip install -r ml/requirements.txt
python3 ml/pipeline/build_dataset.py
python3 -m unittest discover -s ml/tests -v
```

## Stages

| Stage | Check | Failure means | Action |
| --- | --- | --- | --- |
| Ingest | Filename matches `CHNCXR_####_[01].png` | Unknown label or patient ID | Quarantine the record |
| Ingest | Image decodes | Corrupt or truncated file | Quarantine the record |
| Ingest | Smallest side at least 512 px | Below our quality floor (model input is 320 px, TRD 10.6) | Quarantine the record |
| Ingest | Clinical reading present for 95% or more | Source changed format or download incomplete | Hard fail: stop, write nothing |
| Label | Reading present for this image | Label cannot be confirmed | Quarantine the record |
| Label | File label agrees with the written reading | Possible label error | Quarantine for human review; the reason names the rule and the matched word |
| Dedup | No identical or near-identical copy has the other label | One image cannot be both normal and TB | Quarantine every copy for human review |
| Dedup | SHA-256 unique | Exact copy | Keep the first, quarantine the rest |
| Dedup | Same patient ID or 256-bit dHash distance 12 bits or less | Related records | Keep both, union connected patient groups into one split |
| Policy | Age 15 or over (TRD 9.1) | Outside intended use | Quarantine the record |
| Policy | Age readable | Cannot confirm intended use | Quarantine the record |
| Batch | No patient ID in two splits, checked independently of group ID | Patient leakage | Hard fail |
| Batch | No near-duplicate group in two splits | Image leakage | Hard fail |
| Batch | No identical image in two splits | Leakage | Hard fail |
| Batch | TB rate per split within 5 points of overall | Biased split | Hard fail |
| Batch | At least 300 records kept | Too little data to train | Hard fail |

No record is dropped silently. Every removed record is in `quarantine.csv` with its stage and check.

## Outputs

- `ml/manifests/shenzhen_v2/` (committed): `manifest.csv`, `quarantine.csv`, `near_duplicates.csv`, `run_report.json`, `DATA_CARD.md`. IDs, labels, splits, hashes and counts only. `shenzhen_v1/` is kept as the record of pipeline 0.1.0.
- `ml/data/interim/shenzhen_v2/metadata_full.csv` (git-ignored): sex, age and reading text.

The `dataset_version_hash` in `run_report.json` changes if any file, byte or split changes. Log it with every training run (Team Rules 7).

## Design notes

- **Near-duplicate threshold.** A 64-bit (8x8) dHash was tried first. At 4 bits it chained 416 of 662 X-rays into one group, because chest X-rays look alike at 8x8. The batch check on TB rate per split failed and stopped the run. The pipeline now uses a 256-bit (16x16) dHash. On the Shenzhen set the closest pair of different images is 21 bits apart and the median pair is 73. The threshold of 12 sits below every real pair and still catches a resized copy (see tests).
- **TB label.** The source label 1 means "abnormal lung", not TB. Label 1 needs a whole-word TB/PTB or tuberculosis term. Negation, uncertainty and mixed normal findings go to human review. Label 0 needs a complete normal reading (including the source typo `normale`). This conservative gate may quarantine extra records; it does not interpret clinical text.
- **Ingest cache.** Decoding about 660 3K images takes minutes. Per-file results are cached in `ml/data/interim/shenzhen_v2/ingest_cache.json` by filename, content SHA-256, hash size and Pillow version. Every run hashes current file bytes before trusting cached decoding, including when size and modified time are unchanged. Older timestamp-based entries are ignored.

## Pipeline versions

| Version | What changed | Outputs |
| --- | --- | --- |
| 0.1.0 | First version | `shenzhen_v1` (hash `702a4658c7447e13`), kept as the historical record. Superseded by v2. |
| 0.1.1 | Patient-identity unioning, an independent patient-overlap batch check, content-validated caching, conservative reading validation | Not published on its own |
| 0.2.0 | Stricter label checks (Korantengnator, `1b7161c`); splits carried over from v1 | `shenzhen_v2` (hash `0445b087fed038c4`) |
| 0.2.1 | Review fixes on PR #78: quarantine reasons name the matched word; copies with different labels are all quarantined; `run_report.json` records the code commit and Pillow version; the ingest cache key includes the Pillow version | `shenzhen_v2` rebuilt: same records, splits and hash; only the report and quarantine reasons change |

Regression tests use synthetic images and readings only.

- **Splits carry over between versions.** By default the pipeline keeps every patient group in the split it had in `--keep-splits-from` (version 1). A stricter rule then only removes records; nothing moves between splits, so a model trained on an earlier version never meets its own training images in a later test split. A group whose files were in two earlier splits stops the run. New patients are split by the usual seeded rule. Pass `--keep-splits-from ""` only to start a fresh split, and treat everything trained before it as invalid for the new test split.
