---
name: sprint-ops
description: Run TriageLens sprint ceremonies from the Sprint Plan. Manual only. Usage /sprint-ops start N | status | review N | retro N.
disable-model-invocation: true
argument-hint: "start N | status | review N | retro N"
allowed-tools: Read, Grep, Glob, Bash(gh project item-list *), Bash(gh project field-list *), Bash(gh project view *), Bash(gh issue list *), Bash(gh issue view *)
---

# Sprint ops

Implements Sprint Plan 1.1, 1.2, 2, 3, 4, 5 and Team Rules 3, 4.1, 12. Supports stories E0-03, E0-05, E0-06.

Arguments received: `$ARGUMENTS`

Board: https://github.com/orgs/ICS-Capstone-Team-6/projects/1 (owner `ICS-Capstone-Team-6`, number 1). Read it with
`gh project item-list 1 --owner ICS-Capstone-Team-6 --format json --limit 200`.
Fields used: Sprint, Points, MoSCoW (Must, Should, Could), Owner, Status. The board's "Priority" field is an org-wide issue field and is not used.

Never plan or suggest weekend work or extra hours (Team Rules 3). When behind, cut; do not stretch.

## Rules you apply

- Capacity cap: at most **8 points per person** per two-week sprint; **4 in Sprint 0** (Team Rules 3).
- WIP limit: at most 2 stories In progress per person (Team Rules 3, Sprint Plan 5).
- Velocity check: fewer than **26 points** done in a two-week sprint triggers cutting Should stories in the cut order (Sprint Plan 1.2).
- Cut order (Backlog 2.3): 1 E10-02, 2 E8-09, 3 E9-04, 4 E13-03, 5 E6-03, 6 E8-07, 7 E10-01, 8 E6-02, 9 E0-06. Never cut a Must without the team lead and project manager agreeing.
- G3 (Thu 3 Dec) is a feature freeze: after it, only fixes, tests, docs and the report.

## `start N`

1. Read Sprint Plan section 3.(N+1) for goal, gate, exit criteria, per-person stories and "Order of work".
2. Update the line `- Current sprint: ...` in `CLAUDE.md` to `Sprint N (<dates>)`. Show the diff and ask before saving.
3. Read the board. List items whose Sprint field is `Sprint N`. Compare with the Sprint Plan list; report missing or extra items.
4. Sum Points per Owner. Flag anyone over the cap.
5. List dependencies for each story (CSV column "Depends on") and whether each is Done. Flag stories whose dependency is not Done.
6. Print the intra-sprint order of work from the Sprint Plan.

## `status`

1. Find the current sprint from `CLAUDE.md`.
2. From the board: points committed, points Done, points In review, per person and total.
3. Days elapsed vs working days (Sprint Plan 1.1).
4. Apply the velocity rule. If the projection is under 26 (or under 16 in Sprint 0), list the next Should stories in the cut order that are in this or later sprints.
5. Flag WIP over 2 per person and anything blocked over 1 working day (escalate to Micheal; gate threats to Kweku, Sprint Plan 5).

## `review N`

1. Open `docs/sprints/sprint-0N.md`.
2. For each exit criterion, ask for or find evidence (merged PRs, reports, board Done). Fill the Review notes table: Met? and Evidence.
3. Fill Velocity: committed vs done per person from the board.
4. Propose a gate decision (Pass, Pass with actions, Hold). The team lead and project manager decide (Sprint Plan 4); do not decide for them.

## `retro N`

1. In `docs/sprints/sprint-0N.md`, capture Keep / Stop / Start from what the user gives you. Do not invent items.
2. Record each person's workload rating 1 to 5.
3. Any 4 or 5: flag it and propose a concrete change for the next sprint, such as moving that person's Should stories out (Team Rules 3). A 4 or 5 twice for anyone triggers R6.
4. Remind: run `/board-sync export` after the retro.

Show every file change as a diff and wait for approval before saving.
