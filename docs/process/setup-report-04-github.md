# Setup report 04: GitHub labels, milestones, issues and board

- **Date:** 16 Oct 2026
- **Board:** https://github.com/orgs/ICS-Capstone-Team-6/projects/1 (org project, number 1, private)
- **Repo:** https://github.com/ICS-Capstone-Team-6/TriageLens (public)
- **Done by:** Claude Code, at Kweku's request, following Prompt 4 of the setup guide
- **Scripts:** `scripts/github/` (see its README). Log: `scripts/github/setup.log` (git-ignored).

## Starting state

| Item | State before setup |
|------|--------------------|
| Project | Titled "TriageLens", 0 items, already linked to the repo. Made from a template. |
| Fields | Built-ins, plus template fields: Status (Backlog, Ready, In progress, In review, Done), Priority, Size, Estimate, Start date, Target date |
| Views | Backlog, Priority board, Team items, Roadmap, My items |
| Labels | GitHub's 10 defaults only |
| Milestones, issues | None |

## What was created

| Item | Count | Detail |
|------|-------|--------|
| Labels | 29 | `priority:must/should/could`; 16 `epic:E0 ...` to `epic:E15 Stretch`; `type:story/spike/bug/docs/ml/safety/blocked`; `needs-decision`, `scope-change`, `cut-candidate` |
| Milestones | 5 | Sprint 0 to Sprint 4, due 23 Oct, 6 Nov, 20 Nov, 3 Dec, 18 Dec; description holds the goal, gate and exit criteria from the Sprint Plan |
| Project fields | 8 | Sprint, Points, Epic, Owner, MoSCoW (single select or number); Support, Depends on, Requirement (text) |
| Issues | 73 | `#1` to `#73`, titled `[E#-##] Story`. Map in `scripts/github/issue-map.json` |
| Dependency links | 51 | "Depends on" lines rewritten as `E1-03 (#9)` |
| Board items | 73 | Sprint, Points, MoSCoW, Epic, Owner, Support, Depends on, Requirement, Status = Backlog |
| Issue date fields | 63 | Org fields Start date and Target date set to the sprint start and end (icebox has none) |
| Views | 7 | Board, Sprint plan, By person, Roadmap by epic, Must only, Icebox, Blocked and decisions |
| Project settings | 1 | Description and README set. The title was kept as "TriageLens" (your decision). |

Type labels: `type:spike` for E4-01; `type:ml` for epics E1, E2, E3, E6, E7, E11; `type:safety` for E12; `type:docs` for E14; `type:story` for everything else. `cut-candidate` is on the nine stories in the Backlog 2.3 cut order.

## Reconciliation (output of `board_setup.py verify`)

```text
Sprint     CSV pts Board pts  CSV n  Issues On board
Sprint 0        16        16     11      11       11
Sprint 1        32        32     15      15       15
Sprint 2        32        32     12      12       12
Sprint 3        32        32     13      13       13
Sprint 4        32        32     12      12       12
Icebox          50        50     10      10       10

Issues: 73 / 73; board items from this repo: 73
No problems found.
```

Extra checks, run separately:

- No duplicate story IDs among the issues.
- 63 issues have Start date and Target date. The 10 icebox issues have none, as intended.
- Milestones hold 11, 15, 12, 13 and 12 open issues, which matches the Sprint Plan story counts.
- 29 labels exist. `cut-candidate` is on E10-02, E8-09, E9-04, E13-03, E6-03, E8-07, E10-01, E6-02 and E0-06.
- Assignees: `Korantengnator` 17, `kaanyen` 16, `Michael-Sylvester` 16. 24 issues are unassigned: Chelsea's 14 and the 10 icebox issues.

## Differences from the setup prompt, and why

1. **Board location.** This is the org project `ICS-Capstone-Team-6/projects/1`, not `kaanyen/projects/2`, so the board and the repo have the same owner.
2. **Priority.** The template's **Priority**, **Start date** and **Target date** are org-wide *issue fields*, not project fields, and the project API refused to change them ("Only custom fields can be updated"). You chose:
   - MoSCoW lives in a new project field, **MoSCoW**. The org Priority options (Urgent, High, Medium, Low) were not changed.
   - Sprint dates go into the org **Start date** and **Target date** on each issue, using the `setIssueFieldValue` mutation. So there are no separate "Start" and "Target" fields.
3. **Status.** It already had Backlog, Ready, In progress, In review and Done, so it was not changed.
4. **Field values.** `gh` 2.93 sets one field per call and only by ID. The script sends one batched GraphQL request per item instead (73 requests rather than about 750).
5. **Views.** The prompt said `gh` cannot create views. The GraphQL API can (`createProjectV2View`), but only with a name, layout and filter. Grouping, sorting and sums still need to be set by hand.
6. **Title.** It was kept as "TriageLens" (your decision).
7. **Two runs.** The first run stopped at its first label because `kaanyen` had read-only repo access. Nana Yaw then granted admin access. The second run stopped at the Priority field (point 2). The script was fixed and re-run, and steps that were already done were skipped.

## Gaps: manual actions

- [ ] **Chelsea's assignments.** Chelsea-Owusu-Pokuaah is not yet assignable (invite pending). Once she accepts, run `python3 scripts/github/board_setup.py assign`.
- [ ] **Finish the 7 new views** (group-by, sort, field sums, card fields): `docs/process/github-board-views.md`.
- [ ] **Optional:** remove or hide the template views and fields this board doesn't use (Priority board, Size, Estimate, and the org Priority field in tables). Nothing was deleted.
- [ ] **Optional:** turn on the project workflows "Item closed → Done" and "Pull request merged → Done".
- [ ] **Branch protection on `main`.** Proposed below, not applied.
- [ ] **Doc links.** The TRD and backlog links in each issue point to `main`, so they show "not found" until `chore/project-setup` is merged.

## Proposed branch protection (not applied)

This needs admin rights, which `kaanyen` now has. Proposed rule for `main` (Team Rules 6):

- Require a pull request before merging, with **1 approval**
- Dismiss stale approvals when new commits are pushed
- Require status checks to pass (add the CI job names once `.github/workflows/ci.yml` exists, Prompt 5)
- Block force pushes and deletions
- Optional: require conversation resolution

The command, for when you approve it:

```bash
gh api -X PUT repos/ICS-Capstone-Team-6/TriageLens/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": {"required_approving_review_count": 1, "dismiss_stale_reviews": true},
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
```

`required_status_checks` stays `null` until CI exists. Otherwise no pull request could merge.

## How to re-run or resume

```bash
scripts/github/00_run_all.sh --dry-run          # preview; changes nothing
scripts/github/00_run_all.sh                    # idempotent; creates only what is missing
python3 scripts/github/board_setup.py verify    # reconciliation table
python3 scripts/github/board_setup.py assign    # after Chelsea accepts her invite
scripts/github/export_board.sh                  # snapshot to docs/sprints/
```

Each step can also run on its own: `validate`, `project`, `labels`, `milestones`, `fields`, `issues`, `deps`, `assign`, `items`, `views`, `verify`, `export`.
