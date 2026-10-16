---
title: "Team Rules and Requirements"
subtitle: "TriageLens: How the Team Works and the Quality Bar We Hold"
date: "15 October 2026"
---

# 1. Purpose

This document sets the rules for how the four of us work together and the standards our work must meet. It is short on purpose: rules we do not read are rules we do not follow. It becomes active when all four members sign it in Sprint 0 (story E0-03). Changes need the agreement of the team lead and the project manager, and are recorded in the change log at the end.

**Three principles sit above every rule below.**

1. **Safety before speed.** If a shortcut could make the tool look safer or more accurate than it is, we do not take it.
2. **Sustainable pace.** We finish on time by planning realistically, not by working late. Nobody is a hero.
3. **Everyone can ship.** Each person can open, review and merge work in any part of the system with a pair. Knowledge is shared, not hoarded.

# 2. Team and Decision Rights

| Person | Role | Decides on |
|------------|------------------------------------------------|--------------------------------------------------|
| **Kweku** | Team lead and product owner | Scope, priorities, final call when the team is split; product and UX direction; safety and ethics sign-off |
| **Micheal** | Project manager and scrum master | Sprint process, meeting times, dependencies, risk register; flags overload and scope drift; demo plan |
| **Chelsea** | ML lead | Model choices, training and evaluation methods, which model version is frozen (with the team lead) |
| **Nana Yaw** | DevOps and QA lead | CI/CD, environments, release and rollback, test strategy, performance budgets |

**How we decide.** Try for agreement first. If a decision is small and reversible, the owner of that area decides and tells the team. If it is large or hard to undo (architecture, scope, a gate date, a claim in the report), write a one-page decision record, discuss it at a live sync, and the team lead decides if there is no agreement. Decisions are written down in the repository.

**Who is accountable (RACI).** R = does the work, A = accountable, C = consulted, I = informed.

| Workstream | Kweku | Chelsea | Nana Yaw | Micheal |
|--------------------------------------|-------|---------|----------|---------|
| Product scope and priorities | A, R | C | C | C |
| Data and datasets | C | A, R | R | R |
| Model training and evaluation | C | A, R | I | I |
| On-device inference and performance | C | R | A, R | R |
| App and UX | A, R | I | C | R |
| Backend, auth and sync | R | I | A, R | I |
| Safety, ethics and hazard log | A, R | R | C | C |
| CI/CD, testing and release | C | I | A, R | C |
| Project management and risk | C | I | I | A, R |
| Report, demo and documentation | A | R | R | R |

# 3. Workload Guardrails (No Overwork)

These rules protect the team. They are not optional.

| Rule | What it means in practice |
|------------------------------------|------------------------------------------------------------------|
| Plan below capacity | Each person commits to at most 8 points per two-week sprint (4 in Sprint 0), about 10 hours a week. The buffer is for reviews, learning and surprises. |
| No weekend work expected | Weekend work is voluntary and never planned. Nobody is asked about it. |
| Work-in-progress limit | At most 2 stories in progress per person. Finish before starting. |
| One day for unknowns | A spike is time-boxed to one day. Then decide, write the decision, move on. |
| Help before heroics | Stuck for half a day? Say so in the chat. Asking early is the rule, not a weakness. |
| Cut, do not stretch | If we are behind, we cut Should stories in the written cut order. We do not add hours. |
| Weekly health check | At each retrospective everyone rates their workload from 1 (too light) to 5 (too heavy). A 4 or 5 from anyone triggers a change in the next sprint, such as moving stories out. |
| Time off is respected | Exams, assignments and personal commitments go on the shared calendar in Sprint 0. We plan around them. |
| Meeting cap | About 2.5 hours of meetings per person per week. Everything else is async. |
| Quiet hours | No messages are expected to be answered between 20:00 and 08:00, except for a security incident. |
| Credit and kindness | We credit each other's work, review the work and not the person, and say thanks. |

# 4. Ways of Working

## 4.1 Rhythm

| Ritual | When | Length |
|---------------------------|-------------------------------------|--------|
| Sprint planning | First Monday of each sprint | 45 min (30 in Sprint 0) |
| Async check-in | Every working day by 10:00 in the team chat: done, next, blocked | 3 lines |
| Live sync | Tuesday and Thursday | 15 min |
| Backlog refinement | Wednesday of week 1 | 30 min |
| Sprint review and demo | Last Friday | 30 min |
| Retrospective and health check | Last Friday, after the review | 30 min |

## 4.2 Communication

