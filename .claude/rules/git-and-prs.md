# Git and pull requests

Source: Team Rules 4.2, 5.2, 6; CLAUDE.md workflow.

- Branch from main: `type/E8-05-short-name` (feat, fix, docs, test, chore, ml).
- Commits: `type: summary`.
- PR title `[E8-05] summary`; link the story; one purpose; about 400 lines at most.
- At least one review from a different person; reviews within one working day.
- CI must be green. Main is protected: no direct pushes, no force pushes.
- Never commit secrets, `.env` files, datasets, checkpoints or model binaries.
- New logic needs tests; a bug gets a test before the fix.
- Pin new dependencies and say why in the PR.
- Do not push or open a PR unless the user asks.
