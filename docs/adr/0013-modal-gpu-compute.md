# ADR-13. GPU compute on Modal (answers D4)

- **Status:** Proposed
- **Date:** 18 Oct 2026
- **Decided by:** Chelsea (ML lead, owns D4). Needs team agreement by 23 Oct (TRD 4.6); Kweku decides if there is no agreement (Team Rules 2).
- **Related:** D4 (TRD 4.6), A3, R4, TRD 14.4, `E2-01`

## Context

TRD 4.6 leaves D4 open: "Which GPU source do we use?" The default, if nobody answers by 23 Oct, is Kaggle plus Colab. Training starts with `E2-01` (pipeline smoke test) in Sprint 0 and grows in Sprints 1 and 2 (`E2-02` to `E2-04`, `E3-02`). The TRD assumes about 80 GPU-hours in total (A3) and lists GPU time running short as risk R4.

Notebook sessions time out, are hard to run from the repo, and make "one command trains, evaluates and logs" (`E2-01` acceptance) awkward.

## Options considered

1. Kaggle plus Colab (baseline default): free or about USD 10 a month (TRD 14.4). Sessions time out, runs live in notebooks, not in the repo.
2. Modal: runs Python functions from the repo on a cloud GPU with one command (`modal run`). Pay per second of GPU time. Needs an account and a payment method.
3. University machine: free if available. Not confirmed for this team.

## Decision

**Modal is the main GPU source.** Kaggle plus Colab stay as the fallback. Training code runs from the repo with `modal run`, which fits the `E2-01` one-command rule. Chelsea owns the Modal workspace and its member list.

## Consequences

- Training scripts take a Modal entry point in `ml/modal/`. The core training code stays plain Python, so it still runs on Kaggle, Colab or a laptop.
- Datasets live in a private Modal volume (`triagelens-data`). Runs and checkpoints live in `triagelens-runs`. Neither is ever committed (TRD 9.2).
- Cost: TRD 14.4 budgets about USD 10 a month for GPU. Modal bills per second. Check the monthly spend at each sprint review and keep the total under the USD 50 limit (TRD 14.4).
- **Dataset terms:** check each dataset's terms before upload and record the answer in its data card. Shenzhen (`E1-03`): storage in a private cloud volume is allowed as long as no one else has access (confirmed by Chelsea, 18 Oct 2026). The raw set was uploaded to `triagelens-data` on 18 Oct 2026.
- **Access:** the data volume sits in Chelsea's personal workspace, which has Chelsea as its only member. Do not add members to that workspace while it holds data. Teammates who need GPU runs use their own workspace or the fallback, with their own copy of the data under the same terms.
- Change-log entry needed in `docs/planning/04_Team_Rules_and_Requirements.md` (D4 answered).
- After this ADR is Accepted, update the D4 row in `docs/ai-context.md`.

## Revisit trigger

- Modal spend reaches USD 30 in any month, or the projected total would pass the USD 50 limit (TRD 14.4).
- Under 20 GPU-hours of budget left before Sprint 3 (R4).
- A dataset's terms rule out cloud storage on Modal.
