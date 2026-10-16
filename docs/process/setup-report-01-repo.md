# Setup report 01: repository and documents

- **Date:** 16 Oct 2026
- **Branch:** `chore/project-setup` (not pushed)
- **Done by:** Claude Code, at Kweku's request, following Prompt 1 of the setup guide

## Starting state

- `main` had one commit (`5997f74 Initial commit`) containing only a two-line `README.md`.
- The extracted files were untracked: four planning documents and the CSV in `docs/`, and two figures in `figures/`. There were no PDFs.

## What moved

| From | To |
|------|----|
| `docs/01_TRD.md` | `docs/planning/01_TRD.md` |
| `docs/02_Product_Backlog.md` | `docs/planning/02_Product_Backlog.md` |
| `docs/03_Sprint_Plan.md` | `docs/planning/03_Sprint_Plan.md` |
| `docs/04_Team_Rules_and_Requirements.md` | `docs/planning/04_Team_Rules_and_Requirements.md` |
| `docs/product_backlog.csv` | `docs/planning/product_backlog.csv` |
| `figures/architecture.png` | `docs/figures/architecture.png` |
| `figures/roadmap.png` | `docs/figures/roadmap.png` |

The empty top-level `figures/` folder was removed.

## What changed in the planning documents

There was only one change. The baseline note was added directly under the YAML front matter of each of the four `.md` documents. No other wording or numbers changed.

No link fixes were needed. The TRD and Sprint Plan link to `../figures/...`. From `docs/planning/` that path resolves to `docs/figures/`, which is where the figures now are.

## What was created

| Area | Files |
|------|-------|
| Root | `README.md` (rewritten), `.gitignore` |
| Folder READMEs | `docs/{planning,figures,adr,safety,ethics,model-cards,benchmarks,usability,sprints,runbook,process}/README.md`, `apps/pwa/`, `packages/triage/`, `packages/quality/`, `ml/`, `ml/manifests/`, `supabase/`, `scripts/`, `scripts/github/` |
| Placeholders | `.gitkeep` in `apps/pwa`, `packages/triage`, `packages/quality`, `ml`, `ml/manifests`, `supabase` |
| Docs index | `docs/README.md` |
| ADRs | `docs/adr/0000-template.md`, and `0001` to `0012`, one per row of TRD 10.3, status "Accepted (baseline)" |
| Safety | `docs/safety/intended-use.md` (TRD 3.3), `docs/safety/hazard-log.md` (H1 to H12 from TRD 12.2) |
| Ethics | `docs/ethics/irb-checklist.md` (TRD 12.3), `docs/ethics/consent-template.md` (draft, needs Ashesi IRB review) |
| ML | `docs/model-cards/TEMPLATE.md` |
| Usability | `docs/usability/test-plan.md` (TRD 13.4) |
| Sprints | `docs/sprints/sprint-00.md` to `sprint-04.md` (from Sprint Plan 3 and 4) |
| Runbook | `docs/runbook/README.md` (placeholders) |
| Scripts | `scripts/check_links.py` |
| Report | this file |

## Link check result

```text
$ python3 scripts/check_links.py
Checked 104 relative links in 42 files.
All relative links resolve.
```

The checker also catches broken links. A test file with one missing page and one missing image was reported as 2 broken, and the checker exited with code 1. It skips links inside code blocks, as well as `http(s)`, `mailto` and `#anchor` links. It does not check that a heading anchor exists.

## Decisions made

1. **`mv` instead of `git mv`.** The extracted files had never been committed, so there was no history to keep. Committing them in their new place gives the same result.
2. **Generated, not retyped.** The ADRs, the hazard log and the sprint files were built by parsing the TRD and Sprint Plan tables. This keeps the wording exactly the same as the baseline.
3. **ADR "Consequences" sections.** TRD 10.3 has no consequences column. Each ADR says "Not stated separately in the baseline" instead of making them up.
4. **Hazard log "Sprint to close" is left blank.** TRD 12.2 only says the log is closed or accepted in Sprint 4 (E12-04). Each owner fills in the sprint for their hazard.
5. **Model cards live in `docs/model-cards/`.** TRD 14.1 lists model cards under `ml/manifests/`, but this setup's target tree puts them in `docs/`. The `ml/manifests/README.md` notes the difference.
6. **Consent template wording.** Only the plain-language wording is new. The facts come from TRD 12.3 and Team Rules 8.6. The session length and the contact details are marked TODO.
7. **`.gitignore` exceptions.** `.onnx` and `.pt` files are allowed only under a `test-fixtures/` folder.

## Open questions

1. **Project board location (resolved 16 Oct 2026).** The board is the organisation project https://github.com/orgs/ICS-Capstone-Team-6/projects/1 (owner `ICS-Capstone-Team-6`, number 1). It replaces the user project `kaanyen/projects/2` that the setup guide names, so it has the same owner as the repo.
2. **`gh` token scope.** The token has no `project` scope. Run `gh auth refresh -s project -s repo` before Prompt 4.
3. **Public repository.** The repo is public. That fits a capstone, but it makes rule 3 (no real data, no secrets) more important, and any dataset-derived file must stay out.
4. **Sprint 3 end date.** The Sprint Plan gives Mon 23 Nov to Fri 4 Dec, with 4 Dec expected to be a public holiday and G3 on Thu 3 Dec. Prompt 4 uses 3 Dec as the milestone due date. Please confirm the holiday (Sprint Plan 1.1).
5. **Ethics contacts.** The consent template needs the team contact and the Ashesi IRB contact.
