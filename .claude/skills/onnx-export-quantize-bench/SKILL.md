---
name: onnx-export-quantize-bench
description: Step-by-step ONNX export, static int8 quantization, browser parity test and on-device benchmark for TriageLens models. Use when exporting a PyTorch model to ONNX, quantizing it, comparing QOperator vs QDQ, checking parity or accuracy drop, checking model size budgets, or running and writing up a device benchmark.
allowed-tools: Read, Grep, Glob
---

# ONNX export, quantization and benchmark

Enforces TRD 8 (NFR-PERF-01 to 07, NFR-SIZE-01), TRD 9.5, 10.5, 10.6, 13.3, ADR-2, ADR-5, Team Rules 5.2 item 4.
Supports stories E5-01, E5-02, E5-03, E5-04, E8-04, E11-02.

Reference phone: TBD, see decision D2 (default: cheapest Android phone a team member owns).

## Budgets (TRD 8, 3.4)

| Item | Target | Floor / limit |
|------|--------|---------------|
| Each int8 model | at most 15 MB | at most 25 MB |
| Gate model | at most 3 MB | |
| Total offline footprint | at most 60 MB | |
| First install (app plus models) | at most 45 MB | |
| p95 inference per model, reference phone | at most 2.5 s | at most 4 s |
| Capture to result p95 | at most 5 s | |
| Quality gate | at most 300 ms | |
| Peak browser memory during inference | at most 350 MB | |
| int8 AUROC drop vs fp32 | at most 0.015 | at most 0.03 |

## 1. Export (TRD 9.5 step 1, 10.6)

- [ ] Fixed input size: `cxr-tb-pneu` [1, 3, 320, 320]; `dr` [1, 3, 384, 384]; `gate` [1, 3, 224, 224]. float32, normalized.
- [ ] Outputs named as in TRD 10.6: chest X-ray gives TB logit, pneumonia logit, last feature map (M2: `tb_logit` and `features` only, ADR-14); DR gives 4 ordinal logits plus feature map; gate gives 5 class logits.
- [ ] Feature map kept as an output so the browser can compute the class activation map (ADR-9).
- [ ] Run the exported model in ONNX Runtime (Python) and compare with PyTorch on a fixed image set before quantizing.
- [ ] Preprocessing follows `ml/train/preprocess_spec.json` (`cxr-pre-2`: stretch to 320 by 320, no padding, ADR-16).
- [ ] Code: `ml/export/export_onnx.py`; on Modal `modal run ml/modal/train_app.py::export`.

## 2. Static int8 quantization (TRD 9.5 step 2, ADR-5)

- [ ] Calibration set: a fixed sample of **train** images, no augmentation (ADR-17; 300 for Shenzhen). Never validation, test or external data, so the drop is measured on images the ranges were not set on.
- [ ] Produce both QOperator and QDQ formats.
- [ ] Measure both **in the browser** (ONNX Runtime Web, WebAssembly) on the reference phone; keep the faster one and record why.

## 3. Parity (TRD 9.5 step 3, E5-03)

- [ ] Browser output matches the PyTorch reference within tolerance on a fixed image set. Record the tolerance used.
- [ ] Preprocessing parity: Python and browser preprocessing give matching tensors on sample images (TRD 13.2).
- [ ] This test runs in CI and fails the build on mismatch.

## 4. Accuracy drop (TRD 9.5 step 4)

- [ ] int8 AUROC within 0.015 of fp32 (floor 0.03). Bake-off: on validation (ADR-15 rule 2). Frozen model: once more on the internal test set.
- [ ] If not, keep full precision for that model **only if** it still fits the size budget. Record the decision.

## 5. Size (NFR-SIZE-01)

- [ ] Report file size in MB for each model. Fail if over budget.
- [ ] Never commit `.onnx` files except small test fixtures (`.gitignore`, Team Rules 6).

## 6. On-device benchmark (TRD 13.3, E5-01, E11-02)

Devices: reference phone plus one mid-range phone.

Record: phone model, Android version, Chrome version, RAM, free storage, model version and file hash, quantization format, thread count, cross-origin isolated (yes/no).

Measure:

- [ ] Cold start (app launch to ready).
- [ ] Model load time.
- [ ] p50 and p95 inference over a fixed number of runs, after warm-up. State the run count.
- [ ] Peak memory.
- [ ] Battery estimate over 50 screenings.
- [ ] No main-thread task over 50 ms during inference (NFR-PERF-07).

Low-memory rule: on phones reporting 2 GB or less, use one thread, the smaller input size and one model at a time (TRD 10.5). If threads are unavailable (no COOP/COEP), measure single-thread (ADR-2, R10).

## 7. Write up

Save to `docs/benchmarks/YYYY-MM-DD-<device>-<model-version>.md` with the table:

| Model | Format | Size MB | Load ms | p50 ms | p95 ms | Peak MB | Battery / 50 | Budget met? |
|-------|--------|---------|---------|--------|--------|---------|--------------|-------------|

If a budget is missed, say so and link the risk (R3) and the fallback (ADR-1 revisit trigger: p95 over 4 s means build the native comparison, E15-07).
