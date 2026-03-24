---
name: heredoc
description: Heredoc best practices for shell scripts, especially ssh scenarios. Covers variable expansion rules (local vs remote), quoting conventions, and safe parameter passing patterns.
---

# Heredoc

Use this skill when writing heredoc in shell scripts, especially with `ssh`, to ensure correct variable expansion and safe parameter passing.

## Core Rule: Who Expands, Where, When

Heredoc variable expansion depends on **delimiter quoting**:

### No Quotes: Local Expansion

```bash
cat <<EOF
home=$HOME
user=$(whoami)
EOF
```

`$HOME` and `$(whoami)` are expanded by **local shell** before heredoc content is processed.

### Quoted Delimiter: No Local Expansion

```bash
cat <<'EOF'
home=$HOME
user=$(whoami)
EOF
```

`$HOME` and `$(whoami)` are preserved literally, passed to whatever consumes the heredoc.

Valid quoted forms: `<<'EOF'`, `<<"EOF"`, `<<\EOF`

**Prefer `<<'EOF'`** for clarity.

## SSH + Heredoc

### The Trap

```bash
ssh host <<EOF
echo "$HOME"
EOF
```

This prints **local** `$HOME`, not remote, because:
1. Local shell processes heredoc first
2. `$HOME` is expanded locally
3. Expanded text is sent to ssh

### Rule 1: Default to `<<'EOF'` for Remote Execution

```bash
ssh host <<'EOF'
echo "$HOME"
echo "$(hostname)"
EOF
```

Now `$HOME` and `$(hostname)` expand on the **remote** host.

### Rule 2: Pass Local Variables via Arguments, Not String Interpolation

**Recommended: Use positional parameters**

```bash
local_name="alice"
local_dir="/data/app"

ssh host bash -s -- "$local_name" "$local_dir" <<'EOF'
name=$1
dir=$2

printf 'name=%s\n' "$name"
printf 'dir=%s\n' "$dir"
printf 'remote_home=%s\n' "$HOME"
EOF
```

Advantages:
- No string concatenation into script body
- Clear parameter boundaries
- Safe with spaces and special characters
- Minimal quoting complexity

## Recommended Templates

### Pure Remote Execution

```bash
ssh host bash -s <<'EOF'
set -euo pipefail

echo "remote user: $(whoami)"
echo "remote home: $HOME"
EOF
```

### Local Params + Remote Execution

```bash
name="alice"
path="/tmp/demo dir"

ssh host bash -s -- "$name" "$path" <<'EOF'
set -euo pipefail

name=$1
path=$2

printf 'name=%s\n' "$name"
printf 'path=%s\n' "$path"
printf 'remote hostname=%s\n' "$(hostname)"
EOF
```

## Common Mistakes

### Mistake 1: Assuming Remote Expansion with Unquoted Delimiter

```bash
# Wrong: $HOME expands locally
ssh host <<EOF
echo "$HOME"
EOF
```

Fix: Use `<<'EOF'`

### Mistake 2: Mixing Local and Remote Variables in Same Heredoc

```bash
# Wrong: all variables expand locally
local_name="alice"
ssh host <<EOF
echo "local=$local_name"
echo "remote=$HOME"
echo "host=$(hostname)"
EOF
```

Fix: Use parameter passing pattern above.

### Mistake 3: Directly Interpolating User Input

```bash
# Dangerous: injection risk
ssh host <<EOF
rm -rf "$user_input"
EOF
```

Fix:

```bash
ssh host bash -s -- "$user_input" <<'EOF'
target=$1
rm -rf -- "$target"
EOF
```

## Quick Reference

| Pattern | Expansion Location |
| ------- | ------------------ |
| `<<EOF` | Local shell |
| `<<'EOF'` | Passed literally (consumer decides) |

**SSH default**: Start with `<<'EOF'`, pass local values via `bash -s -- "$var"`.

## Best Practices Summary

1. SSH + heredoc: default to `<<'EOF'`
2. Pass local values via positional parameters: `ssh host bash -s -- "$arg1" "$arg2" <<'EOF'`
3. Never rely on implicit expansion behavior
4. Complex scripts: use `set -euo pipefail`, prefer `printf` over `echo`
