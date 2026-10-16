# Model cards

One model card per released model version (TRD 9.10, Team Rules 5.3).

**Owner:** Chelsea (ML lead). Kweku pairs on calibration and the cards (Team Rules 13).

## What goes here

- `<model>-<version>.md`, copied from `TEMPLATE.md`, for example `cxr-tb-pneu-1.0.0.md`

## What must not go here

- Model binaries (`*.onnx`, `*.pt`). These live in versioned storage, not git (Team Rules 6).
- Metrics without a dataset, a threshold and a confidence interval (Team Rules 7).
