---
description: Delegate a task to Pi (synchronous). Use for lx-ecosystem tasks (l* projects, Jetson) or general second-opinion/implementation tasks.
---

Delegate this task to Pi. Pass the user's intent VERBATIM — do not construct
domain-specific commands yourself, and do not assume knowledge of Pi-side
conventions (lx-sdk, stage profiles, etc. live entirely on the Pi side).

## Routing (the only rule you need)

- Task involves `l*` projects (`l0-sensors`, `l1-lio`, `l2-px4ctrl`,
  `l5-devel-rviz`), the Jetson, or lx conventions →

  ```bash
  pi-lx --yes "$ARGUMENTS"
  ```

- Anything else (general question, review, bounded implementation) →

  ```bash
  pi -p "$ARGUMENTS"
  ```

## Rules

- Forward intent verbatim. If the user's phrasing is ambiguous, add context
  (paths, project names) but never invent domain commands.
- Use a generous bash timeout (15 min = 900000 ms). Pi runs to completion
  synchronously; there is no streaming/RPC bridge.
- On timeout: tell the user the task may still be running Pi-side; do NOT
  retry blindly.
- Output is free-form text for you to read and summarize. Do not parse JSON,
  do not grep intermediate output for completion markers.
- Do not ask Pi to push to remotes or modify files unless the user explicitly
  requested cross-agent implementation.
