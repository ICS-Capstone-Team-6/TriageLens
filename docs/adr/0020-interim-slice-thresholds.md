# ADR-20. Interim triage thresholds for the M2 slice

- **Status:** Proposed
- **Date:** 21 Oct 2026
- **Decided by:** Kweku (team lead; owner of E6-01 calibration and thresholds). Chelsea computes the values. Needs team agreement at the G0 review on Fri 23 Oct (Team Rules 2).
- **Related:** E6-01, ADR-8, [ADR-19](0019-m2-thin-slice-pulled-forward.md), proposed ADR-18; TRD 3.4, 7.2, ML-CALIB-03; hazards H1, H4

## Context

TRD 7.2 needs two thresholds per condition, chosen on validation data only. The **screen-out** threshold catches at least 90% of true cases. The **refer** threshold is "confident enough that false alarms are limited", with no number given. ADR-8 puts temperature scaling (calibration) before the thresholds, but calibration is story E6-01 (Sprint 2), and the M2 slice ships on 22 Oct.

Evidence for the frozen run `efficientnet_lite0_seed1_20261021T114608Z` (proposed ADR-18):

- At the 90%-sensitivity point set on Shenzhen validation, sensitivity on the external Montgomery set fell to 70.2%. That is below the 85% floor (TRD 3.4), and it is false reassurance (H1) caused by domain shift (H4).
- The Shenzhen validation split is small, about 94 images. One missed TB case moves sensitivity by about 2 points, so any threshold carries a wide confidence interval.

## Options considered

1. **90% sensitivity, as TRD 7.2 says, with no refer threshold yet.** Matches the baseline, but leaves only two zones and repeats the 70% external result.
2. **Screen-out at 95% or higher sensitivity and refer at 95% or higher specificity, both on raw validation logits.** More cases become Not sure (retake or refer), fewer become false Low risk. Not calibrated.
3. **Calibrate first, then set the thresholds.** Follows ADR-8 in order, but cannot be done and checked before 22 Oct.

## Decision

Option 2, for the M2 slice only:

| Threshold | Rule, on the Shenzhen **validation** split only |
|-----------|--------------------------------------------------|
| Screen-out (Low risk / Not sure) | Highest threshold with sensitivity of 95% or higher |
| Refer (Not sure / Refer now) | Lowest threshold with specificity of 95% or higher |

Both are set on raw (uncalibrated) fp32 logits and versioned as `thresholds v0-uncalibrated` in a versioned file that names the run ID, the split hash and the rule (ML-CALIB-03). Chelsea computes them and reports sensitivity and specificity with Wilson 95% intervals at each point, plus the share of validation images that fall between them.

## Consequences

- The screen-out rule is stricter than the TRD 7.2 figure of 90%. This is a deliberate, temporary move toward refer or retake (TRD 7.2), recorded as a change to a baseline requirement.
- More results will be Not sure. The monitoring page reports the zone mix so the team can see how many.
- If the screen-out threshold comes out above the refer threshold, the zones overlap. Nothing ships until the team decides.
- The confidence intervals are wide. Reports must show them, not a bare 95%.
- E6-01 recalibrates (temperature scaling, ADR-8) and sets both thresholds again. These values do not carry over.
- Hazard log: H1 and H4 mitigations reference this ADR.
- Change-log entry in `docs/planning/04_Team_Rules_and_Requirements.md`.

## Revisit trigger

E6-01 calibration is done, or the monitoring page shows Not sure above an agreed share of results, or a new frozen run replaces this one.
