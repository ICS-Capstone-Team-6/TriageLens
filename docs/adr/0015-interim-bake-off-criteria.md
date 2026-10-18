# ADR-15. Interim bake-off criteria while no external test set exists

- **Status:** Proposed
- **Date:** 18 Oct 2026
- **Decided by:** Chelsea (ML lead). Needs team agreement; Kweku decides if there is no agreement (Team Rules 2).
- **Related:** ADR-3, ADR-5, TRD 9.3, TRD 9.5, ML-DATA-04, `E2-01`, `E2-02`

## Context

ADR-3 and TRD 9.3 pick the backbone by a bake-off judged on external AUROC, latency on the reference phone and heatmap compatibility. At M2 there is no external test set (Montgomery and the India sets are not downloaded) and no reference-phone benchmark (`E5-01`). The internal test split must stay locked until a model is frozen (ML-DATA-04), so it cannot be used to choose.

## Options considered

1. Wait for an external set and a phone benchmark before choosing. Blocks the deployed slice.
2. Judge now on what is available, and re-run the bake-off when external data and the phone benchmark exist.

## Decision

Option 2. Two candidates, MobileNetV3-Large and EfficientNet-Lite0, are trained on the same split with the same recipe and three seeds. The interim winner is chosen in this order:

1. Validation AUROC, mean of three seeds. A gap smaller than the spread across seeds counts as a tie.
2. AUROC drop after static int8 quantization, which must be 0.015 or less (ADR-5).
3. File size after int8, which must be 15 MB or less (TRD 10.6).

The internal test split is not used to choose.

## Consequences

- The M2 choice is provisional and is reported as such.
- Both backbones keep a plain pooling and linear head, so both support the class activation map (ADR-9).
- The bake-off re-runs on external AUROC and phone latency before the model is frozen for release.
- Change-log entry in `docs/planning/04_Team_Rules_and_Requirements.md`.

## Revisit trigger

An external TB test set passes the data pipeline, or the reference-phone benchmark (`E5-01`) runs.
