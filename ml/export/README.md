# ONNX export and int8 quantization

Turns a trained run into the files the app runs with ONNX Runtime Web (story `E5-02`; TRD 9.5; ADR-2, ADR-5). It also measures ADR-15 rule 2, the AUROC drop after static int8, which decides the backbone bake-off when rule 1 is a tie.

**Owner:** Chelsea. Second: Nana Yaw.

## What it makes

For each run folder, `export_onnx.py` writes `<run>/onnx/`:

| File | What it is |
| --- | --- |
| `fp32.onnx` | Full precision, fixed input `(1, 3, 320, 320)`, opset 17 |
| `int8_qdq.onnx` | Static int8, QDQ format |
| `int8_qop.onnx` | Static int8, QOperator format |
| `export_report.json` | Parity, AUROC per format, int8 drop with a 95% interval, size, CAM agreement, operations left in float, CPU latency |

Every file has two outputs: `tb_logit` and `features` (the feature map the app turns into the heatmap, ADR-9). Model files are git-ignored and stay in the `triagelens-runs` volume.

## Run on Modal

```sh
modal run ml/modal/train_app.py::export                 # every run in the latest bake-off summary
modal run ml/modal/train_app.py::export --summary ml/runs/bakeoff_summary_<stamp>.json
modal volume get --force triagelens-runs /bakeoff ml/runs/
```

It prints one row per run and a pass or fail per backbone for rule 2 (drop at most 0.015 on every seed) and rule 3 (at most 15 MB), and saves `ml/runs/export_summary_<stamp>.json`.

## Choices and why

| Choice | Why |
| --- | --- |
| Calibration images from the **train** split (300, fixed seed) | Validation has only 95 images. Setting the int8 ranges on the images that then measure the drop would flatter int8. These are activation ranges, not probability calibration, so the validation-only rule for calibration does not apply. |
| Per-channel int8 weights, uint8 activations, MinMax ranges | ONNX Runtime defaults for CNNs; the simplest static int8 (ADR-5) |
| Both QDQ and QOperator | TRD 9.5 asks to compare them for speed in the browser. Their accuracy is usually the same; speed is decided on the phone (`E5-01`). |
| Parity check before anything else | If fp32 ONNX differs from PyTorch, the int8 drop means nothing |
| CAM agreement | The heatmap comes from `features`, so int8 must keep it, not only the score |
| Count of float operations | MobileNetV3's HardSigmoid has no int8 kernel in ONNX Runtime, so each one converts int8 data to float and back. That costs time on the phone even when accuracy holds. |

CPU latency in the report is ONNX Runtime on the build machine, one thread. It only ranks formats and backbones; the phone numbers come from `E5-01`.

## Tests

```sh
pip install -r ml/requirements-train.txt
python3 -m unittest ml.tests.test_export -v     # skipped in the light CI job
```