- One team chat channel for day-to-day, one for announcements and decisions, one for alerts from CI.
- Reply to direct questions within one working day. If you will be away, say so in advance.
- Put decisions in writing (in the repository or the decision channel), not only in calls.
- Blocked for more than a working day goes to Micheal. A blocker that threatens a gate goes to Kweku the same day.
- Disagreements: state the options and the evidence; try for agreement; escalate to the team lead if still stuck after one live sync. Once decided, everyone commits.

## 4.3 Pairing

Pairing is how we learn without extra hours. Each sprint has planned pairs (listed in the Sprint Plan). A pairing session is 60 minutes and counts toward points. The less experienced person drives.

## 4.4 Tools

Git and GitHub (repo, pull requests, issues, CI); a shared board; Figma for design; a notebook or GPU service for training; Supabase and Vercel for the app; a private shared drive for datasets and photo sets.

# 5. Definitions

## 5.1 Definition of Ready (a story may start)

- It has an owner and a supporter.
- Acceptance criteria are written and testable.
- Dependencies are named and either finished or scheduled before it.
- It is 4 points or fewer (split larger ones).
- Anything it needs (data, access, a device) is available.

## 5.2 Definition of Done (a story is finished)

1. The code or document is merged to main after at least one review by a different person.
2. Automated tests for the new behaviour pass in CI; lint and type checks are clean.
3. The acceptance criteria are shown working in the preview build to the project manager (or, for ML stories, the results are logged and reviewed).
4. For anything that changes a model: the experiment is logged, the data manifest hash is recorded, parity and size checks pass, and the model card is updated.
5. For anything user-facing: strings are externalized, contrast and touch-target rules are met, and the wording rules (TRD 7.3) are respected.
6. No new high-severity security finding; no secrets in the repo.
7. Documentation is updated (README, ADR, runbook or model card as relevant).
8. Time is recorded against the points so we can learn from estimates.

## 5.3 Definition of Done for a Model Version

A model version is releasable only when: the data splits have no leakage; training is reproducible; internal, external, phone-photo and int8 results are reported with confidence intervals; calibration is done on validation data only; thresholds are saved in a signed file; subgroup results are reported; the model card is complete; the parity test passes; and the hazard log is updated.

# 6. Code and Repository Rules

| Area | Rule |
|---------------------|------------------------------------------------------------------|
| Branching | Short-lived branches from main. Name them `type/short-description`, for example `feat/quality-gate`. |
| Commits | Clear messages in the form `type: summary` (feat, fix, docs, test, chore, ml). |
| Pull requests | At most about 400 lines; one purpose; a short description of what and why; link the story ID. |
| Reviews | At least one review from a different person; reply within one working day; review for correctness, clarity, tests and safety. |
| Main branch | Protected. No direct pushes. CI must be green to merge. Main is always releasable. |
| Style | Automatic formatting and lint on save and in CI. No debates about style. |
| Tests | New logic needs tests. Triage rules, sync and the quality gate need at least 70 percent coverage. Bugs get a test before the fix. |
| Dependencies | Add only when needed; pin versions; record why in the pull request. No third-party scripts in the app. |
| Secrets | Never in the repository or chat. Use environment secrets. Rotate keys if one leaks. |
| Documentation | Each module has a short README. Decisions go in ADRs. |
| Generated files | Model files and large data live in versioned storage, not in git. |

# 7. Machine Learning Rules

| Rule | Why it matters |
|------------------------------------|--------------------------------------------------------------|
| Patient-level splits, fixed seeds, committed manifests | Image-level splits leak and inflate results. |
| **Test-set discipline.** External and test sets are touched once per frozen candidate. Never tune on them. | Peeking quietly ruins an honest evaluation. |
| No threshold choice on test data | Thresholds come from validation data only. |
| Log every run: config, seed, code commit, data hash, metrics | So any result can be reproduced and explained. |
| Three seeds for final numbers | To show spread, not luck. |
| Report negative and weak results | The project values honesty over a pretty table. |
| Review the 20 worst failures per model | Finds shortcuts and label errors. |
| Check for shortcuts (text, markers, device tags) before trusting a metric | Known problem in chest X-ray sets. |
| Compare against a simple baseline | A fancy model must beat a plain one. |
| Compute budget is shared | Check the GPU log before starting a large run; small runs first. |
| Frozen models are immutable | A change means a new version and a full re-validation. |
| No claims beyond the data | State dataset, threshold and interval every time. |

# 8. Data and Privacy Rules

