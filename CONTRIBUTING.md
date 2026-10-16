# Contributing to TriageLens

This summarises the [Team Rules](docs/planning/04_Team_Rules_and_Requirements.md). The Team Rules win if the two ever disagree. New to the repo? Start with [onboarding](docs/process/onboarding.md).

## Pick a story

1. Take a story from the [board](https://github.com/orgs/ICS-Capstone-Team-6/projects/1) in the current sprint that you own and that is **Ready** (Definition of Ready: [docs/process/definition-of-ready.md](docs/process/definition-of-ready.md)).
2. Keep at most **2 stories In progress** at a time (Team Rules 3).
3. New ideas go to the Icebox. Adding work to a sprint follows the **swap rule**: remove work of similar size (Team Rules 12).

## Branches and commits (Team Rules 6)

- Branch from `main`: `type/E8-05-short-name`, where type is `feat`, `fix`, `docs`, `test`, `chore` or `ml`.
- Commit messages: `type: summary`, for example `feat: add blur check to quality gate`.
- Keep branches short-lived.

## Pull requests (Team Rules 6)

- Title: `[E8-05] summary`. Link the issue with `Closes #NN`.
- One purpose per PR, about **400 lines at most**.
- Fill in the PR template, including the safety checklist.
- At least **one review from a different person**. Reviewers reply within **one working day** and review for correctness, clarity, tests and safety.
- CI must be green. `main` is protected: no direct pushes.
- Changes to result screens or triage rules: run the `safety-reviewer` agent. Model changes: run `ml-auditor`.

## Definition of Done

A story is done only when it meets [Team Rules 5.2](docs/process/definition-of-done.md): reviewed and merged, tests green, acceptance criteria shown in the preview build, model card and docs updated, no secrets, time recorded.

## Code rules

- New logic needs tests. Triage rules, sync and the quality gate need at least 70% coverage. A bug gets a test before the fix.
- Add dependencies only when needed; pin versions and say why in the PR. No third-party scripts in the app.
- User-facing text uses the approved wording only (TRD 7.3). CI runs `scripts/check_wording.py`.
- Each module has a short README. Decisions go in ADRs (`docs/adr/`).

## Never commit

Real patient data, datasets, photo sets, model binaries, checkpoints, `.env` files or secrets (Team Rules 6 and 8). If health data or a secret lands in a commit, tell Kweku at once. Do not just delete it in a later commit.

## Workload (Team Rules 3)

- Plan at most **8 points per two-week sprint** (4 in Sprint 0), about 10 hours a week.
- **No weekend work is expected.** It is never planned and nobody is asked about it.
- No messages are expected between 20:00 and 08:00, except for a security incident.
- Stuck for half a day? Say so in the chat. Asking early is the rule.
- If we are behind, we **cut** Should stories in the written order. We do not add hours.
- At each retro everyone rates their workload from 1 to 5. A 4 or 5 triggers a change next sprint.

## Baseline documents

`docs/planning/` is frozen at v1.0. To change a requirement, write an ADR and add a row to the Team Rules change log (Team Rules 12).
