---
name: ros-devel
description: Use when developing, building, running, or debugging ROS projects in Docker containers, setting up ROS workspaces with Docker Compose, designing ROS CI/CD pipelines with multi-phase builds, organizing bringup launch/config packages, or naming ROS Docker images and containers.
---

# ros-devel

## Overview
Container-first. Host has zero ROS deps. Docker Compose = build system. All runtime in container.

## When to Use
- ROS Dockerfile/docker-compose setup
- Multi-phase CI (build -> test -> release)
- Bringup dir org
- Container/image naming
- ROS build debug

## System Assumptions
- NO ROS, RViz, catkin, GPU/X11 on host
- Entrypoint sources: distro setup.bash -> workspace devel/setup.bash (if exists) -> exec "$@"
- Host tools only for file reads/edits. ROS ops always in container.
- Docker Compose service for build, `run --rm` for one-off, `exec` for running container.

## Image Naming
```
{registry}/{project}-{domain}/{arch}-{os}-cuda{cuda}/{phase}:{tag}
```

| Component   | Example        | Note                        |
| ----------- | -------------- | --------------------------- |
| registry    | myregistry.io | Omit for local-only images |
| project     | myapp          | Project name                |
| domain      | sim, real      | Deployment domain           |
| arch        | amd64, arm64   | -                           |
| os          | ubuntu20.04    | Matches ROS distro          |
| cuda        | 0.0.0, 11.8   | 0.0.0 = CPU-only           |
| phase       | devel, release | Pipeline phase              |
| tag         | latest, v1.0   | -                           |

## Container Naming
```
{project}-{service}-{unique_id}
{unique_id} = GIT_SHA(CI) | local(manual) | timestamp
```
Scripts reference compose service name, never hardcode container name.

## Devel vs Release
| Aspect  | Devel                            | Release                                   |
| ------- | -------------------------------- | ----------------------------------------- |
| Base    | `ros:{distro}-ros-base`          | `osrf/ros:{distro}-desktop-full`          |
| Role    | compile, headless test           | rviz visualization                        |
| Source  | bind-mount (rw)                  | COPY in image (baked)                     |
| Network | bridge (default)                 | host                                      |
| Display | none / software rendering        | XWayland/X11 passthrough                  |
| GPU     | none                             | NVIDIA toolkit (optional)                 |

Both use same devel image for compilation. Different cmake flags produce test vs release artifacts.

## Pipeline Chain
```
devel image -> build-test(flags for test) -> test(headless, artifacts ro)
            -> build-release(flags for release) -> release image -> release(rviz+X11)
```
Build artifacts persist on host. Test mounts artifacts read-only. Release COPYs into image.

## Compile Session

**Agent directive**: When an agent needs to compile a ROS project, delegate to
`@ compile-watcher`. Never inline the polling loop in the main agent — it wastes
context and blocks the session. The compile-watcher subagent handles start,
monitor, parse, and report as one synchronous call.

Two modes for running `catkin build`:

### Agent mode — `@ compile-watcher`

Custom subagent at `~/.config/opencode/agents/compile-watcher.md`. Blocks synchronously, returns structured report.

```
@ compile-watcher make compile in /home/rec/diff-dockers/l3-uss-nav-amd64
```

Workflow: starts `make compile` (tmux detached) → polls `compile.log` → parses Summary → reports success/failure + errors + tips.

### Manual mode — tmux

For human debugging:

```
make compile
tmux attach -t <project>-compile
```

## Incremental Compile

### Rules of thumb

| State | Action |
|---|---|
| Source code (`src/`) changed | `make compile` — catkin auto-detects |
| Same-package repeated error | `catkin build --force-cmake <pkg>` — invalidates stale cmake cache |
| CMakeLists.txt changed | auto-detected by catkin, no manual flag needed |
| Docker image config changed (`docker/assets/*`, `Dockerfile`) | `make build` first, then `catkin build --force-cmake <pkg>` |
| Only one package changed | `catkin build --no-deps <pkg>` — skip upstream rebuild |
| Start from middle of workspace | `catkin build --start-with <pkg>` — skip earlier packages |
| Full single-package rebuild | `catkin build --pre-clean <pkg>` — deletes build dir + cache |

### Anti-patterns

- **Don't** `rm -rf .artifacts/` for a single-package fix — use `--force-cmake` or `--pre-clean`
- **Don't** rebuild Docker image for source-only changes — `src/` is bind-mounted at compile time
- **Don't** use `catkin_make` for workspace-level compile — use `catkin build` (catkin_tools)

### When to full-wipe `.artifacts/`

Only when workspace-level cmake configuration changes:
- ROS distro version change
- Python version change
- Catkin tool change (`catkin_make` → `catkin build`)
- C++ standard changed (`-std=c++14` → `-std=c++17` at workspace level)
- System-level cmake policy change

