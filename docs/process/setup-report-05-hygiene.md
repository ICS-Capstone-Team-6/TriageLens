# Setup report 05: repo hygiene, templates, CI and onboarding

- **Date:** 16 Oct 2026
- **Branch:** `chore/project-setup` (not pushed)
- **Done by:** Claude Code, at Kweku's request, following Prompt 5 of the setup guide
- **Source:** Team Rules (docs/planning/04), TRD 4.6, 7.3, 11.4, 13.2, 16

## What was created

| Area | Files |
|------|-------|
| Issue forms | `.github/ISSUE_TEMPLATE/story.yml`, `spike.yml`, `bug.yml`, `config.yml` (blank issues off; security and board links) |
| PR template | `.github/PULL_REQUEST_TEMPLATE.md`: story ID, what and why, how tested, Definition of Done, safety checklist, screenshots |
| Code owners | `.github/CODEOWNERS` with real usernames |
| CI | `.github/workflows/ci.yml`: four live jobs and nine TODO jobs (below) |
| Dependencies | `.github/dependabot.yml`: GitHub Actions, npm (`/`, `/apps/pwa`, `/packages/*`), pip (`/ml`), weekly |
| Wording lint | `scripts/check_wording.py` and `scripts/tests/test_check_wording.py` (10 tests) |
| Markdown lint | `.markdownlint-cli2.jsonc` |
| Root files | `CONTRIBUTING.md`, `SECURITY.md`, `.env.example`, `.editorconfig`, `LICENSE` (placeholder note, no licence chosen) |
| Process docs | `docs/process/onboarding.md`, `how-we-use-claude-code.md`, `definition-of-ready.md`, `definition-of-done.md`, `decision-log.md`, `risk-register.md` |

## CI jobs

| Job | State | What it runs |
|-----|-------|--------------|
| Docs link check | Live | `python scripts/check_links.py` |
| Markdown lint | Live | `markdownlint-cli2` on all `.md` except the frozen `docs/planning/` |
| Wording lint | Live | Unit tests for the lint and the SUS script, then `python scripts/check_wording.py` |
| Secret scan | Live | gitleaks 8.18.4 over the full history |
| Lint and type-check | TODO E0-02 | `if: false` until `apps/pwa` exists |
| Unit tests | TODO E0-02 | Vitest and pytest; 70% coverage on triage, sync, quality gate |
| Build | TODO E8-02 | |
| Bundle budget | TODO E13-03 | App shell at most 300 KB gzip |
| ONNX parity | TODO E5-03 | |
| Playwright offline e2e | TODO E13-02 | |
| Supabase RLS tests | TODO E9-01 | Added beyond the prompt's list, because RLS tests must pass in CI (E9-01) |
| Dependency scan | TODO E13-03 | |

## Checks run locally (16 Oct 2026)

| Check | Result |
|-------|--------|
| `python3 -m unittest discover -s scripts/tests` | 10 tests, OK |
| `python3 .claude/skills/usability-study-kit/test_sus.py` | 7 tests, OK |
| `python3 scripts/check_wording.py` | 0 UI files today, no forbidden wording |
| `python3 scripts/check_links.py` | All relative links resolve |
| `markdownlint-cli2@0.13.0` (the version in the CI action v16) | 0 errors |
| gitleaks 8.18.4 (Docker), full history and working tree | No leaks found |
| actionlint 1.7.1 (Docker) on `ci.yml` | No errors |
| YAML parse of the issue forms, Dependabot and CI files | All valid |

CI has not run on GitHub yet, because the branch is not pushed. The first push will be its first real run.

## How the wording lint works

- It scans `apps/pwa` and `packages/triage` only. It checks string literals and JSX/HTML text in source files, and every value in locale files (folders named `locales`, `i18n`, `strings`, `messages`, `lang`).
- Forbidden: diagnosis, positive, negative, healthy, "you do not have" (TRD 7.3), plus "no disease" (FR-05). Case-insensitive, whole words, and spacing inside the phrase does not matter.
- Allowlisted: Markdown and docs, tests (`*.test.*`, `*.spec.*`, `tests/`, `__tests__/`), JSON keys, identifiers such as `isNegative`, and comments. A line can be exempted with `wording-lint: allow <reason>` for strings users never see.

## Decisions made

1. **Two Markdown rules turned off.** MD034 (bare URLs) and MD036 (bold used as a label) are style-only and used throughout our docs. MD013 (line length) is also off, because tables and prose are not wrapped. The frozen `docs/planning/` folder is not linted, since it cannot be edited.
2. **Auto-fixed Markdown.** Blank lines were added around headings, lists and code blocks in `CLAUDE.md` (now 61 lines), the two agent files, and 6 code blocks got a `text` language. No wording changed.
3. **gitleaks as a CLI, not the GitHub Action.** The gitleaks Action needs a paid licence for organisation repos. The CLI does not.
4. **Decision-log owners.** The TRD names owners for D3, D4 and D6 in their defaults. D1 and D5 are assigned to the team lead, who decides scope (Team Rules 2). D2 is assigned to Nana Yaw, who owns the reference phone and benchmark harness (E5-01). Change them if you disagree.
5. **`.env.example` variable names** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are placeholders until E8-02 and E9-01. The file says so.

## Needs your action

- [ ] **Choose a licence.** `LICENSE` is a placeholder note. I did not choose one. Common choices for a student research project are MIT or Apache-2.0 for the code and CC BY 4.0 for the docs, but this is the team's decision, and the university may have rules.
- [ ] **Turn on private vulnerability reporting** (repo **Settings → Code security → Private vulnerability reporting**), so the link in `SECURITY.md` and the issue chooser works.
- [ ] **Chelsea's invite.** CODEOWNERS lists `@Chelsea-Owusu-Pokuaah` for `ml/`. GitHub flags an owner who is not a collaborator yet; the rule works once she accepts.
- [ ] **Required status checks.** Once CI has run on GitHub, add the four live job names to branch protection (see `setup-report-04-github.md`).
