# ADR-18. EfficientNet-Lite0 chosen; shipped at full precision until int8 passes

- **Status:** Proposed (approved by Chelsea, 20 Oct 2026; team agreement pending)
- **Date:** 20 Oct 2026
- **Decided by:** Chelsea (ML lead). Needs team agreement; Kweku decides if there is no agreement (Team Rules 2).
- **Related:** ADR-3, ADR-5, ADR-15, ADR-16, ADR-17, TRD 9.5, TRD 10.6, NFR-SIZE-01, NFR-PERF-01, risk R3, `E2-01`, `E5-01`, `E5-02`, `E5-03`

## Context

ADR-15 picks the M2 backbone in order: (1) validation AUROC, where a gap smaller than the seed spread is a tie; (2) AUROC drop after static int8, at most 0.015; (3) int8 size, at most 15 MB.

Bake-off 2 (`cxr-pre-2`, `shape_jitter` 0.15, 3 seeds each, 18 Oct 2026):

| | MobileNetV3-Large | EfficientNet-Lite0 |
| --- | --- | --- |
| Validation AUROC, mean and spread | 0.912 (sd 0.008) | 0.924 (sd 0.014) |
| Rule 1 | Tie: the 0.012 gap is smaller than the spread | Tie |

Static int8 (`ml/export/export_onnx.py`, 20 Oct 2026; calibration on 300 training images, ADR-17; drop measured on validation):

| | MobileNetV3-Large | EfficientNet-Lite0 |
| --- | --- | --- |
| First export (MinMax), mean drop | 0.075 | 0.053 |
| Best setting from the sweep (`reduce_range`), drop per seed | 0.056, 0.062, 0.065 | 0.031, 0.032, 0.006 |
| Int8 error on held-out training images (logit RMSE, label-free) | 2.65 | 1.10 |
| Operations left in float after int8 | 37 (HardSigmoid, ReduceMean) | 1 (ReduceMean) |
| Rule 2 (at most 0.015 on every seed) | Fail | Fail |
| Size: int8 / full precision | 3.3 MB / 11.3 MB | 3.6 MB / 12.8 MB |

The best setting was chosen by the label-free error on held-out training images, a rule fixed before the results (`ml/export/README.md`). `reduce_range` mainly avoids an int8 overflow on x86 server CPUs, so part of the measured drop may come from the build machine rather than the phone's runtime (ONNX Runtime Web, WebAssembly). That has not been measured yet (`E5-03`).

Neither backbone passes rule 2 as written, so ADR-15 cannot finish on its own terms.

## Options considered

1. Choose MobileNetV3-Large, the ADR-3 default. Loses about three times more in int8 and keeps 37 float operations.
2. Choose EfficientNet-Lite0 and ship int8 anyway. Breaks the 0.03 floor on two of three seeds.
3. Choose EfficientNet-Lite0 and ship it at full precision, as TRD 9.5 step 4 allows ("keep full precision for that model if it still fits the size budget"). Keep working on int8.
4. Quantization-aware training before choosing. The usual fix when post-training int8 loses this much, but sprint-sized; blocks the external test and the slice.

## Decision

Option 3.

- **Backbone: EfficientNet-Lite0.** Rule 1 is a tie. Rule 2 fails for both, but it separates them in the same direction under every setting tried: EfficientNet-Lite0 loses about half as much, its int8 error is less than half, and it quantizes almost fully. Its validation AUROC is also higher, although within the spread.
- **Format: full precision (fp32) ONNX** until int8 passes rule 2 in the browser runtime. 12.8 MB is within the 15 MB budget (NFR-SIZE-01).
- **Frozen run: the median seed by validation AUROC**, `efficientnet_lite0_seed2_20261018T153928Z` (validation AUROC 0.918, 95% CI 0.855 to 0.965). This rule is fixed before any test or external score is seen. It does not pick the best seed (seed 3, 0.940), which would overstate the result, and it does not pick by int8 drop (seed 3 also has the smallest drop, 0.006), because full precision is what ships.

## Consequences

- ADR-5's revisit trigger (accuracy drop over 0.03) has fired. ADR-5 stays the goal; this ADR is the interim.
- The frozen model is scored once on the Shenzhen internal test split and once on the locked Montgomery set (ML-DATA-04), full precision and int8 side by side (ML-EVAL-03).
- TRD 10.6 and the TRD 9.10 manifest name an `.int8.onnx` file; the M2 manifest names the fp32 file instead.
- Latency and memory risk (R3, NFR-PERF-01): fp32 is about 1.5 times slower than int8 on the build machine's CPU (about 22 ms vs 14 ms, one thread; indicative only). The phone benchmark (`E5-01`) decides whether fp32 meets p95 2.5 s.
- Offline footprint: 12.8 MB of the 60 MB budget for this model, instead of 3.6 MB.
- int8 work continues (`E5-02`, `E5-03`): try int8 activations as well as int8 weights (avoids the x86 overflow), and measure the drop in ONNX Runtime Web, which is the number that counts. Quantization-aware training goes to the backlog if both fail.
- The bake-off re-runs on external AUROC and phone latency before release (ADR-15).
- Change-log entry in `docs/planning/04_Team_Rules_and_Requirements.md`; ADR-3 default noted as replaced for M2.

## Revisit trigger

Any one of:

- An int8 EfficientNet-Lite0 passes rule 2 (drop at most 0.015 on every seed) measured in ONNX Runtime Web: switch to int8.
- fp32 p95 inference on the reference phone is over 2.5 s (`E5-01`).
- The Montgomery external AUROC falls below the TRD floor of 0.80: the backbone choice is reopened with the external result.

## Follow-up: retrained on dataset v2 (21 Oct 2026)

Dataset v2 (`0445b087fed038c4`) applies stricter label checks and keeps every remaining patient in its v1 split (`ml/manifests/shenzhen_v2/DATA_CARD.md`). EfficientNet-Lite0 was retrained on it with the same recipe and seeds; MobileNetV3-Large was not, because the reasons for this decision (int8 loss and float operations) are properties of the architecture, not of 17 removed records.

| Seed | Validation AUROC (v2) |
| --- | --- |
| 1 | 0.922 |
| 2 | 0.917 |
| 3 | 0.927 |
| Mean, sd | 0.922, 0.005 (v1: 0.924, 0.014) |

By the rule above, the frozen run is now the median seed: `efficientnet_lite0_seed1_20261021T114608Z` (validation AUROC 0.922; fit gap +0.067 mean over seeds, border-mask drop 0.027, shape correlation -0.387). It is scored once on the Shenzhen v2 test split and the Montgomery external set by `modal run ml/modal/train_app.py::evaluate` (`ml/train/evaluate.py`), full precision and int8 side by side; the only operating point reported uses a threshold set on validation.
