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
| Label | File label agrees with the written reading | Possible label error | Quarantine for human review |
| Dedup | SHA-256 unique | Exact copy | Keep the first, quarantine the rest |
| Dedup | 256-bit dHash distance 12 bits or less | Near duplicate | Keep both, force the same split |
| Policy | Age 15 or over (TRD 9.1) | Outside intended use | Quarantine the record |
| Policy | Age readable | Cannot confirm intended use | Quarantine the record |
| Batch | No patient or near-duplicate group in two splits | Leakage | Hard fail |
| Batch | No identical image in two splits | Leakage | Hard fail |
| Batch | TB rate per split within 5 points of overall | Biased split | Hard fail |
| Batch | At least 300 records kept | Too little data to train | Hard fail |

No record is dropped silently. Every removed record is in `quarantine.csv` with its stage and check.

## Outputs

- `ml/manifests/shenzhen_v1/` (committed): `manifest.csv`, `quarantine.csv`, `near_duplicates.csv`, `run_report.json`. IDs, labels, splits, hashes and counts only.
- `ml/data/interim/shenzhen_v1/metadata_full.csv` (git-ignored): sex, age and reading text.

The `dataset_version_hash` in `run_report.json` changes if any file, byte or split changes. Log it with every training run (Team Rules 7).

## Design notes

- **Near-duplicate threshold.** A 64-bit (8x8) dHash was tried first. At 4 bits it chained 416 of 662 X-rays into one group, because chest X-rays look alike at 8x8. The batch check on TB rate per split failed and stopped the run. The pipeline now uses a 256-bit (16x16) dHash. On the Shenzhen set the closest pair of different images is 21 bits apart and the median pair is 73. The threshold of 12 sits below every real pair and still catches a resized copy (see tests).
- **TB label.** The source label 1 means "abnormal lung", not TB. A label 1 whose reading does not name TB goes to review (one case, a pneumonia reading).
- **Ingest cache.** Decoding about 660 3K images takes minutes. Per-file results are cached in `ml/data/interim/shenzhen_v1/ingest_cache.json` by name, size, modified time and hash size. A changed file is read again.
