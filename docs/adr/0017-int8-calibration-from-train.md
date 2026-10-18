# ADR-17. int8 calibration images come from the train split

- **Status:** Proposed
- **Date:** 18 Oct 2026
- **Decided by:** Chelsea (ML lead). Needs team agreement; Kweku decides if there is no agreement (Team Rules 2).
- **Related:** TRD 9.5, ADR-5, ADR-15, `E5-02`, `E5-03`, skill `onnx-export-quantize-bench`

## Context

Static int8 (ADR-5) needs a set of images to measure the range of every layer's activations. TRD 9.5 step 2 says to take about 500 from the validation split. ADR-15 rule 2 then measures the int8 AUROC drop on that same validation split, because the internal test split stays locked until a model is frozen.

The Shenzhen validation split has 95 images. Taking the calibration images from it would set the int8 ranges on exactly the images that then judge the drop, which flatters int8. There are not enough validation images to split them into a calibration part and a measuring part.

## Options considered

1. Calibrate on validation, as TRD 9.5 says. Follows the text, but the drop is measured on the calibration images.
2. Calibrate on a fixed sample of training images (no augmentation) and measure the drop on validation. The drop is measured on unseen images; training images are already known to the model, so no new information leaks.
3. Split validation into calibration and measurement halves. About 47 images each: too few for either job.

## Decision

Option 2. `ml/export/export_onnx.py` takes 300 training images (fixed seed 591; the train split has 444) for calibration, and measures the drop on validation for the bake-off.

These are activation ranges, not probability calibration. Temperature scaling and thresholds still come from validation only (ADR-8, Team Rules 7).

## Consequences

- TRD 9.5 step 2 and the `onnx-export-quantize-bench` skill said validation; the skill now points here.
- The bake-off drop (ADR-15 rule 2) is measured on validation. The frozen model's drop is measured once more on the internal test split when that split is opened (TRD 9.5 step 4).
- First structural finding from the export (stand-in weights): MobileNetV3-Large keeps its HardSigmoid operations in float in ONNX Runtime, so int8 data is converted to float and back 38 times; EfficientNet-Lite0 converts almost fully to int8. This does not change accuracy rules but counts against MobileNetV3 for phone latency (`E5-01`).
- Change-log entry in `docs/planning/04_Team_Rules_and_Requirements.md`.

## Revisit trigger

A training set large enough that validation can hold at least 500 images that are not used to measure the drop, or an int8 drop on the internal test split that is more than 0.01 worse than the drop on validation.
