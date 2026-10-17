---
name: board-sync
description: Keep docs/planning/product_backlog.csv, the GitHub issues and the TriageLens GitHub Project consistent. Manual only. Usage /board-sync export | reconcile | add | move <ID> <sprint> <reason>.
disable-model-invocation: true
argument-hint: "export | reconcile | add | move <ID> <sprint> <reason>"
allowed-tools: Read, Grep, Glob, Bash(gh project item-list *), Bash(gh project field-list *), Bash(gh project view *), Bash(gh issue list *), Bash(gh issue view *)
---

# Board sync

Implements Team Rules 12 (swap rule, change control), Backlog 6, Sprint Plan 5. Supports stories E0-03, E0-05.

Arguments received: `$ARGUMENTS`

- Board: https://github.com/orgs/ICS-Capstone-Team-6/projects/1 (owner `ICS-Capstone-Team-6`, number 1)
- Repo: `ICS-Capstone-Team-6/TriageLens`
- Baseline: `docs/planning/product_backlog.csv` (frozen; never edited by this skill)
- Issue map: `scripts/github/issue-map.json` (story ID to issue number), if it exists
- Issues are matched by the title prefix `[E#-##]`.

Hard rules:

- **Never delete** issues, project items, fields or labels. Close an issue with a comment giving the reason instead.
- Every write (`gh issue edit/create/close`, `gh project item-edit/item-add`) needs the user's approval: show the exact commands first.
- Check `gh project --help` and subcommand help before using a flag. Prefer name-based `gh project item-edit` if this gh version supports it; otherwise the ID-based form (`--id`, `--field-id`, `--project-id`, `--single-select-option-id`). One field per call; sleep about 1 s between writes.

## `export`

1. If `scripts/github/export_board.sh` exists, run it (ask first). Otherwise:
   `gh project item-list 1 --owner ICS-Capstone-Team-6 --format json --limit 300`
2. Write `docs/sprints/board-snapshot-YYYY-MM-DD.csv` (today's date) with columns: ID, Title, Status, Sprint, Points, MoSCoW, Epic, Owner, Support, Depends on, Issue number, Issue state.
3. Print totals by Sprint and Status.

## `reconcile`

1. Load the CSV, the board (item-list JSON) and the issues (`gh issue list --repo ICS-Capstone-Team-6/TriageLens --state all --limit 300 --json number,title,state,labels,milestone`).
2. For every ID report differences in: title, points, priority, sprint, owner. Also: IDs missing from the board, board items with no CSV row, duplicate titles.
3. Differences that are recorded scope changes (issues labelled `scope-change`, or ADR / change-log entries) are expected; mark them "recorded".
4. Print a table. Propose fixes; apply none without approval.

## `add`

Swap rule (Team Rules 12): adding work means removing work of similar size. No silent additions.

1. Ask for: epic, story title, requirement ID, priority, points (4 or fewer, Backlog 6), owner, support, sprint, depends on, acceptance criteria.
2. New ideas go to the **Icebox** by default (Backlog 6). If the user wants it in a sprint, ask which story of similar points leaves that sprint, and where it goes.
3. Next ID: highest existing `E<epic>-NN` plus one.
4. Draft the issue body from [story-template.md](story-template.md). Labels: priority, epic, type, plus `scope-change` if it enters a sprint.
5. Show the issue body and the swap. On approval: create the issue, add it to the board, set fields, and move the swapped story.
6. Remind: a change to a Must requirement needs a short written note, team agreement and an updated TRD via an ADR (Team Rules 12).

## `move <ID> <sprint> <reason>`

1. Require a reason; refuse without one.
2. Show current Sprint and target. Check the target sprint's per-person cap (8, or 4 in Sprint 0) after the move.
3. If moving into a sprint, require the swap (above).
4. On approval: update the Sprint field and milestone, and add an issue comment: `Moved from <old> to <new> on <date>. Reason: <reason>.`
5. Moving a gate date needs both Kweku and Micheal (Sprint Plan 5); flag it.
