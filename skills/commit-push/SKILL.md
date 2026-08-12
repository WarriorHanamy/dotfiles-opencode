---
name: commit-push
description: Stage, commit with conventional commit message, and push to origin. Also handles tagged releases (creates GitLab Release via glab). Use when user says "commit and push", "push", "/commit", "commit push", "提交并推送", or "release as vX.Y.Z".
---

# Commit and Push

Stage all changes, commit with a conventional commit message, and push to origin. Also handles annotated tags and GitLab Releases when requested.

## Workflow

### 1. Scan changes

```bash
git status && git diff HEAD && git diff --staged
```

If no changes exist, report and stop.

### 2. Submodule hygiene check

Before committing, detect submodule problems. Run these checks in parallel:

```bash
# List submodules with uncommitted changes (modified/untracked inside them)
git submodule foreach --quiet \
  'if [ -n "$(git status --porcelain)" ]; then echo "DIRTY (uncommitted): $sm_path"; fi'

# Detect staged submodule pointers that reference dirty commits
git diff --cached --submodule=diff | grep '\-dirty' || true

# Detect unstaged submodule pointers that reference dirty commits
git diff HEAD --submodule=diff | grep '\-dirty' || true
```

**If any submodule is dirty or a `-dirty` reference exists → ABORT.**  
Report the offending submodules to the user and ask:

1. "Commit submodule changes first?" – user provides a message, commit inside each dirty submodule, then retry hygiene check
2. "Skip and force?" – not recommended, but proceed if user insists

**Never auto-commit submodule changes.** The user must explicitly approve.

### 3. Branch decision

Create a new branch with `git checkout -b <kebab-case-name>` only when the user explicitly requests it ("new branch", "新分支", "开分支", etc.). The branch name is derived from the commit subject in kebab-case.

Otherwise, commit on the current branch.

### 4. Generate commit message

Conventional Commits format:

```
<type>: <imperative subject, ≤50 chars, no period>

<plain prose paragraph describing the problem, what the change
does, and any non-obvious tradeoffs. No section headers, no
checklists, no structured templates. Reads like a short paragraph
to a colleague.>

Fixes #<number>
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`, `perf`, `ci`, `build`.

Do not hard-wrap the body. GitHub renders it, so let each sentence flow on one line.

`Fixes #<number>` goes at the end of the body only when applicable. Omit the "Fixes" line when there is no associated issue.

### 5. Commit and push

Use a single message with parallel tool calls:

```
git add -A
git commit -F- <<'EOF'
<commit-message>
EOF
git push -u origin <branch>
```

### 6. Gitlab remote sync

Only if the remote `gitlab` exists. Fetch first, then compare ahead/behind to decide:

```
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if ! git remote | grep -q '^gitlab$'; then
  : # no gitlab remote, skip
elif git rev-parse --verify gitlab/$BRANCH >/dev/null 2>&1; then
  # remote branch exists — fetch and compare
  git fetch gitlab $BRANCH 2>/dev/null || git fetch gitlab 2>/dev/null
  COUNTS=$(git rev-list --left-right --count $BRANCH...gitlab/$BRANCH)
  AHEAD=$(echo "$COUNTS" | cut -f1)
  BEHIND=$(echo "$COUNTS" | cut -f2)

  if [ "$AHEAD" -gt 0 ] && [ "$BEHIND" -eq 0 ]; then
    # gitlab is behind — safe fast-forward push
    git push gitlab $BRANCH
  elif [ "$BEHIND" -gt 0 ] && [ "$AHEAD" -eq 0 ]; then
    echo "ERROR: gitlab/$BRANCH is ahead — pull/rebase first, then retry"
  elif [ "$BEHIND" -gt 0 ] && [ "$AHEAD" -gt 0 ]; then
    echo "ERROR: gitlab/$BRANCH diverged — pull/rebase first, then retry"
  else
    echo "gitlab/$BRANCH already in sync"
  fi
else
  # new branch — first push with -u
  git push -u gitlab $BRANCH
fi
```

### 6b. GitLab host & authentication (tested 2026-08)

