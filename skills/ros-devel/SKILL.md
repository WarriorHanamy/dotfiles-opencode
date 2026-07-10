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
