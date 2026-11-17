# Machine learning

Python code for data, training, export and evaluation (TRD 9, 14.1).

**Owner:** Chelsea (ML lead). Kweku is the second AI engineer.

## What goes here

- Data loaders, training configs, export and quantization scripts, evaluation scripts, tests

## What must not go here

- Datasets, checkpoints or runs (`ml/data/`, `ml/runs/`, `ml/checkpoints/` are git-ignored).
- Model binaries (`*.onnx`, `*.pt`).
- The Kermany paediatric set in any training data (ML-DATA-05).

## Contents

- `pipeline/`: data pipeline for the Shenzhen TB set (`E1-03`). See `pipeline/README.md`.
- `train/`: TB model training for M2 (`E2-01`). See `train/README.md`.
- `modal/`: Modal GPU entry points (ADR-13).
- `tests/`: unit tests on synthetic images. Run `python3 -m unittest discover -s ml/tests -v`.
- `requirements.txt`: pinned Python dependencies.
