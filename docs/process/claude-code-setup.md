# How Claude Code is set up in this repo

This page explains what Claude Code reads, when it reads it, and who updates each part. Behaviour was checked against the Claude Code memory documentation (https://code.claude.com/docs/en/memory) on 16 Oct 2026.

## What loads every session

| File | What it holds | Size rule |
|------|---------------|-----------|
| [`CLAUDE.md`](../../CLAUDE.md) | Summary, repo map, commands, the 8 non-negotiable rules, workflow, current sprint, where to read more | Under 120 lines |
| [`docs/ai-context.md`](../ai-context.md) | Digest of the baseline: intended use, zones, metrics, budgets, ADRs, model interfaces, data rules, roles, calendar, cut order, open decisions. Every fact is cited. | Under 120 lines |
| `CLAUDE.local.md` | Your personal preferences. Git-ignored, so only you see it. | Keep it short |
| Rules without `paths` | `.claude/rules/git-and-prs.md` | Under 25 lines |

`docs/ai-context.md` is the only file imported with `@`. Imported files load at launch and cost context in every session, so it stays short.

## What loads on demand

| Kind | Where | When it loads |
|------|-------|---------------|
| Scoped rules | `.claude/rules/*.md` with `paths:` | When Claude reads or edits a matching file |
| Auto skills | `.claude/skills/*` | When Claude judges them relevant; skills with `paths` only for matching files |
| Planning documents | `docs/planning/*` | Only when Claude opens them. They are long, so they are never imported. |
| Other docs | `docs/**` | When opened |

Scoped rules:

| Rule | Paths |
|------|-------|
| `safety-wording.md` | `apps/pwa/**`, `packages/triage/**` |
| `ml-discipline.md` | `ml/**` |
| `pwa-offline.md` | `apps/pwa/**` |
| `supabase.md` | `supabase/**` |
| `docs.md` | `docs/**` |
| `git-and-prs.md` | none (always loaded) |

## What is manual

`/sprint-ops` and `/board-sync` run only when someone types them. See [skills-and-agents.md](skills-and-agents.md). The `safety-reviewer` and `ml-auditor` agents run when you ask for them by name.

## Auto memory vs CLAUDE.md

- **CLAUDE.md, rules and skills** are written by the team, reviewed in pull requests, and shared through git. Everyone gets the same instructions.
- **Auto memory** holds notes Claude writes for itself on one person's machine (`~/.claude/projects/<project>/memory/`). It is not shared and not reviewed. Run `/memory` to see or edit it.
- Use memory only for facts that change and are not yet in the repo, such as answers to decisions D1 to D6, the chosen reference phone, and teammates' GitHub usernames. Once a fact is decided, put it in the repo (decision log, ADR or `ai-context.md`) so the whole team gets it.

## Rules for updating each part

| Part | Who | When | How |
|------|-----|------|-----|
| `CLAUDE.md` "Current sprint" line | Micheal | Start of each sprint | `/sprint-ops start N`, then a PR |
| Rest of `CLAUDE.md` | Kweku | When workflow or commands change (replace each TODO as its story lands) | PR with one review |
| `docs/ai-context.md` | Kweku | Only after an ADR changes a baseline fact, or a decision D1 to D6 is answered | PR citing the ADR or decision |
| `.claude/rules/*` | Owner of that area (see each skill's owner) | When a rule in the source docs changes | PR; keep each rule under 40 lines |
| `.claude/skills/*`, `.claude/agents/*` | Owner listed in skills-and-agents.md | When a procedure changes | PR; keep SKILL.md under 150 lines |
| `CLAUDE.local.md` | You | Any time | Not committed |
| Auto memory | Claude, at your request | When you tell it a fact worth keeping | `/memory` to review |

Run `/doctor prompt-audit` after larger changes to find conflicting or outdated instructions.
