# Story issue template

Title: `[E#-##] <Story>`

```markdown
**Epic:** E# <Epic name>
**Requirement IDs:** <FR-.. / NFR-.. / ML-..>
**Priority:** Must | Should | Could
**Points:** <n> (4 or fewer)
**Sprint:** Sprint N (<dates>) | Icebox
**Owner:** <name>  **Support:** <name>
**Depends on:** <IDs, linked as #issue>

### Acceptance criteria
- [ ] <testable criterion>

### Definition of Done (Team Rules 5.2)
- [ ] Merged to main after at least one review by a different person
- [ ] Automated tests for the new behaviour pass in CI; lint and type checks are clean
- [ ] Acceptance criteria shown working in the preview build to the project manager (or, for ML stories, results logged and reviewed)
- [ ] If it changes a model: experiment logged, data manifest hash recorded, parity and size checks pass, model card updated
- [ ] If user-facing: strings externalized, contrast and touch-target rules met, wording rules (TRD 7.3) respected
- [ ] No new high-severity security finding; no secrets in the repo
- [ ] Documentation updated (README, ADR, runbook or model card as relevant)
- [ ] Time recorded against the points

**Scope change:** added on <date>; swapped with <ID> (<points>). Reason: <reason>.

Source: board-sync add (not in baseline v1.0)
```
