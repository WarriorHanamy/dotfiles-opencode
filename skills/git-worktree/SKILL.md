---
name: git-worktree
description: Create and merge git worktrees under ~/worktrees/, all local, never push. Use when user wants a feature worktree, isolated parallel development, mentions "worktree", or asks to merge a worktree branch back locally without pushing to remote.
---

# Git Worktree

Local feature worktrees and local-only merge back to the main checkout.

## Conventions

- Worktree path: `~/worktrees/<repo>-<kebab-slug>` (sibling directory, never inside the repo).
- Base branch defaults to the current branch of the main checkout when the worktree is created (e.g., `develop`).
- All commits stay local; never push to any remote.

## Workflow A — Create a feature worktree

```bash
BASE=$(git -C <repo> rev-parse --abbrev-ref HEAD)
git -C <repo> worktree add ~/worktrees/<repo>-<slug> -b feat/<slug> "$BASE"
git -C <repo> worktree list
```

If the branch already exists, omit `-b`. Do all feature development and commits inside the worktree directory.

## Workflow B — Merge back locally (no push)

1. Ensure the worktree is clean:

```bash
git -C ~/worktrees/<repo>-<slug> status --porcelain
```

If there are changes, commit them first. Do not push.

2. Rebase the feature branch onto the base branch:

```bash
git -C ~/worktrees/<repo>-<slug> rebase <base>
```

3. Handle rebase conflicts:

- Stop and analyze both sides semantically. Most conflicts come from orthogonal requirements; keep changes from both sides when they are independent.
- Only ask the user when the same logic is changed in two genuinely contradictory ways.
- After resolving: `git add -A && git -C ~/worktrees/<repo>-<slug> rebase --continue`.

4. Fast-forward merge in the main checkout:

```bash
git -C <repo> merge --ff-only feat/<slug>
```

5. Cleanup the worktree and branch:

```bash
git -C <repo> worktree remove ~/worktrees/<repo>-<slug>
git -C <repo> branch -d feat/<slug>
git -C <repo> worktree list
```

## Rules

- Never run `git push` or `git fetch` in this workflow.
- Do not checkout the feature branch in the main repo while it is checked out in a worktree.
- If `worktree remove` needs `--force` because of uncommitted changes, ask the user before proceeding.
- Verify the final state with `git worktree list`.
