# GitHub automation

Scripts that turn `docs/planning/product_backlog.csv` into labels, milestones, issues and the GitHub Project https://github.com/orgs/ICS-Capstone-Team-6/projects/1, and keep them in step.

**Owner:** Micheal (board) with Nana Yaw (automation)

## Prerequisites

- `gh` 2.93 or newer, logged in: `gh auth status`
- Token scopes `project` and `repo`: `gh auth refresh -s project -s repo`
- Python 3.9 or newer (standard library only)
- Write access to `ICS-Capstone-Team-6/TriageLens` and admin on the org project

## Order

| Script | Steps | Writes |
|--------|-------|--------|
| `00_run_all.sh` | everything below, then `verify` | yes |
| `01_labels.sh` | priority, epic, type and process labels | yes |
| `02_milestones.sh` | Sprint 0 to Sprint 4 with due dates, goal, gate and exit criteria | yes |
| `03_fields.sh` | project description, README, repo link; fields Sprint, Points, Epic, Owner, MoSCoW, Support, Depends on, Requirement; checks Status options | yes |
| `04_issues.sh` | 73 issues; then `Depends on` linked as `#number`; then assignees | yes |
| `05_project_items.sh` | add issues to the project, set all field values; create views | yes |
| `export_board.sh` | `docs/sprints/board-snapshot-YYYY-MM-DD.csv` | no (local file only) |

Every script accepts `--dry-run`, which reads GitHub and prints what it would do without writing.

```bash
scripts/github/00_run_all.sh --dry-run   # preview
scripts/github/00_run_all.sh             # run
python3 scripts/github/board_setup.py verify   # reconciliation table, read-only
```

## Idempotency and resuming

- Every step reads what exists first and only creates what is missing.
- Issues are matched by their `[E#-##]` title prefix, so re-running never creates duplicates.
- Field values are set to the CSV value each time; re-running restores them if someone changed them by hand. Run `verify` first if you want to keep manual changes.
- Nothing is ever deleted or renamed.
- If a run stops (network, rate limit), run the same script again. It continues where it stopped.
- Writes are throttled (`GH_SLEEP`, default 1 second) and retried with exponential backoff on rate-limit or server errors.

## Files

| File | Committed | Purpose |
|------|-----------|---------|
| `board_setup.py` | yes | All logic |
| `project-readme.md` | yes | The project README text |
| `issue-map.json` | yes | Story ID to issue number |
| `setup.log` | no (git-ignored) | Log of every action |

## Assignees

Usernames: Kweku `kaanyen`, Nana Yaw `Korantengnator`, Chelsea `Chelsea-Owusu-Pokuaah`, Micheal `Michael-Sylvester`. Only users who can be assigned in the repo are assigned. After someone accepts their repo invite, run `python3 scripts/github/board_setup.py assign`.

## Limits

- The template fields **Priority**, **Start date** and **Target date** are org-wide *issue fields*, not project fields. The project API cannot change them. MoSCoW priority lives in its own project field, `MoSCoW`. Sprint dates are written to the org date fields on each issue with the GraphQL `setIssueFieldValue` mutation. The org Priority options (Urgent, High, Medium, Low) are left alone.

- `gh` cannot set several fields per call, so field values use batched GraphQL `updateProjectV2ItemFieldValue` mutations, one request per item.
- Views are created with name, layout and filter only. Grouping, sorting and sums are set by hand: see `docs/process/github-board-views.md`.