Internal GitLab runs at `192.168.20.89:8929` (HTTP, not HTTPS) on host
`rec-diff`. Proven usage:

```
# glab defaults to gitlab.com — always pin the internal host via env.
# Do NOT use `glab --hostname host:port`: it errors "invalid hostname".
GITLAB_HOST=192.168.20.89:8929 glab api user        # auth check → username rec
```

Authentication (one-time, keyring-backed):

```
# Token source: /home/rec/.config/glab-cli/config.yml hosts section on rec-diff
ssh rec@rec-diff 'grep -A15 "192.168.20.89:8929" /home/rec/.config/glab-cli/config.yml | grep -E "^[[:space:]]*token:" | head -1 | sed "s/^[[:space:]]*token:[[:space:]]*//"'

# --api-protocol http and --git-protocol http are REQUIRED (server is HTTP;
# default https fails with "HTTP response to HTTPS client")
glab auth login --hostname 192.168.20.89:8929 \
  --api-protocol http --git-protocol http --token <token>
```

Git push credentials (needed because remote URLs embed `http://rec@...`):

```
printf 'http://rec:<token>@192.168.20.89:8929\n' >> ~/.git-credentials
chmod 600 ~/.git-credentials
git config --global --add credential.helper store
git ls-remote gitlab main   # verify before pushing
```

API discovery (project path needs `%2F` encoding):

```
GITLAB_HOST=192.168.20.89:8929 glab api "groups?simple=true"
GITLAB_HOST=192.168.20.89:8929 glab api "groups/3/projects?per_page=100"
GITLAB_HOST=192.168.20.89:8929 glab api "projects/big_brain%2Fl0-sensors"
```

Create a new project (same namespace, private, then add remote and push full history):

```
GITLAB_HOST=192.168.20.89:8929 glab repo create big_brain/<name> --private --description "..."
git remote add <name> http://rec@192.168.20.89:8929/big_brain/<name>.git
git push <name> <branch>
```

### 7. Tag and release

When the user requests a release ("release as vX.Y.Z", "tag", "发布", etc.):

1. Create an annotated tag:

   ```bash
   git tag -a <version> -m "<description>"
   ```

2. Push the tag to `origin`:

   ```bash
   git push origin <version>
   ```

3. If a `gitlab` remote exists, also push the tag and create a **GitLab Release**
   (a tag alone does not appear under `/-/releases`; a Release object must be
   created separately via the API — use `glab`):

   ```bash
   git push gitlab <version>

    REPO=$(git remote get-url gitlab | sed -E 's|.*[:/]([^/]+/[^/]+?)(\.git)?$|\1|' | sed 's|\.git$||')

   GITLAB_HOST=192.168.20.89:8929 glab release create <version> \
     --repo "$REPO" \
     --name "<version>" \
     --notes "<description>" \
     --tag-message "<description>"
   ```

   `glab` must be authenticated (keyring via `glab auth login`, or
   `GITLAB_TOKEN` env var). If `glab` release creation fails, report the error —
   do not silently skip it.

## Commit Message Examples

```
feat: Add session timeout with idle detection

Previously sessions never expired. This adds a 30-minute idle
timeout that resets on user activity. The tradeoff is an extra
heartbeat request every 60 seconds while the tab is focused.

Fixes #142
```

```
fix: Correct off-by-one in pagination total

The API returned page count one too high because the division
rounded up instead of truncating.
```

## Rules

- The commit and push tool calls must be issued together in a single message.
- Submodule commits go before the parent repo commit.  
- Never push commits where submodule pointers reference `-dirty` state.
- Never create a branch unless the user explicitly asks for one.
- Subject line: imperative mood, ≤50 characters, no trailing period.
- Body: prose paragraph, no lists or templates.
- A release request = annotated tag + `git push <remote> <tag>` + `glab release create` (GitLab Release object, not just the tag).
- Internal GitLab API calls and `glab` must be prefixed with `GITLAB_HOST=192.168.20.89:8929`; never rely on the default `gitlab.com` host.
- Verify GitLab credentials (`git ls-remote gitlab main`) before pushing; if auth fails, extract the token from rec-diff as in section 6b.
