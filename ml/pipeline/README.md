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
| Ingest | Smallest side at least 512 px | Too small for the model input | Quarantine the record |
| Ingest | Clinical reading present for 95% or more | Source changed format or download incomplete | Hard fail: stop, write nothing |
| Label | Reading present for this image | Label cannot be confirmed | Quarantine the record |
| Label | File label agrees with the written reading | Possible label error | Quarantine for human review |
| Dedup | SHA-256 unique | Exact copy | Keep the first, quarantine the rest |
| Dedup | dHash distance 4 bits or less | Near duplicate | Keep both, force the same split |
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
