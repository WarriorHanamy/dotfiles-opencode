---
name: pi-build-verifier
description: Use when a batch of changes in a Docker/ROS project is complete (batch end, pre-PR), after editing AGENTS.md or Docker lifecycle files (Dockerfile, compose, artifact mounts), or when the user explicitly asks for system-level build coherence verification. Do NOT use after single-file edits, mid-batch, for non-Docker projects, or for pure documentation changes.
---

# pi-build-verifier

## Overview

System-level, **read-only** meta verifier (runs Pi agent). Validates AGENTS.md + Docker devel/build/test/release lifecycle + artifacts mount convention + git diff coherence at project scope. **NOT** a per-file build checker.

Binary: `~/.pi/agent/bin/pi-build-verifier` (already in PATH via `.bashrc`).

## When to Use

- Batch of changes complete in a Docker/ROS project
- Pre-PR / pre-merge system coherence check
- After editing AGENTS.md sections related to build commands, Docker lifecycle, or artifacts convention
- After editing Dockerfile, compose files, or package.xml/CMakeLists.txt (non-exhaustive mapping changes)
- User explicitly requests "verify build system" / "run pi-build-verifier"

## When NOT to Use

- After every single file edit (use CI or inner compile for hot-reload)
- Mid-batch: do not interrupt a work session with system-level checks
- Non-Docker projects (pure Python, JS, platform-native builds — use CI)
- Pure documentation or comment changes not touching project semantics

## Invocation

Run synchronously via bash. `PROJECT_ROOT` is the **only** argument.

```bash
pi-build-verifier <PROJECT_ROOT>
```

- Do NOT pipe `git diff` or pass file lists — the verifier derives changes itself via `git diff HEAD`.
- Do NOT use the opencode `pi_verifier_delegate` tool or `pi-a2a` CLI — the A2A invocation path is unstable; prefer synchronous bash CLI.

## Behavior

- **Bootstrap pass** (no git diff → `git diff HEAD` empty): validates AGENTS.md + Docker lifecycle contract only, without changed-file classification.
- **Changed-file pass** (git diff present): validates AGENTS.md contract + classifies changes (outer build needed vs inner compile only) + progressive review focus.
- **Exit code**: always 0. The caller reads the JSON output to determine outcome.

## Output Handling

Output is JSON to stdout:

```json
{"blocked":true/false,"type":"...","reason":"...","evidence":["..."],"recommendations":["..."],"retry":true/false}
```

| Field | When true |
|-------|-----------|
| `blocked:true` | Cannot safely proceed. Fix AGENTS.md / Docker lifecycle per `recommendations` first. |
| `blocked:false` | System coherence pass; recommendations are advisory. |
| `retry:true` | Rerun `pi-build-verifier` after addressing recommendations. |
| `retry:false` | This pass is sufficient; move on without rerunning. |

When blocked, do NOT proceed to change review, PR, or submission until the blocker is resolved per recommendations. This is a **read-only classifier** — it never executes builds, never modifies files.

## Related

- Artifacts mount convention documented in AGENTS.md `## Artifacts Mount Convention`
- `write-dockerfile` skill for Dockerfile creation/debug
- `ros-devel` skill for ROS development lifecycle
