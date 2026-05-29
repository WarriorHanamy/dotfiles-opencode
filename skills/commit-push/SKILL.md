---
name: commit-push
description: Stage, commit with conventional commit message, and push to origin. Use when user says "commit and push", "push", "/commit", "commit push", or "提交并推送".
---

# Commit and Push

Stage all changes, commit with a conventional commit message, and push to origin.

## Workflow

### 1. Scan changes

```bash
git status && git diff HEAD && git diff --staged
```

If no changes exist, report and stop.

### 2. Handle submodules

Check for `.gitmodules`. For each submodule with uncommitted changes:

```bash
git -C <submodule-path> add -A
git -C <submodule-path> commit -F- <<'EOF'
<conventional-commit-message>
EOF
git -C <submodule-path> push
```

Process submodules sequentially before the parent repo.

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

For the first push of a new branch, include `-u origin <branch>`.

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
- Never create a branch unless the user explicitly asks for one.
- Subject line: imperative mood, ≤50 characters, no trailing period.
- Body: prose paragraph, no lists or templates.
