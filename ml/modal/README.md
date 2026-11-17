# Modal GPU runs

GPU training and evaluation run on [Modal](https://modal.com) ([ADR-13](../../docs/adr/0013-modal-gpu-compute.md)). Kaggle plus Colab are the fallback.

**Owner:** Chelsea (owns the Modal workspace and its member list).

## Set up once

Use Python 3.10 or newer (CI uses 3.11).

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements-modal.txt
modal setup        # opens a browser to sign in
```

## Smoke test

```sh
modal run ml/modal/app.py
```

It prints the torch version, the GPU name and what is in each volume. It fails if no GPU is visible.

## Volumes

| Volume | Mounted at | Holds |
| --- | --- | --- |
| `triagelens-data` | `/data` | Downsized dataset copies (TRD 9.2) |
| `triagelens-runs` | `/runs` | Run logs and checkpoints |

Before uploading a dataset, check that its terms allow private cloud storage, and record this in its data card (ADR-13). The volume lives in a workspace with one member; do not add members while it holds data.

```sh
modal volume put triagelens-data ml/data/raw/shenzhen /shenzhen/raw
``` Never put real patient data from Ghana in a volume (Team Rules 8).

## Cost

Modal bills per second of GPU time. Check spend at each sprint review against the USD 50 monthly limit (TRD 14.4). Run small jobs first and check the GPU log before large runs (Team Rules 7).