1. **No real patient data** enters the project without ethics approval and a data-sharing agreement. Until then, only public datasets and fake data.
2. **Respect licences.** Use each dataset as its licence allows. Never redistribute. Keep copies on team-controlled storage only.
3. **Nothing sensitive in chat, email or screenshots.** If a case image or any health data appears in a message by mistake, delete it and tell Kweku.
4. **Local copies are encrypted.** Use full-disk encryption on laptops that hold datasets.
5. **No personal identifiers in the product:** no names, phone numbers or national IDs. Age band, not birth date.
6. **Consent for people we test with.** Usability participants give written consent. We do not record faces or voices without permission. Notes are anonymized.
7. **Photo test set** is made from public, de-identified images and stays on team storage.
8. **Credentials.** Use a password manager and two-factor sign-in on GitHub, Supabase, Vercel and cloud accounts.
9. **Report incidents at once.** A suspected leak or lost device goes to Kweku immediately; no blame.

# 9. Safety and Ethics Rules

1. **Use the approved wording.** Allowed: high risk, low risk, refer, not sure, retake. Not allowed: diagnosis, positive, negative, healthy, "you do not have".
2. **Every result carries the reminder** that it is screening support and a clinician decides.
3. **Uncertainty moves toward referral, never toward reassurance.**
4. **No overclaiming** in the app, the report, the demo or on social media. The claims review in Sprint 4 checks each one against data.
5. **Show limits.** The report and the app state who the tool is for, who it is not for (children), and where data comes from.
6. **Clinician-in-the-loop.** The product supports a trained worker and can be reviewed by a clinician.
7. **Be honest about missing groups.** African patient data is scarce in public sets; we say so.
8. **Human-subject work needs approval** before the first session.

# 10. UX and HCI Requirements

| Principle | Requirement |
|---------------------------|--------------------------------------------------------------------|
| Fast to first result | Home to capture in 5 taps or fewer; median time to first result 90 seconds or less. |
| Plain language | Reading level grade 8 or lower; short sentences; no jargon on the result screen. |
| Icon, colour and text | Every zone uses all three. Colour is never the only signal. |
| Sunlight-ready | High contrast (7 to 1 on zone messages), large touch targets (48 px or more). |
| Errors that help | Every rejection says what is wrong and what to do, for example "Shiny spot on the right: tilt the phone". |
| Offline is normal | Offline is a feature, not an error. Show sync status calmly. |
| No dark patterns | No pressure, no hidden data collection, no confusing consent. |
| Test with real users | Two usability rounds with at least 5 health workers or students each. |
| Accessibility | Meet WCAG 2.2 AA where practical; support text scaling. |

# 11. Quality Bar (Non-Negotiables)

The project is not delivered unless all of these are true:

- The core flow works with no internet on the reference phone.
- External validation is reported for all three conditions, with confidence intervals, even if results miss the target.
- Phone-photo results are reported next to clean-image results.
- No result is ever shown for an image that failed the gate.
- The wording rules are enforced by an automated check.
- Models are signed and versioned; every result stores the model version.
- No real patient data was used without approval.
- Each Must story meets its acceptance criteria.
- The hazard log is closed or accepted with reasons.

# 12. Change Control

- **Swap rule.** Adding work means removing work of similar size. No silent additions.
- **New ideas** go to the icebox; Micheal reviews the icebox at refinement.
- **Moving a gate date** needs both Kweku and Micheal and an updated Sprint Plan.
- **Changing a Must requirement** needs a short written note, team agreement and an updated TRD.
- **Changing these rules** needs agreement from all four and an entry in the change log.

# 13. Learning Plan

Learning happens inside the planned hours, through pairing. It is optional stretch, not a test.

| Person | Strength we rely on | Learning goal | Paired with |
|------------|-------------------------------------|------------------------------------------------|----------------|
| Nana Yaw | CI/CD, testing | ONNX export and quantization basics | Chelsea |
| Micheal | Frontend, AR/VR, project management | ONNX in a Web Worker; image augmentation; modality gate | Chelsea, Kweku |
| Chelsea | ML engineering | PWA constraints, on-device testing; model cards and calibration | Nana Yaw, Kweku |
| Kweku | Product, UX, AI, full stack | Supabase row-level security and sync patterns | Nana Yaw |

**Bus-factor rule.** For each critical area there are two people who can run it: ML pipeline (Chelsea and Kweku), release and CI (Nana Yaw and Micheal), app and UX (Kweku and Micheal), sync and database (Nana Yaw and Kweku).

# 14. Sign-Off

By signing, each member agrees to follow these rules and to raise concerns early.

| Name | Role | Signature | Date |
|--------------|--------------------------------|----------------------|------------|
| Kweku | Team lead and product owner | | |
| Micheal | Project manager | | |
| Chelsea | ML lead | | |
| Nana Yaw | DevOps and QA lead | | |

# 15. Change Log

| Date | Change | Agreed by |
|------------|-----------------------------------------|-----------|
| 15 Oct 2026 | First version | Draft |
