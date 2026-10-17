# How we use Claude Code

Claude Code is a teammate's tool, not a teammate. **You** own every line you merge. Setup details: [claude-code-setup.md](claude-code-setup.md). Skills and agents: [skills-and-agents.md](skills-and-agents.md).

## When to use plan mode

Use **plan mode** (Shift+Tab until it shows "plan", or `claude --permission-mode plan`) when:

- the change touches result screens, triage rules, thresholds, consent or the database schema;
- the change spans more than one package, or will be over about 200 lines;
- you are not sure of the approach (it is then a spike; time-box it to one day).

Read the plan, push back, and approve only what you understand.

## Cite the story in every prompt

Start prompts with the story ID and what "done" means:

> Working on E8-05 (#33). Acceptance criteria are in the issue. Build the result screen's zone banner. Follow the triage-safety-review checklist.

This lets Claude find the acceptance criteria, dependencies and the right skill. Name the TRD section when it matters ("thresholds per TRD 7.2").

## Which commands to use

| Need | Use |
|------|-----|
| Start of sprint, mid-sprint status, review, retro | `/sprint-ops start N`, `/sprint-ops status`, `/sprint-ops review N`, `/sprint-ops retro N` |
| Board snapshot, compare CSV and board, add or move a story | `/board-sync export`, `reconcile`, `add`, `move` |
| Review a result-screen or triage change | "Use the safety-reviewer agent on this branch" |
| Review an experiment before freezing a model | "Use the ml-auditor agent on ml/runs/..." |
| Find conflicting instructions | `/doctor prompt-audit` |
| See what Claude remembers | `/memory` |

## Never paste into a prompt

- **Real patient data** of any kind: images, case records, names, phone numbers, IDs (Team Rules 8).
- **Secrets**: API keys, Supabase service keys, signing keys, tokens, passwords.
- **Usability participant details**: names, recordings, signed forms.
- **Dataset files** whose licence forbids sharing them with a third-party service. Check the licence register (E1-01) first.

Use fake or public sample data. If something sensitive goes into a prompt by mistake, tell Kweku (Team Rules 8.3).

## Reviewing AI-written code

- **Tests are required.** AI-written logic gets the same test bar as yours: new behaviour has tests, and triage, sync and the quality gate need 70% coverage. Read the tests. Check that they would fail if the code were wrong.
- **Run it.** Do not merge code you have not run or seen pass in CI.
- **Safety changes** (result screens, triage rules, thresholds, wording, consent, age gate): run the `safety-reviewer` agent and fix every blocker. A human reviewer still approves.
- **ML changes:** run `ml-auditor` before any freeze. Check that the run log has config, seed, commit and data hash.
- **Check claims.** If Claude states a metric, threshold, dataset licence or clinical fact, verify it against the TRD or the source. It must say what it could not verify.
- **Dependencies:** question every new package Claude adds (Team Rules 6).
- Mark AI-assisted PRs in the description ("written with Claude Code") so reviewers know to look closely.

## Planning documents are frozen

`docs/planning/` is baseline v1.0. Do not let Claude edit it. To change a requirement, ask Claude to draft an **ADR** in `docs/adr/` and a row for the Team Rules change log (the `docs-adr-modelcard` skill knows the steps). The team agrees, then the PR merges.

## Keeping Claude's context current

- When a decision D1 to D6 is made, update [decision-log.md](decision-log.md) and tell Claude: "remember that D2 is answered: the reference phone is ...".
- At each sprint start, `/sprint-ops start N` updates the current sprint in `CLAUDE.md`.
- Personal preferences go in `CLAUDE.local.md`, which is git-ignored.
