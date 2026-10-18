# ADR-14. TB-only output for the chest X-ray model at M2

- **Status:** Proposed
- **Date:** 18 Oct 2026
- **Decided by:** Chelsea (ML lead). Needs team agreement; Kweku decides if there is no agreement (Team Rules 2).
- **Related:** ADR-4, TRD 9.3, TRD 10.6, `E2-01`, `E2-02`, `E1-03`, hazard H11

## Context

ADR-4 plans one chest X-ray network with two outputs, TB and pneumonia, trained with a masked loss. TRD 10.6 fixes its interface as a TB logit, a pneumonia logit and the last feature map.

At M2 the team holds one dataset: the Shenzhen TB set (`ml/manifests/shenzhen_v1/`, 635 images, TB labels only). No pneumonia data has been obtained (RSNA and VinDr-CXR are not downloaded). A pneumonia output trained on no pneumonia labels would still be exported. If the app ever read it, it would show a meaningless score.

## Options considered

1. Keep the two-output head now and mask the pneumonia loss on every image. Matches TRD 10.6, but ships an untrained output.
2. One TB output now. Add the pneumonia output when pneumonia data exists, as ADR-4 plans. Changes the TRD 10.6 interface for M2.

## Decision

Option 2. The M2 chest X-ray model has one output, a TB logit, plus the last feature map for the class activation map (ADR-9). ADR-4 is deferred, not rejected: the multi-task comparison runs once pneumonia data is in the pipeline.

## Consequences

- The M2 model interface is: input float32 [1, 3, 320, 320]; outputs a TB logit [1] and the last feature map [1, C, h, w]. TRD 10.6 lists a pneumonia logit that the M2 model does not have.
- The app and triage engine must not expect a pneumonia score from the M2 model. The result screen shows TB only.
- Adding pneumonia later means a new head and a retrain, and a new model version with full re-validation (Team Rules 5.3).
- Change-log entry in `docs/planning/04_Team_Rules_and_Requirements.md`.

## Revisit trigger

Pneumonia training data passes the data pipeline (`E1-03` style manifest), or the team drops pneumonia from scope.
