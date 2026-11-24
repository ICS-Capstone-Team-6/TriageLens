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
- **TB label.** The source label 1 means "abnormal lung", not TB. Label 1 needs a whole-word TB/PTB or tuberculosis term. Negation, uncertainty and mixed normal findings go to human review. Label 0 needs a complete normal reading (including the source typo `normale`). This conservative gate may quarantine extra records; it does not interpret clinical text. Known gap: it does not recognise the abbreviation `STB`, which excludes 16 probable TB images from v2 (see the v2 data card); fixing it changes the dataset, so it waits for v3.
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

## Montgomery (locked external test)

Montgomery is the external TB test set (ML-DATA-04): never used for training, tuning or thresholds, and scored once per frozen model. Download it into `ml/data/raw/montgomery/` (git-ignored) from the repo root:

```sh
pip install kagglehub==1.0.2
python3 ml/pipeline/download_montgomery.py
```

The source is the Kaggle copy `raddar/tuberculosis-chest-xrays-montgomery`, a third-party re-upload of the NLM set. The script writes `SOURCE.json` (Kaggle version, date, SHA-256 of every file) for the data card, and compares what arrived with the NLM description: 138 images (80 normal, 58 TB) named `MCUCXR_####_L.png`, each with a clinical reading. It exits with code 2 and lists the differences if they do not match. If Kaggle asks for a login, run `python3 -c "import kagglehub; kagglehub.login()"` first.

**Clinical readings come from NLM.** Kaggle version 1 (18 Oct 2026) has the 138 images, the right label counts and the original sizes (4020 by 4892, either way round), but no reading files: only `montgomery_metadata.csv`, a third-party transcription. Age (the 15-and-over rule) and the label check must rest on the official readings, so download them (about 140 small text files) and re-check:

```sh
wget -r -np -nH --cut-dirs=4 -R "index.html*" -P ml/data/raw/montgomery \
  https://data.lhncbc.nlm.nih.gov/public/Tuberculosis-Chest-X-ray-Datasets/Montgomery-County-CXR-Set/MontgomerySet/ClinicalReadings/index.html
python3 ml/pipeline/download_montgomery.py --check-only
```

The CSV is kept as a cross-check against the readings, not as a source of labels.

Then build the manifest (about a minute):

```sh
python3 ml/pipeline/build_external.py
```

It writes `ml/manifests/montgomery_v1/` (committed: `manifest.csv`, `quarantine.csv`, `near_duplicates.csv`, `run_report.json`, `DATA_CARD.md`) and the private metadata to `ml/data/interim/montgomery_v1/`. It reuses the Shenzhen checks, with three differences explained in its docstring and the data card: no split (every record is `external`), a label check that accepts TB findings without the word TB, and patient groups from readings that name another image. It also quarantines any image that matches Shenzhen.

## TBX11K (training source)

TBX11K adds about 8,400 labelled images (800 TB) from another source (TRD Appendix A: train, validate, internal test). It is **not used to train shipped models**: the one combined candidate did worse on Montgomery ([ADR-23](../../docs/adr/0023-tbx11k-without-age-or-patient-ids.md), `ml/train/README.md`). The pipeline stays for later attempts. Download the authors' official archive, linked from [github.com/yun-liu/Tuberculosis](https://github.com/yun-liu/Tuberculosis), and unpack it into `ml/data/raw/tbx11k/` (git-ignored). The pipeline finds `imgs/` and `lists/` there or one level below (for example `ml/data/raw/tbx11k/TBX11K/`). Then, from the repo root:

```sh
python3 ml/pipeline/build_tbx11k.py
```

It writes `ml/manifests/tbx11k_v1/` (committed: `manifest.csv`, `quarantine.csv`, `near_duplicates.csv`, `run_report.json`, `DATA_CARD.md`). Its docstring and [ADR-23](../../docs/adr/0023-tbx11k-without-age-or-patient-ids.md) explain how it differs from Shenzhen:

- Labels come from the class folder: health and sick are 0, tb is 1, and latent TB counts as TB.
- There is no age check, because TBX11K has no age data.
- Each image is its own patient ID, and near-duplicates are grouped.
- Official train goes to `train`. Official val is split half and half into `val` and `test`.
- Images matching Shenzhen or Montgomery are quarantined. Only official train and val list entries under health, sick or tb are read.
- The run stops if the list counts differ from the official README table.

