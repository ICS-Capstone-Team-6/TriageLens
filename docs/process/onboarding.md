# Onboarding

For Chelsea, Nana Yaw and Micheal (and anyone who joins later). It takes about an hour. Ask in the team chat if anything here does not work. That is how we find gaps.

## 1. Accounts and access

- [ ] GitHub account with **two-factor sign-in** on (Team Rules 8.8). Use a password manager.
- [ ] Accept the invite to the `ICS-Capstone-Team-6` organisation and the `TriageLens` repository. (Chelsea: your invite is needed before issues can be assigned to you.)
- [ ] Open the [board](https://github.com/orgs/ICS-Capstone-Team-6/projects/1).
- [ ] Full-disk encryption on any laptop that will hold datasets (Team Rules 8.4).

## 2. Install tools

- [ ] Git
- [ ] GitHub CLI `gh` (version 2.93 or newer): https://cli.github.com
- [ ] Python 3.11 (TRD 10.4). Python 3.9 or newer is enough for the repo scripts.
- [ ] Node.js 22 LTS. Needed once the app exists (E8-02).
- [ ] Claude Code: https://code.claude.com/docs

## 3. Sign in and clone

```bash
gh auth login                          # choose GitHub.com, HTTPS, browser sign-in
gh auth refresh -s project -s repo     # adds board and repo permissions
gh repo clone ICS-Capstone-Team-6/TriageLens
cd TriageLens
python3 scripts/check_links.py         # should print "All relative links resolve."
```

App, ML and database setup commands are added to the README as their stories land (E8-02, E2-01, E9-01).

## 4. Open the repo in Claude Code

```bash
claude                 # from the repo root
```

What Claude Code gets automatically:

- **`CLAUDE.md`** plus **`docs/ai-context.md`**: the project summary, the 8 non-negotiable rules, and key facts with their sources. Loaded every session.
- **Scoped rules** in `.claude/rules/`: for example, the safety wording rules load when you edit `apps/pwa` or `packages/triage`.
- **Skills** in `.claude/skills/`: checklists that load when relevant, such as `ml-experiment-protocol` when you work in `ml/`. Two are manual: `/sprint-ops` and `/board-sync`.
- **Agents**: `safety-reviewer` and `ml-auditor`. These are read-only reviewers you can ask for by name.

Full details: [claude-code-setup.md](claude-code-setup.md), [skills-and-agents.md](skills-and-agents.md), and the rules for using it: [how-we-use-claude-code.md](how-we-use-claude-code.md).

## 5. Read (30 minutes)

1. [Team Rules](../planning/04_Team_Rules_and_Requirements.md), the whole thing. It is short on purpose.
2. [TRD](../planning/01_TRD.md) sections 2, 3, 7.2 and 7.3, and your own area (ML: 9; app: 10.5; backend: 10.7 and 11).
3. Your stories in the [Sprint Plan](../planning/03_Sprint_Plan.md).

Then sign the Team Rules (section 14) as part of E0-03.

## 6. Pick a story and ship it

1. On the board, open the **Board** view (current sprint). Pick a **Ready** story you own. Keep at most 2 In progress.
2. Move it to **In progress**.
3. Branch: `git switch -c feat/E8-05-result-screen`
4. Work in small commits: `feat: ...`, `fix: ...`, `docs: ...`, `ml: ...`.
5. Push and open a PR titled `[E8-05] summary` with `Closes #NN`. Fill in the template, including the safety checklist.
6. Move the card to **In review**. Ask your supporter (the Support field) to review.
7. When CI is green and one reviewer approves, merge. Show the result in the preview build to Micheal. The card moves to **Done**.

Details: [CONTRIBUTING.md](../../CONTRIBUTING.md), [Definition of Ready](definition-of-ready.md), [Definition of Done](definition-of-done.md).

## 7. Asking for help

- Stuck for **half a day**? Say so in the team chat. Asking early is the rule, not a weakness (Team Rules 3).
- Blocked for more than **one working day**: tell Micheal. A blocker that threatens a gate goes to Kweku the same day (Sprint Plan 5).
- Pairing is planned work: a 60-minute session counts toward points, and the less experienced person drives (Team Rules 4.3).
- Health data or a secret shared by mistake, or a lost device: tell Kweku **immediately** (Team Rules 8.3, 8.9).

## 8. Weekly rhythm (Sprint Plan 2, Team Rules 4.1)

| When | What | Length |
|------|------|--------|
| First Monday of the sprint | Sprint planning | 45 min (30 in Sprint 0) |
| Every working day by 10:00 | Async check-in in the team chat: done, next, blocked | 3 lines |
| Tuesday and Thursday | Live sync | 15 min |
| Wednesday of week 1 | Backlog refinement | 30 min |
| Last Friday of the sprint | Sprint review and demo, then retro and health check | 30 + 30 min |

Meetings are capped at about 2.5 hours per person per week. Everything else is async.

## 9. Workload rule (Team Rules 3)

- You commit to at most **8 points per two-week sprint** (4 in Sprint 0), about 10 hours a week.
- **No weekend work is expected**, and no replies are expected between 20:00 and 08:00.
- At every retro you rate your workload from **1** (too light) to **5** (too heavy). **A 4 or 5 triggers a change** in the next sprint, such as moving your Should stories out. If we fall behind, we cut; we do not stretch.
- Put exam and assignment dates on the shared calendar in Sprint 0 (decision D6).
