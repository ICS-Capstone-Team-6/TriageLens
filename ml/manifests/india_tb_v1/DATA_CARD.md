# Data card: India TB chest X-ray sets DA and DB, version 1 (locked external tests)

Story `E11-01`. Built by `ml/pipeline/build_india.py` (pipeline 0.1.0, commit `699b218`). Decisions: [ADR-24](../../../docs/adr/0024-india-da-db-external-sets.md).

| Set | Dataset version hash | Kept | TB | Normal |
| --- | --- | --- | --- | --- |
| DA | `f88389fc343acd0b` | 156 | 78 | 78 |
| DB | `ba67e200edb7bc51` | 114 | 45 | 69 |

**Locked (ML-DATA-04).** Never used for training, tuning, thresholds or choosing between models. Each set is scored once per frozen model, on this machine only (no Modal upload). Every kept record has split `external`. Log the hash with every evaluation (Team Rules 7).

## Source and licence

| Field | Value |
| --- | --- |
| Name | Dataset A (DA) and Dataset B (DB) |
| Provider | National Institute of Tuberculosis and Respiratory Diseases, New Delhi, India. Chauhan, Chauhan and Rout, PLoS One 2014 (doi 10.1371/journal.pone.0112980). |
| Images from | Kaggle copy [`vbookshelf/da-and-db-tb-chest-x-ray-datasets`](https://www.kaggle.com/datasets/vbookshelf/da-and-db-tb-chest-x-ray-datasets), version 1, downloaded 24 Nov 2026 into git-ignored `ml/data/raw/india_tb/`. A third-party re-upload. It matches the authors' SourceForge folders (`sourceforge.net/projects/tbxpredict/files/data/`) file for file, with `train_` and `test_` added to the names. |
| Images | DA: 156 JPEG, 8-bit. 110 are 1024 by 1024 and 46 are 2320 by 2828, spread evenly across labels. DB: 122 DICOM, 16-bit storage with values up to about 4095, 3008 by 3008, MONOCHROME2, uncompressed. |
| Machines | DA: Meditronics Diagnox-4050, digitised with AGFA CR35-X. DB: PRORAD URS with Canon CXDI detector. PA views only (paper). |
| Labels | File name: `p` = TB, `n` = normal (the authors' `label_information.txt`). The consensus of two experienced chest radiologists. No sputum or culture result is reported. |
| Terms of use | **No explicit licence.** The paper says the datasets "are available freely" at SourceForge, and Kaggle lists the licence as Unknown. Team decision (24 Nov 2026): non-commercial evaluation only, never redistributed, kept and scored on the team's machine. Still to do: a licence-register entry (`E1-01`). Cite Chauhan et al. 2014. |
| Personal data | None. DB DICOM headers are stripped: no age, sex, patient ID or dates. |
| Role (TRD Appendix A) | External test (TB) |

## Counts against the paper

| Set | Paper | Authors' folders and this copy | Note |
| --- | --- | --- | --- |
| DA | 156 (78 TB, 78 normal) | 156 (78, 78) | Complete |
| DB | 150 (75 TB, 75 normal) | 122 (47, 75) | 28 TB files are missing from the published DB training folder |

The pipeline stops if the counts differ from the authors' folders.

## How the files are staged

- DA JPEGs are copied byte for byte.
- DB DICOMs are converted once to 8-bit PNG. MONOCHROME1 would be inverted (none are). Then the 0.5th to 99.5th percentile of each image is stretched to 0 to 255, as a viewer does when a file has no display window. This rule was fixed before any scoring and is not tuned on labels.
- The model reads the staged files in git-ignored `ml/data/interim/india_tb_v1/images/`. The manifest keeps both the staged and the source SHA-256.

## Quarantined records

| Set | Check | Count | Why |
| --- | --- | --- | --- |
| DB | Exact duplicate | 8 (6 normal, 2 TB) | The same pixels as another DB file (the DICOM headers differ). One copy kept. Three pairs cross the paper's own train/test split: n33 and nd169, p5 and pd658, p6 and pd661. |

No image matches Shenzhen v2, Montgomery v1 or TBX11K v1 (SHA-256 or 256-bit dHash, 12 bits or less), and no image is in both DA and DB. Labels agree within every duplicate pair.

## Known limits

- **Small sets.** 156 and 114 films give wide intervals (ML-EVAL-06). Report them as they are.
- **No age (TRD 9.1 gap).** Children's films cannot be ruled out. The source is an adult TB and respiratory institute, but that is not proof. See ADR-24.
- **No patient IDs.** Repeat films of one patient cannot be found, apart from the duplicates above.
- **Radiological labels.** TB is a radiologist consensus, not a lab result, which differs from Montgomery and Shenzhen, where readings name TB findings.
- **DB conversion.** The display window is our choice. A different window could change results. It stays fixed for every model scored on DB.
- **Not Ghana.** India is closer to the target setting than the US, but this is still not the deployment population (H4).