Manifest `file` values are paths under `imgs/` (for example `tb/tb0003.png`). `run_report.json` gives that folder as `image_root`. Pairwise duplicate search is vectorised (`np.bitwise_count`), because the Shenzhen loop is too slow for 8,400 images.

## India DA and DB (locked external tests)

Two small TB sets from New Delhi ([ADR-24](../../docs/adr/0024-india-da-db-external-sets.md), data card `ml/manifests/india_tb_v1/DATA_CARD.md`). They have no explicit licence, so they stay on the team's machine and never go to Modal. Download the Kaggle copy into `ml/data/raw/india_tb/` (git-ignored), then build:

```sh
pip install kagglehub==1.0.2
KAGGLEHUB_CACHE=ml/data/raw/india_tb/_kagglehub python3 -c "import kagglehub; kagglehub.dataset_download('vbookshelf/da-and-db-tb-chest-x-ray-datasets')"
python3 ml/pipeline/build_india.py
```

It writes `ml/manifests/india_tb_v1/da/` and `db/` (committed) and the staged images to `ml/data/interim/india_tb_v1/images/` (git-ignored). DB is DICOM, so `pydicom` is needed (pinned in `ml/requirements.txt`). Its docstring and the data card explain the rest:

- Labels come from the file names: `p` = TB, `n` = normal.
- DB is converted to 8-bit PNG with a fixed display window.
- There is no age check, because neither set has age data.
- Duplicates and any overlap with Shenzhen, Montgomery or TBX11K are quarantined.
- The run stops if the counts differ from the authors' folders.

## DR: APTOS 2019 plus EyePACS (story E3-01)

`build_dr.py` builds `ml/manifests/dr_v1/` from APTOS 2019 and an EyePACS subsample (ADR-26, proposed). **Do not run it on real data until both licences are checked in the licence register (E1-01).**

Expected raw layout (git-ignored; the run stops if the label columns differ):

- `ml/data/raw/aptos2019/train.csv` (`id_code`, `diagnosis`) and `train_images/<id_code>.png`
- `ml/data/raw/eyepacs/trainLabels.csv` (`image`, `level`) and `train/<image>.jpeg`

```sh
python3 ml/pipeline/build_dr.py
python3 -m unittest ml/tests/test_build_dr.py
```

| Stage | Check | Failure means | Action |
| --- | --- | --- | --- |
| Ingest | Name matches the source schema | Unknown patient or eye | Quarantine |
| Ingest | Grade is 0 to 4 | Bad label | Quarantine |
| Ingest | File present and decodes | Missing or corrupt | Quarantine |
| Ingest | Smallest side at least 384 px | Would be upscaled for the model | Quarantine |
| Fundus | Fundus fills at least 20% of the frame | Blank or not a fundus image | Quarantine |
| Dedup | No near-identical copy with another grade | Grade cannot be trusted | Quarantine every copy for review |
| Dedup | SHA-256 unique | Exact copy | Keep the first |
| Dedup | Same patient or dHash within 12 bits | Related records | Same group, same split |
| Batch | No patient, group or identical image in two splits | Leakage | Hard fail |
| Batch | Referable rate per split within 5 points of overall | Biased split | Hard fail |
| Batch | At least 1,000 records | Too little data | Hard fail |

- **Patients.** EyePACS `<patient>_<eye>` keeps both eyes of a person in one split. APTOS has no patient IDs, so each image is its own patient and near-duplicates are grouped.
- **Subsample.** About 20,000 EyePACS images, chosen by whole patient with seed 591, keeping the natural grade mix.
- **Preprocessing `dr-pre-1`.** Crop the black border, pad to a square, resize. Downsized 512 px copies go to `ml/data/interim/dr_v1/images/` (git-ignored); training resizes to 384 (TRD 10.6).
- **Threshold check.** `run_report.json` gives `nearest_distance_quantiles`. If the 1% quantile is near 12 bits, the threshold is chaining distinct fundus images together (as 8x8 did for Shenzhen); raise the hash size or lower the threshold before training.
- **Class balance.** `run_report.json` gives grade counts per split and source.
