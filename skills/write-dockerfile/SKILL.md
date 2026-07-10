---
name: write-dockerfile
description: Write and debug Dockerfiles with proper layer caching and dependency analysis. Use when creating Dockerfiles, fixing build errors (missing packages, shell issues), optimizing layer order, or analyzing ROS/catkin project dependencies.
---

# Write Dockerfile

## Quick start

1. Scan project for dependency sources (package.json, CMakeLists.txt, package.xml, etc.)
2. Order layers by change frequency (stable → volatile)
3. Write Dockerfile with one `RUN apt-get` per semantic layer
4. Build with `DOCKER_BUILDKIT=0` for local cache fallback
5. On error: add missing package to the thinnest valid layer, rebuild

## Layer ordering principle

Order `RUN apt-get` layers from **least volatile** to **most volatile**:

```
Layer 1: Base tools         (build-essential, cmake, git)          — almost never changes
Layer 2: Build system tools (npm, pip, cargo, catkin-tools)        — rarely changes
Layer 3: System libraries   (libeigen3-dev, libopencv-dev)         — occasionally changes
Layer 4: Runtime libraries  (Mesa, OpenSSL, libwayland)            — rarely changes
Layer 5: Debug tools        (valgrind, gdb, libdwarf-dev)          — one-time addition
Layer 6: Project deps       (ros-noetic-*, npm packages)           — changes often during debug
```

**Why**: Adding a package to a later layer only invalidates that layer + everything below.
If the project deps layer is Layer 3, adding one package invalidates Layers 3-6 + COPY + build.
If it's Layer 6 (last), only the deps layer + COPY + build are invalidated.

## APT layer rules

```dockerfile
# GOOD: semantic layer with cleanup
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg1 \
    pkg2 \
    && rm -rf /var/lib/apt/lists/*

# BAD: monolithic, no cleanup, mixed semantics
RUN apt-get update && apt-get install -y \
    pkg1 pkg2 pkg3 pkg4 pkg5 pkg6
```

- Every `RUN apt-get install` ends with `&& rm -rf /var/lib/apt/lists/*`
- Use `--no-install-recommends` to minimize image size
- One semantic layer per `RUN` (base tools, libs, runtime, debug)
- Never combine unrelated categories in one `RUN`

## Shell compatibility

- Dockerfile `RUN` uses `/bin/sh` (dash) by default
- `source` is a bash builtin — use `.` instead, or `bash -c "..."`
- For ROS setup scripts that require bash: `RUN bash -c ". /opt/ros/noetic/setup.bash && make"`

## Build commands

```bash
# Standard build (uses BuildKit by default)
docker compose build <service>

# BuildKit disabled: fallback to local image cache when registry unreachable
DOCKER_BUILDKIT=0 docker compose build <service>

# Force rebuild specific layer (no cache)
DOCKER_BUILDKIT=0 docker compose build --no-cache <service>

# Build specific target in multi-stage
docker build --target devel -t myimage:devel .
```

## Image naming convention

Docker image names follow this structure:

```
{registry}/{app}-{sim|real}/{arch}-{os}-cuda{cuda_version}/{phase}:{tag}
```

| Component         | Examples                           | Description                  |
| ----------------- | ---------------------------------- | ---------------------------- |
| `{registry}`      | `diff.io`, `ghcr.io/org`           | Registry URL                 |
| `{app}-{sim\|real}` | `super-sim`, `am-real`             | Project name + domain suffix |
| `{arch}`          | `amd64`, `arm64`                   | CPU architecture             |
| `{os}`            | `ubuntu20.04`, `ubuntu22.04`       | OS version (matches ROS)     |
| `{cuda_version}`  | `0.0.0`, `11.8`, `12.1`            | CUDA version; `0.0.0` = CPU-only |
| `{phase}`         | `devel`, `test`, `release`         | CI/CD phase                  |
| `{tag}`           | `latest`, `v0.1.0`, `b7978de`      | Version identifier           |

### Examples

```
diff.io/super-sim/amd64-ubuntu20.04-cuda0.0.0/devel:latest      # ROS noetic, CPU-only
diff.io/super-sim/amd64-ubuntu20.04-cuda11.8/release:v0.1.0     # ROS noetic, CUDA 11.8
ghcr.io/myorg/am-real/arm64-ubuntu22.04-cuda12.1/test:b7978de   # ROS humble, Jetson
```

### ROS version ↔ OS mapping

| ROS distro | Ubuntu  | Base image                   |
| ---------- | ------- | ---------------------------- |
| noetic     | 20.04   | `ros:noetic-ros-base`          |
| humble     | 22.04   | `ros:humble-ros-base`          |
| jazzy      | 24.04   | `ros:jazzy-ros-base`           |

## Debugging build failures

1. `apt-get` failure — check package name; run `apt-cache search <name>` in container
2. `COPY failed: file not found` — check `.dockerignore` and build context
3. `source: not found` — use `bash -c` or `.` instead of `source`
4. `catkin_package` not found — missing `find_package(catkin REQUIRED COMPONENTS roscpp)`
5. Timeout on registry — use `DOCKER_BUILDKIT=0` + pre-pull with `docker pull`
6. Layer cache miss — reorder layers; put stable deps first

## ROS/catkin projects (special handling)

**We do NOT use `rosdep` for Docker dependency resolution.** Instead, we manually
scan `package.xml` and `CMakeLists.txt` to determine the conservative union of all
dependencies, then hardcode them as `ros-noetic-*` apt packages in the Dockerfile.
`rosdep init`/`rosdep update` are omitted — they are slow, unreliable on CI, and
redundant when deps are already hardcoded.

### Step 1: Scan all package.xml files

Extract ALL dependency tags across every package:

```bash
rg -n "<depend>|<build_depend>|<build_export_depend>|<exec_depend>|<run_depend>" \
  --include "package.xml" /path/to/workspace/
```

### Step 2: Scan all CMakeLists.txt files

```bash
rg -n "find_package(catkin REQUIRED COMPONENTS" --include "CMakeLists.txt" /path/to/workspace/
```

### Step 3: Conservative union

Take the union of both sources. ROS `package.xml` and `CMakeLists.txt` often
have mismatches (e.g., `pcl_ros` in CMakeLists.txt but missing from package.xml).
The union is the safest choice.

### Step 4: Exclude workspace-internal packages

Packages that exist in the workspace source tree (built by catkin) should NOT
be installed via apt. Filter them out:

- Check which packages have their own directory with CMakeLists.txt in the workspace
- Remove those from the `ros-noetic-*` install list

### Step 5: Handle problematic packages

Some packages may not exist as `ros-noetic-*` (e.g., `cmake_utils` from HKUST).
Use try-install fallback:

```bash
RUN apt-get update && apt-get install -y --no-install-recommends \
    ros-noetic-roscpp \
    ros-noetic-std-msgs \
    ... \
    || true && \
    (apt-get install -y ros-noetic-cmake-utils || true) && \
    rm -rf /var/lib/apt/lists/*
```

### Step 6: ADR documentation

Record dependency decisions in `docs/adr/` — especially when `package.xml` and
`CMakeLists.txt` disagree, or when using try-install fallbacks.
