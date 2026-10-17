# Risk register

Living register, seeded from [TRD section 16](../planning/01_TRD.md). The risk, likelihood (L), impact (I), mitigation, owner and trigger columns are copied from the baseline. Status and last reviewed are filled in at each review. Owner of this file: Micheal (project manager, Team Rules 2). Story: E0-05.

Likelihood and impact: L (low), M (medium), H (high). **Status values:** Open, Watching (trigger close), Triggered (action under way), Closed.

> **Weekly review.** Micheal reviews every risk each week at the Tuesday live sync. Check each trigger and update Status and Last reviewed. A triggered risk gets an owner action in the chat that day; one that threatens a gate goes to Kweku the same day (Sprint Plan 5). E0-05 acceptance: the top 10 risks have owners and triggers and are reviewed every week.

| ID | Risk | L | I | Mitigation | Owner | Trigger | Status | Last reviewed |
|----|------|---|---|------------|-------|---------|--------|---------------|
| R1 | Dataset access is slow (credentialed sets) | M | M | Request in Sprint 0; start with fully open sets; mBRSET and Messidor-2 are external tests only | Micheal | No reply by end of Sprint 1 | Open | |
| R2 | External validation shows poor transfer | H | H | Photo-aware training, distillation, more varied training data; report honestly; limit claims | Chelsea | External AUROC below the floor | Open | |
| R3 | Model too slow or large on the reference phone | M | H | Smaller backbone, lower resolution, int8, one model at a time; native comparison as fallback | Nana Yaw | p95 above 4 s | Open | |
| R4 | GPU time runs short | M | M | Smaller models, fewer seeds, mixed precision, checkpoints, free GPU pools | Chelsea | Under 20 GPU-hours left before Sprint 3 | Open | |
| R5 | Ethics approval is slow | M | M | Run in parallel; core build uses public data; local validation is stretch | Kweku | No approval by week 5 | Open | |
| R6 | Team availability (exams, other courses) | H | M | 83 percent planned load; cut order; weekly workload check | Micheal | Anyone reports 4 or 5 on workload twice | Open | |
| R7 | Scope creep | M | M | Swap rule; icebox; changes need lead and project manager | Kweku | Unplanned stories in a sprint | Open | |
| R8 | Single point of failure on ML | M | H | Kweku as second AI engineer; documented pipeline; pair on model cards | Kweku | Chelsea unavailable over 3 days | Open | |
| R9 | iOS and browser limits (background sync, storage eviction) | M | M | Android first; visible "Sync now"; request persistent storage | Nana Yaw | Tester on iOS reports loss | Open | |
| R10 | Cross-origin isolation breaks features | L | M | No third-party embeds; fall back to one thread | Nana Yaw | Threads not available | Open | |
| R11 | Label noise and leakage inflate results | H | H | Patient-level splits; duplicate checks; locked external sets; failure review | Chelsea | Internal far above external | Open | |
| R12 | Browser storage eviction loses data | M | H | Persistent storage; sync reminders; warnings | Nana Yaw | Quota warnings | Open | |
| R13 | Privacy incident | L | H | Minimization; no real patient data in dev; rules in Team Rules | Kweku | Any suspected leak | Open | |
| R14 | Demo failure (no internet, hardware) | M | M | Offline demo; backup video; rehearse twice | Micheal | Rehearsal fails | Open | |
| R15 | Photo test set is poor quality | M | M | Written protocol; two phones; spot checks by a second person | Micheal | Review finds over 10% unusable | Open | |
| R16 | Overwork and burnout | M | H | Capacity cap, buffer, no weekend expectation, retrospective health check | Micheal | Workload rating 4 or 5 | Open | |

## Adding a risk

Add the next ID (R17 and up) with likelihood, impact, mitigation, owner and a measurable trigger. Raise it at the next live sync.
