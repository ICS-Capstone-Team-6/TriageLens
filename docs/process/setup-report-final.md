# Final setup report

- **Date:** 16 Oct 2026
- **Branch:** `chore/project-setup` (not pushed at time of writing)
- **Done by:** Claude Code, at Kweku's request, following Prompts 1 to 6 of the setup guide
- **Step reports:** [01 repo](setup-report-01-repo.md), [04 GitHub](setup-report-04-github.md), [05 hygiene](setup-report-05-hygiene.md). Prompts 2 and 3 are covered by [skills-and-agents.md](skills-and-agents.md) and [claude-code-setup.md](claude-code-setup.md).

## What exists and where

| Area | Where | Notes |
|------|-------|-------|
| Baseline planning docs | `docs/planning/` | TRD, Backlog, Sprint Plan, Team Rules, CSV. Frozen v1.0; the only change is the one-line baseline note |
| Figures | `docs/figures/` | architecture.png, roadmap.png |
| Living docs | `docs/adr/`, `docs/safety/`, `docs/ethics/`, `docs/model-cards/`, `docs/usability/`, `docs/sprints/`, `docs/runbook/` | ADR-1 to ADR-12, hazard log H1 to H12, intended use, IRB checklist, consent draft, model card template, usability plan, sprint files 0 to 4 |
| Process docs | `docs/process/` | Onboarding, Claude Code usage and setup, skills and agents, DoR, DoD, decision log, risk register, board views, setup reports |
| Docs index | `docs/README.md` | Every document with owner and update rule |
| Monorepo scaffold | `apps/pwa/`, `packages/triage/`, `packages/quality/`, `ml/`, `ml/manifests/`, `supabase/`, `scripts/` | README in each; no application code yet |
| Claude Code context | `CLAUDE.md` (63 lines), `docs/ai-context.md` (106 lines), `.claude/rules/` (6 files) | `CLAUDE.local.md` is git-ignored |
| Skills | `.claude/skills/` | 9 skills: 7 automatic, 2 manual (`/sprint-ops`, `/board-sync`) |
| Agents | `.claude/agents/` | `safety-reviewer`, `ml-auditor` (read-only) |
| Auto memory | `~/.claude/projects/-Users-kanyen-dev-capstone-TriageLens/memory/` (Kweku's machine only) | team-roster, project-board-location, baseline-plan, open-decisions |
| GitHub issues | 73 issues, `#1` to `#73` | Map: `scripts/github/issue-map.json` |
| GitHub board | https://github.com/orgs/ICS-Capstone-Team-6/projects/1 | 73 items, 8 custom fields, 7 new views |
| Board automation | `scripts/github/` | Idempotent setup, verify, export |
| Repo hygiene | `.github/` (issue forms, PR template, CODEOWNERS, CI, Dependabot), `CONTRIBUTING.md`, `SECURITY.md`, `.env.example`, `.editorconfig`, `LICENSE` (placeholder), `.gitignore`, `.markdownlint-cli2.jsonc` | |
| Checks | `scripts/check_links.py`, `scripts/check_wording.py`, `scripts/tests/` | Run in CI |
| First board snapshot | `docs/sprints/board-snapshot-2026-10-16.csv` | From `/board-sync export` logic |

## Checks and results (run 16 Oct 2026)

### 1. Docs

| Check | Result |
|-------|--------|
| `python3 scripts/check_links.py` | PASS: 149 relative links in 54 files resolve |
| Every target in `docs/README.md` exists; every file in `docs/` is indexed | PASS: 55 targets, none missing, none unindexed |
| Baseline note at the top of all 4 planning docs | PASS |
| Planning docs unchanged apart from the note | PASS: `git diff 802f33a HEAD -- docs/planning` shows only the 4 notes (plus the new folder README) |
| Figures are valid images | PASS: both are PNG files (2720 x 1920 and 2200 x 920). Relative paths resolve from `docs/planning/`. The Markdown preview was not opened in a browser. |

### 2. Numbers

| Check | Expected | Result |
|-------|----------|--------|
| Stories plus icebox rows | 63 + 10 | PASS: 63 + 10 |
| Committed points | 144 (16, 32, 32, 32, 32) | PASS |
| Must and Should | 121 and 23 | PASS |
| Icebox points | 50 | PASS |

### 3. Claude Code context

| Check | Result |
|-------|--------|
| `CLAUDE.md` under 120 lines | PASS: 63 |
| `docs/ai-context.md` under 120 lines | PASS: 106 |
| `@` imports resolve | PASS: one import, `@docs/ai-context.md`, exists |
| Memory seeds | PASS: 4 memory files plus the `MEMORY.md` index exist. `/memory` is interactive; Kweku should run it to see them. |
| `/doctor prompt-audit` | NOT RUN: it is an interactive command (available in v2.1.301). A manual audit found one outdated instruction (the `CLAUDE.md` command list lacked the wording lint and tests); fixed. |
| Conflicts | One deliberate refinement: `CLAUDE.md` branch names `type/E8-05-short-name` narrow Team Rules `type/short-description`. Not a contradiction. |

### 4. Skills and agents

| Check | Result |
|-------|--------|
| Valid front matter | PASS: all 9 skills, 2 agents and 5 path-scoped rules parse as YAML with the expected keys; `git-and-prs.md` has no front matter by design |
| Sizes | PASS: every `SKILL.md` is 58 to 82 lines (limit 150); rules 13 to 25 lines |
| `/board-sync export` | PASS: wrote `docs/sprints/board-snapshot-2026-10-16.csv` (73 rows) with `export_board.sh` logic |
| `/sprint-ops status` (read-only simulation) | PASS: Sprint 0 is 4 points per person, 16 total; nobody over cap; no WIP over 2 |
| Descriptions would not trigger on unrelated work | Reviewed by reading. Path-scoped skills only load for their folders; the two process skills are manual only. |

The two manual skills set `disable-model-invocation: true`, so only a person can call them. Their logic was exercised through the same `gh` and script calls they use.

### 5. GitHub

| Check | Result |
|-------|--------|
| 73 issues, no duplicates | PASS |
| Milestones Sprint 0 to 4 with due dates | PASS: 23 Oct, 6 Nov, 20 Nov, 3 Dec, 18 Dec |
| Labels | PASS: 29 created (priority, epic, type, process) |
| Project fields | PASS: Sprint, Points, Epic, Owner, MoSCoW, Support, Depends on, Requirement; Status already had the right options |
| Every issue on the board with Sprint, Points, MoSCoW, Epic and Owner set | PASS (`board_setup.py verify`: no problems) |
| Project linked to the repo | PASS |

Reconciliation:

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

### 6. Process

| Check | Result |
|-------|--------|
| Templates exist | PASS: 3 issue forms, chooser config, PR template, CODEOWNERS, Dependabot. All YAML parses. GitHub rendering is checked after the first push. |
| CI skeleton passes on an empty codebase | PASS locally: link check, markdownlint 0 errors, 17 unit tests OK, wording lint clean, gitleaks no leaks, actionlint clean. Not yet run on GitHub. |
| `.gitignore` blocks datasets, binaries, secrets, `CLAUDE.local.md` | PASS: `ml/data/`, `ml/runs/`, `ml/checkpoints/`, `*.onnx`, `*.pt`, `.env`, `.env.local`, `CLAUDE.local.md`, `setup.log`, `node_modules` all ignored. `.env.example` and `test-fixtures/*.onnx` are allowed on purpose. |
| No secrets in repo or branch history | PASS: gitleaks 8.18.4 over all commits and the working tree |
| No real patient data | PASS: the only binary files in the whole history are the two figure PNGs. No DICOM, image sets, arrays or model files. A pattern scan for Ghana phone numbers, Ghana Card IDs, "date of birth" and "patient name" outside the baseline found nothing. |

## Manual to-do list

- [ ] **Push and open the PR** for `chore/project-setup`, then merge after one review. The issue links to docs on `main` work only after the merge.
- [ ] **Branch protection on `main`**: the command is in [setup-report-04-github.md](setup-report-04-github.md). After the first CI run, add the four live checks as required status checks.
- [ ] **Chelsea**: accept the repo invite, then run `python3 scripts/github/board_setup.py assign` (assigns her 14 issues). CODEOWNERS for `ml/` takes effect then.
- [ ] **Project views**: finish grouping, sorting and sums by hand ([github-board-views.md](github-board-views.md)).
- [ ] **Optional board tidy-up**: hide template views and fields this board does not use (Priority board view; Size, Estimate and the org Priority field). Turn on the workflows "Item closed → Done" and "PR merged → Done".
- [ ] **Licence**: choose one and replace `LICENSE`.
- [ ] **Private vulnerability reporting**: turn it on in repo Settings → Code security.
- [ ] **Decisions D1 to D6**: answer by 23 Oct or the defaults apply ([decision-log.md](decision-log.md)). Tell Claude Code each answer so its memory stays current. D2 (reference phone) updates several skills that say "TBD, see D2".
- [ ] **Consent template**: fill in the session length and contacts; get Ashesi IRB review before any session.
- [ ] **Sign the Team Rules** (section 14) as part of E0-03.
- [ ] **Run `/memory` and `/doctor prompt-audit`** in Claude Code to confirm the memory seeds and get a second opinion on the instructions.
- [ ] **Restart Claude Code** in the repo so `CLAUDE.md`, the rules and the skills load fresh.

## Known limitations

- **CI has not run on GitHub.** Everything was run locally with the same tool versions. The first push is the real test.
- **GitHub API limits.** `gh` cannot set several project fields at once or configure view grouping. The scripts use GraphQL for field values and view creation; grouping, sorting and sums are manual.
- **Org issue fields.** The template's Priority, Start date and Target date are org-wide issue fields. MoSCoW therefore has its own field. Sprint dates are written on each issue. A future template change at the org level could affect those two date fields.
- **Board fields are overwritten on re-run.** `00_run_all.sh` resets field values to the CSV. Run `verify` first if people have changed the board by hand.
- **Memory is per machine.** The auto-memory seeds exist only on Kweku's machine. Shared facts belong in the repo.
- **Skill trigger quality** was reviewed by reading, not measured.
- **The "Start here" section** sits under the project summary and intended-use notice, not above them, so the disclaimer stays first.

## Re-run commands

```bash
# Docs and checks (same as CI)
python3 scripts/check_links.py
python3 scripts/check_wording.py
python3 -m unittest discover -s scripts/tests
python3 .claude/skills/usability-study-kit/test_sus.py
npx markdownlint-cli2 "**/*.md"

# GitHub board (idempotent; add --dry-run to preview)
scripts/github/00_run_all.sh --dry-run
scripts/github/00_run_all.sh
scripts/github/01_labels.sh
scripts/github/02_milestones.sh
scripts/github/03_fields.sh
scripts/github/04_issues.sh
scripts/github/05_project_items.sh
python3 scripts/github/board_setup.py verify
python3 scripts/github/board_setup.py assign
scripts/github/export_board.sh
```
