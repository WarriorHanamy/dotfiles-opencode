---
name: docker-bindmount-permissions
description: >
  Patterns for Docker bind mount permission leakage. When a container runs
  as root and binds a host directory, files written by the container become
  root-owned on the host. Covers isolation strategies, venv placement, and
  fix-up procedures. Use when setting up Docker-based training/inference,
  debugging "Permission denied" on host files touched by Docker, or
  designing Dockerfiles that share project directories via bind mounts.
---

Docker root + bind mount = host files owned by root.

Root cause: bind mount is a kernel-level namespace operation. UID
namespace is not virtualized by default (`--userns-remap` is opt-in).
Container root (UID 0) `=` host root (UID 0) for file ownership.

## Pattern: Keep VENV Outside Mount Path

**Bad**: venv created inside bind-mounted workspace path
```dockerfile
WORKDIR /workspace
RUN uv sync          # creates /workspace/.venv
```
At runtime, `/workspace/.venv` is shadowed by host mount AND if the
container ever touches it, the venv becomes root-owned on host.

**Good**: venv created outside mount path using UV_PROJECT_ENVIRONMENT
```dockerfile
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /workspace
RUN uv sync          # creates /opt/venv (not under /workspace)
```
At runtime, host mount at `/workspace` doesn't shadow `/opt/venv`.
No permission leakage.

## Fix-up: When host .venv is Already Root-Owned

```bash
sudo rm -rf .venv
uv sync
```

This recreates `.venv` as the host user. Docker container doesn't need
`.venv` if `UV_PROJECT_ENVIRONMENT` points to `/opt/venv`.

## Detection

| Symptom | Likely Cause |
|---------|-------------|
| `uv run` fails: `canonicalize path .venv/bin/python3: Permission denied` | `.venv` owned by root |
| `ls -la .venv/bin/python3` shows `root root` | Container wrote to `.venv` |
| `stat -c '%U:%G' .venv/` shows `root:root` | Confirm root ownership |

## Always-On Rules

1. Never let container write to a directory that will also be read by
   the host user under the same bind-mount path
2. When designing a Dockerfile that shares `/workspace` via bind mount,
   ensure all persistent build artifacts (venv, caches) go under paths
   OUTSIDE `/workspace`
3. Document the host-side fix-up procedure when migrating to Docker
