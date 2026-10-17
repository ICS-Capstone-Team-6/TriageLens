## Story

[E#-##] Closes #

## What and why

<!-- What changed and why. One purpose per PR; about 400 lines at most (Team Rules 6). -->

## How tested

<!-- Commands run, tests added, devices tried. For ML: run IDs, data manifest hash. -->

## Definition of Done (Team Rules 5.2)

- [ ] At least one review by a different person
- [ ] Automated tests for the new behaviour pass in CI; lint and type checks are clean
- [ ] Acceptance criteria shown in the preview build to the project manager (or, for ML stories, results logged and reviewed)
- [ ] If it changes a model: experiment logged, data manifest hash recorded, parity and size checks pass, model card updated
- [ ] If user-facing: strings externalized, contrast and touch-target rules met, wording rules (TRD 7.3) respected
- [ ] No new high-severity security finding; no secrets in the repo
- [ ] Documentation updated (README, ADR, runbook or model card as relevant)
- [ ] Time recorded against the points

## Safety checklist

- [ ] No forbidden wording: diagnosis, positive, negative, healthy, "you do not have" (wording lint passes)
- [ ] Fail-safe: uncertainty moves toward refer or retake; symptoms never lower a zone; a failed quality gate shows no zone
- [ ] Every result stores model version, threshold version and quality scores
- [ ] No real patient data, datasets, model binaries or secrets in this PR
- [ ] For result-screen or triage changes: `safety-reviewer` agent run and blockers resolved
- [ ] Hazard log updated if a hazard is affected (`docs/safety/hazard-log.md`)

## Screenshots (UI changes)

<!-- Use fake or public sample data only. -->
