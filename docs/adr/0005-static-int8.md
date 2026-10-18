# ADR-5. Compression

- **Status:** Accepted (baseline)
- **Date:** 15 Oct 2026
- **Source:** [TRD section 10.3](../planning/01_TRD.md), row ADR-5. Copied from the baseline; wording not changed.

## Context

Compression for TriageLens. See TRD section 10.3 for the full architecture.

## Options considered

Static int8, dynamic int8, float16, pruning

## Decision

**Static int8 with a calibration set.** CPU-friendly.

## Consequences

Not stated separately in the baseline. Add consequences here as they are learned, through a pull request.

- 18 Oct 2026: calibration images come from the train split, not validation ([ADR-17](0017-int8-calibration-from-train.md)).
- 18 Oct 2026: MobileNetV3's HardSigmoid has no int8 kernel in ONNX Runtime and stays in float, adding int8 to float conversions; EfficientNet-Lite0 quantizes almost fully (ADR-17, `ml/export/README.md`).

## Revisit trigger

Accuracy drop over 0.03.
