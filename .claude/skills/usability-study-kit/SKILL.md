---
name: usability-study-kit
description: Plan, run and score TriageLens usability test rounds with health workers. Use when preparing a usability session, checking consent and IRB status, writing a test script, scoring SUS questionnaires, writing up round results, or turning usability findings into backlog issues.
allowed-tools: Read, Grep, Glob, Bash(python3 .claude/skills/usability-study-kit/sus.py *)
---

# Usability study kit

Enforces TRD 13.4, TRD 3.4 usability targets, TRD 12.3 step 2, Team Rules 8.6, 9.8 and 10, NFR-USAB-01 to 05.
Supports stories E8-01, E8-08, E8-10, E8-07 (retake comparison), E12-01.

## 0. Gate check (do this first)

Read `docs/ethics/irb-checklist.md`. If "Approval or exemption received" is not ticked with evidence, **stop**: no session may run (Team Rules 9.8). Say so plainly.

## 1. Participants and consent

- At least 5 per round: nurses, community health workers or nursing students (TRD 13.4).
- Written consent with the approved form (draft: `docs/ethics/consent-template.md`).
- No patient data. Sample images come from public datasets only.
- No recording of faces or voices without explicit permission (Team Rules 8.6).
- Notes use codes P1, P2, ...; never names. Signed forms stay offline, never in git.

## 2. Test script (tasks from TRD 13.4)

Read the participant this line: "We are testing the app, not you. There are no wrong answers. Please think aloud."

| # | Task | Success when | Record |
|---|------|--------------|--------|
| T1 | Install and open the app | App opens from the home screen | time, errors |
| T2 | Screen one X-ray photo | A result zone is shown | time to first result, taps from home to capture |
| T3 | Retake a poor image | Participant follows the retake reason and gets a pass | retakes |
| T4 | Interpret an "Unsure" result | Says it means retake or refer | their words |
| T5 | Find a saved case | Opens the right case | time, errors |
| T6 | Sync | Starts sync and reads the status | errors |

After the tasks: ask "In your own words, what do the red, amber and green results mean?" Write the answer verbatim. Then the SUS form.

Round 1 (Sprint 3) is before the guidance overlay; round 2 (Sprint 4) is with it, to compare retakes (TRD 13.4).

## 3. Score SUS

Put responses in a CSV: `participant,q1,...,q10` with values 1 to 5. Run:

```
python3 .claude/skills/usability-study-kit/sus.py responses.csv
```

It prints each participant's score and the mean and median. Standard SUS scoring (Brooke 1996, TRD ref 13).
Test it with `python3 .claude/skills/usability-study-kit/test_sus.py`.

## 4. Results write-up

Save to `docs/usability/round-N-results.md` with [results-template.md](results-template.md). Compare against TRD 3.4:

| Metric | Target | Floor |
|--------|--------|-------|
| SUS | at least 75 | at least 68 |
| Task success on first screening | at least 90% | at least 80% |
| Median time to first result | at most 90 s | at most 150 s |

Also report taps home to capture (at most 5, NFR-USAB-01).

## 5. Findings to backlog

- Rank issues by severity (blocks task / slows task / cosmetic) and frequency.
- Top 5 are fixed or logged (E8-08 acceptance criteria).
- Any participant who read a zone as a diagnosis or as reassurance is a **safety finding**: add evidence to H2 or H10 in `docs/safety/hazard-log.md`.
- Each fix that is new work goes through `/board-sync add` (swap rule). Fixes inside E8-08 or E8-10 scope do not need a new story.
