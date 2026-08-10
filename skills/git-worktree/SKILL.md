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
- Isolation is BY DIRECTORY, not by branch: the worktree directory
  `~/worktrees/<repo>-<slug>` derives the identity (`-<slug>` suffix, own
  compose project/containers, own master port). A worktree may host any
  purpose — feat/test/hotfix/... — the branch name is only a purpose label.
- Worktrees are experimental checkouts: CD targets stay blocked there even
  after production promotion (ADR 0009 gate).

## Workflow A — Create a feature worktree

```bash
BASE=$(git -C <repo> rev-parse --abbrev-ref HEAD)
git -C <repo> worktree add ~/worktrees/<repo>-<slug> -b <purpose>/<slug> "$BASE"
git -C <repo> worktree list
```

- `<purpose>` matches the worktree's intent: `feat/` (feature), `test/`
  (experiment/validation), `hotfix/`, `chore/`, etc. Choose it, do not
  default silently to `feat/` when the user's intent is another purpose.
- If the branch already exists, omit `-b`. Do all development and commits
  inside the worktree directory.
- Inside the worktree, project tooling (compile sessions, compose stacks,
  test scripts) picks up isolation automatically via the directory-derived
  identity (`config.sh` -> `LX_WORKTREE_SUFFIX`/`LX_STACK_PORT`), so a bare
  `make compile` / `./start.sh` never collides with the main checkout.

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
git -C <repo> merge --ff-only <purpose>/<slug>
```

5. Cleanup the worktree and branch. Docker-compiled worktrees leave a root-owned
   `.artifacts/` (compiled inside containers), so plain `rm` fails with
   Permission denied — remove it with `sudo` first, then drop the worktree:

```bash
sudo rm -rf ~/worktrees/<repo>-<slug>/.artifacts
git -C <repo> worktree remove ~/worktrees/<repo>-<slug>
git -C <repo> branch -d <purpose>/<slug>
git -C <repo> worktree list
```

   (If `.artifacts/` is still non-empty and owned by root, `sudo rm -rf` the
   whole worktree path instead, then `worktree remove`.)

6. Recompile in the main checkout. The main repo's `.artifacts/{build,devel}`
   were produced from the pre-merge source; after the merge they are stale
   (changed package layout, renamed libraries). Refresh them with the project's
   source-only compile loop (e.g. `make compile` for lx-sdk projects) and only
   then is the main checkout's runtime/compile state consistent with the new
   HEAD. The deleted worktree artifacts cannot be reused — worktree and main
   artifacts are separate directories.

## Rules

- Never run `git push` or `git fetch` in this workflow.
- Do not checkout the feature branch in the main repo while it is checked out in a worktree.
- If `worktree remove` needs `--force` because of uncommitted changes, ask the user before proceeding.
- Verify the final state with `git worktree list`.
- `.artifacts/` (container-generated, root-owned) is never reusable across checkouts: removing a worktree needs `sudo`, and the main checkout must be recompiled after a merge.
