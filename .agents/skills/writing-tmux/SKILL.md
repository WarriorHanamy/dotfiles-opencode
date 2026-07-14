---
name: writing-tmux
description: Use when driving tmux sessions, windows, or panes from an agent or script, especially when sending keys, capturing panes, splitting windows, selecting targets, or avoiding fragile numeric tmux targets.
---

# Writing tmux

## Core Rule

Use stable tmux targets. Do not use bare numeric targets such as `0`, `1`, `2`, `:0.1`, or `-t 1` unless they are immediately resolved from the current command output and never reused.

Prefer explicit target forms:

| Scope | Stable target | How to discover |
| --- | --- | --- |
| Session | `"$session_name"` or `"$session_id"` like `'$3'` | `tmux list-sessions -F '#{session_id} #{session_name}'` |
| Window | `"$window_id"` like `'@7'` | `tmux list-windows -t "$session" -F '#{window_id} #{window_index} #{window_name}'` |
| Pane | `"$pane_id"` like `'%12'` | `tmux list-panes -a -F '#{pane_id} #{session_name}:#{window_id} #{pane_current_command} #{pane_title}'` |

Pane IDs (`%N`) and window IDs (`@N`) are the safest targets because they survive reordering and index changes during the lifetime of the tmux server.

## Workflow

1. Discover targets before acting:

    ```bash
    tmux list-sessions -F '#{session_id} #{session_name} #{session_windows}'
    tmux list-windows -a -F '#{session_name} #{window_id} #{window_index} #{window_name}'
    tmux list-panes -a -F '#{pane_id} #{session_name}:#{window_id} #{pane_index} #{pane_current_command} #{pane_title}'
    ```

2. Bind variables to explicit IDs or names:

    ```bash
    session_name="work"
    window_id="@7"
    pane_id="%12"
    ```

3. Use those variables in all later commands:

    ```bash
    tmux capture-pane -p -t "$pane_id" -S -200
    tmux send-keys -t "$pane_id" "make test" C-m
    tmux split-window -t "$pane_id" -h
    tmux rename-window -t "$window_id" "tests"
    ```

4. Re-discover after commands that create, kill, move, join, or respawn panes/windows. A stored `%pane_id` is stable only while that pane still exists.

## Target Forms

- Use `%pane_id` directly for pane commands. It is absolute and unambiguous.
- Use `@window_id` directly for window commands.
- Use a unique session name when you created the session yourself; otherwise use `'$session_id'` and quote it so the shell does not expand `$`.
- Use combined context only when needed for readability, for example `"$session_name:$window_id.$pane_id"`. Prefer the direct `%pane_id` form for pane operations.
- If using relative selectors such as `{last}`, `{next}`, `{top}`, or `{bottom}`, resolve them immediately with `display-message -p` or `list-panes`, then store the resulting `%pane_id`.

## Common Mistakes

| Mistake | Use instead |
| --- | --- |
| `tmux send-keys -t 1 ...` | Discover and use `-t "$pane_id"` |
| `tmux capture-pane -t :0.1` | `tmux capture-pane -t "$pane_id"` |
| Assuming pane index stays stable after `split-window` | Re-run `list-panes` and update `%pane_id` |
| Writing `session_id=$3` in shell | `session_id='$3'` or a quoted command substitution |
| Matching only by window name when duplicates exist | Match session plus `@window_id`, or use only `@window_id` |

## Sanity Check

Before sending input to tmux, run a harmless read against the exact target:

```bash
tmux display-message -p -t "$pane_id" '#{session_name}:#{window_id}.#{pane_id} #{pane_current_command} #{pane_title}'
```

If this does not identify the intended pane, stop and re-discover targets instead of guessing numeric indexes.
