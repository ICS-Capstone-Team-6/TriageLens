# Definition of Done

Copied from [Team Rules sections 5.2 and 5.3](../planning/04_Team_Rules_and_Requirements.md). If this page and the Team Rules ever differ, the Team Rules win. The same list is in the PR template and every story issue.

## A story is finished when (Team Rules 5.2)

- [ ] 1. The code or document is merged to main after at least one review by a different person.
- [ ] 2. Automated tests for the new behaviour pass in CI; lint and type checks are clean.
- [ ] 3. The acceptance criteria are shown working in the preview build to the project manager (or, for ML stories, the results are logged and reviewed).
- [ ] 4. For anything that changes a model: the experiment is logged, the data manifest hash is recorded, parity and size checks pass, and the model card is updated.
- [ ] 5. For anything user-facing: strings are externalized, contrast and touch-target rules are met, and the wording rules (TRD 7.3) are respected.
- [ ] 6. No new high-severity security finding; no secrets in the repo.
- [ ] 7. Documentation is updated (README, ADR, runbook or model card as relevant).
- [ ] 8. Time is recorded against the points so we can learn from estimates.

## A model version is releasable when (Team Rules 5.3)

- [ ] The data splits have no leakage.
- [ ] Training is reproducible.
- [ ] Internal, external, phone-photo and int8 results are reported with confidence intervals.
- [ ] Calibration is done on validation data only.
- [ ] Thresholds are saved in a signed file.
- [ ] Subgroup results are reported.
- [ ] The model card is complete.
- [ ] The parity test passes.
- [ ] The hazard log is updated.