## Artifacts Ownership

### Root ownership problem

Docker containers run as `root` by default. Bind-mounted `.artifacts/{build,devel}` are
owned by `root` on the host after a compile.

### Cleaning with a container (preferred)

Use a named cleanup container instead of `sudo rm -rf`:

```bash
docker run --rm --name artifact-cleaner \
  -v "${PROJECT_DIR}/.artifacts:/target" \
  -w /target \
  alpine:3.19 \
  sh -c 'rm -rf build devel compile.log'
```

Container name `artifact-cleaner` clarifies intent in `docker ps`. No sudo, no
host permission escalation. Works as unprivileged user.

### Solutions

| Solution | Trade-off |
|---|---|
| `sudo rm -rf .artifacts/build` | Simple, needs sudo |
| `sudo chown $USER -R .artifacts/` | Restores ownership, keeps cache |
| `docker run --user $(id -u):$(id -g)` | No root files created; but may cause permission errors if image expects root |
| Compile script pre-creates dirs world-writable: `mkdir -p -m 777 .artifacts/{build,devel}` | Simple, but relaxes permissions |
| Compile script ends with `chown` | Guarantees clean state, adds a few seconds |

### Recommended pattern

Pre-create `.artifacts/{build,devel}` with world-writable permissions in the compile script
(before `docker run`). The container (root) and host user can both write without conflict.

```bash
mkdir -p -m 777 "${ARTIFACT_DIR}/build" "${ARTIFACT_DIR}/devel"
```

## Bringup
Self-contained ROS package for launch files, configs, data, maps.

```
bringup/
  launch/ [purpose]_[app].launch
  config/ [purpose]_[node].yaml | *.rviz
  data/   [purpose]_[app].txt
  scripts/ *.py, *.sh
  maps/   *.pcd
```

Rules:
- All `$(find bringup)` refs. No cross-pkg refs. No hardcoded paths.
- `rviz` node ONLY in visual/display launch files. Never in headless test.
- Per-purpose completeness: each purpose gets full config/launch/data set in one bringup dir.
- Register via `ROS_PACKAGE_PATH` in entrypoint (no catkin build needed for bringup).

## Dockerfile Layers (stable -> volatile)
1. Base tools (build-essential, cmake, git, curl)
2. Build system tools (catkin-tools, pip)
3. System dev libs (Eigen3, OpenCV, PCL, yaml-cpp)
4. Runtime libs (Mesa libGL, libEGL, libwayland, X11)
5. Debug tools (gdb, valgrind)
6. ROS deps (ros-{distro}-*) -- MOST VOLATILE, LAST

Each `RUN apt-get` ends with `&& rm -rf /var/lib/apt/lists/*`. One semantic layer per RUN.

### Shell
```dockerfile
# ALWAYS bash -c. Most stable. source/ . both fragile in /bin/sh.
RUN bash -c "source /opt/ros/{distro}/setup.bash && catkin build"
```

## ROS Deps
NO rosdep. Hardcode `ros-{distro}-*` packages.
Source: union(package.xml tags, CMakeLists.txt find_package COMPONENTS).
Exclude workspace-internal packages (those with own CMakeLists.txt in src/).
Use `|| true` fallback for packages that may not exist.

### Scan Commands
```bash
rg -n "<(depend|build_depend|build_export_depend|exec_depend|run_depend)>" --include "package.xml" /workspace/src/
rg -n "find_package(catkin REQUIRED COMPONENTS" --include "CMakeLists.txt" /workspace/src/
```

## ROS <-> OS
| ROS    | Ubuntu |
| ------ | ------ |
| noetic | 20.04  |
| humble | 22.04  |
| jazzy  | 24.04  |

## X11/GPU Passthrough
```yaml
# docker-compose.yml
environment:
  - DISPLAY=${DISPLAY}
  - QT_X11_NO_MITSHM=1
  - NVIDIA_VISIBLE_DEVICES=all
  - NVIDIA_DRIVER_CAPABILITIES=all
  - __GLX_VENDOR_LIBRARY_NAME=nvidia
volumes:
  - /tmp/.X11-unix:/tmp/.X11-unix:ro
  - $HOME/.Xauthority:/root/.Xauthority:ro
network_mode: host    # release containers only
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          capabilities: [gpu, graphics]
```

## Anti
- ROS commands on host
- `source` / `.` in Dockerfile RUN -> always `bash -c "..."`
- rosdep init/update (slow, brittle, redundant)
- host network for concurrent containers (use bridge)
- rviz node in headless test launch (blocks roslaunch exit)
- Monolithic `RUN apt-get` (split by semantic layer)
- Hardcoded paths in launch files (use `$(find bringup)`)
- Cross-pkg `$(find other_pkg)` in bringup launch files
