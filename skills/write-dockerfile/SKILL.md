---
name: write-dockerfile
description: Write and debug Dockerfiles with proper layer caching and dependency analysis. Use when creating Dockerfiles, fixing build errors (missing packages, shell issues), optimizing layer order, or analyzing ROS/catkin project dependencies.
---

# Write Dockerfile

## Quick start

1. Scan project for dependency sources (package.json, CMakeLists.txt, package.xml, etc.)
2. Order layers by change frequency (stable → volatile)
3. Write Dockerfile with one `RUN apt-get` per semantic layer
4. Build with `docker compose build <service>` (BuildKit required for cache mounts)
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

## APT cache mounts (MANDATORY for any Dockerfile using apt)

Use BuildKit cache mounts to share apt caches across layers, rebuilds, and projects
on the same build host.

**Do NOT add `# syntax=docker/dockerfile:1`** unless pinning a specific frontend
version: BuildKit pulls that frontend image from Docker Hub on every fresh builder,
which fails on offline/proxied build hosts. The built-in frontend (buildx >= 0.10,
Docker >= 23) supports everything in this guide.

### Step 1 — REQUIRED preamble: disable docker-clean

Debian/Ubuntu base images ship `/etc/apt/apt.conf.d/docker-clean`, which deletes
downloaded `.deb` files immediately after install. Without this step the cache
mount stays **empty forever** — the classic "cache works today, gone tomorrow"
symptom. This preamble is non-negotiable in every Dockerfile that runs apt:

```dockerfile
FROM <base>

# Disable docker-clean so apt cache mounts actually retain .deb files
RUN rm -f /etc/apt/apt.conf.d/docker-clean \
 && echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache
```

### Step 2 — every apt RUN uses cache mounts

```dockerfile
# GOOD: BuildKit cache mounts — no per-layer cleanup, cache survives rebuilds
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    pkg1 \
    pkg2

# BAD: rm -rf in every layer, no shared cache between RUNs
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg1 \
    pkg2 \
    && rm -rf /var/lib/apt/lists/*
```

### Hard rules

- **NEVER rewrite the base image's distro apt sources** (e.g. `sed` replacing
  `archive.ubuntu.com` / `ports.ubuntu.com` with a mirror). Slow upstream
  archives are a build-host network problem — solve them with proxy/cache
  infrastructure, never by mutating sources in the Dockerfile. (Project-specific
  vendor sources such as the ROS apt repo may be replaced when the project
  already establishes that pattern.)
- Every apt `RUN` mounts both `/var/cache/apt` (deb files) and `/var/lib/apt`
  (package index) — never only one
- `sharing=locked` on both mounts (prevents races in concurrent builds)
- **FORBIDDEN** after switching to cache mounts:
  - `rm -rf /var/lib/apt/lists/*` — deletes the cached index
  - `apt-get clean` / `apt-get autoclean` — deletes the cached debs
  - Skipping the docker-clean preamble (silently defeats everything)
- Keep default cache ids (id = target path) so all images on the same host share
  one apt cache; do not set custom `id=` unless isolation is required
- Use `--no-install-recommends` to minimize downloads
- One semantic layer per `RUN` (base tools, libs, runtime, debug)
- Never combine unrelated categories in one `RUN`

### Build host requirements

- **buildx plugin is required**: Docker >= 23 has no legacy builder; without the
  buildx CLI plugin, `docker build` fails with "the --mount option requires
  BuildKit". On Ubuntu docker.io: `apt install docker-buildx`. On Docker CE:
  `apt install docker-buildx-plugin`. Verify with `docker buildx version`.
- **Never** build with `DOCKER_BUILDKIT=0` — cache mounts stop working. If a
  registry is unreachable, pre-pull base images instead of disabling BuildKit.
- **`docker build --no-cache` also bypasses cache mounts** — every `--no-cache`
  build gets a fresh, empty cache mount. Never use `--no-cache` to iterate or
  to verify apt caching. To force a layer re-run while keeping cache mounts,
  use a cache-buster ARG: `ARG CACHEBUST=0` before the RUN, then
  `docker build --build-arg CACHEBUST=$(date +%s)`.
- On proxied/offline hosts, inject proxy settings into build containers via
  the build user's `~/.docker/config.json` (auto-applied as build args; apt
  then needs no container DNS because the proxy is an IP literal):
  ```json
  { "proxies": { "default": {
      "httpProxy": "http://192.168.55.100:7890",
      "httpsProxy": "http://192.168.55.100:7890",
      "noProxy": "localhost,127.0.0.1,192.168.55.0/24" } } }
  ```
- Cache mounts persist across days/reboots, but are deleted by
  `docker system prune`, `docker builder prune`, and BuildKit GC under disk
  pressure. Do not schedule prune jobs on build hosts.
- Verify cache health: `docker buildx du -v` should show non-zero entries for
  `/var/cache/apt` and `/var/lib/apt`; a second build (cache-buster, no
  `--no-cache`) must print `Hit:` for indexes and download zero `.deb` files.

## Shell compatibility

- Dockerfile `RUN` uses `/bin/sh` (dash) by default
- `source` is a bash builtin — use `.` instead, or `bash -c "..."`
- For ROS setup scripts that require bash: `RUN bash -c ". /opt/ros/noetic/setup.bash && make"`

## ROS networking env (must survive `docker exec`)

`docker exec` inherits only the container config env (image `ENV` + compose
`environment:`) — **never** variables exported inside the entrypoint script.
If the entrypoint does `export ROS_IP=127.0.0.1` but the compose file does not,
every `docker exec ... rostopic pub` session runs without `ROS_IP`, advertises a
hostname-based URI that subscribers cannot resolve, and the message is
**silently dropped** (publisher prints "publishing and latching", no subscriber
ever receives it, no error anywhere).

Set ROS networking vars in compose `environment:` (or Dockerfile `ENV`) for
every service that runs ROS nodes:

```yaml
environment:
  - ROS_IP=${ROS_IP:-127.0.0.1}
  - ROS_MASTER_URI=${ROS_MASTER_URI:-http://127.0.0.1:11311}
```

Rules:

- Keep the entrypoint fallback (`export ROS_IP="${ROS_IP:-127.0.0.1}"`) — compose
  env wins, entrypoint covers bare `docker run`.
- `network_mode: host` does NOT make this go away: the container still has its
  own hostname and `/etc/hosts`, so an unset `ROS_IP` still yields an
  unresolvable advertised URI.
- Symptom signature: `rostopic info <topic>` shows the subscriber, `rostopic
  echo` in another exec receives nothing, and the subscriber's callback never
  fires — with zero errors in any log. Check `env | grep ROS_` inside the exec
  session first.

## Proxy

Do not `unset http_proxy` in Dockerfile `RUN` commands. If a proxy is needed
for external network access, pass it via `--build-arg`:

```bash
docker compose build --build-arg HTTP_PROXY=http://proxy:3128 devel
```

## Build commands

```bash
# Standard build (BuildKit + buildx plugin required for --mount=cache)
docker compose build <service>

# Force a layer re-run WITHOUT losing apt cache mounts (cache-buster ARG)
docker build --build-arg CACHEBUST=$(date +%s) .

# LAST RESORT: full rebuild — also discards apt cache mounts (fresh empty mounts)
docker compose build --no-cache <service>

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

> **常见错误:** `ros:noetic-base` 不存在。必须写 `ros:noetic-ros-base`（中间有 `ros-`）。

### Noetic 镜像标签：`focal` vs `full`

`focal` 和 `full` 是不同的维度，不应混淆：

| 标签 | 描述 |
|------|------|
| `osrf/ros:noetic-desktop-focal` | Ubuntu 20.04 Focal，ROS **desktop** 级别（RViz, rqt, 基础库） |
| `osrf/ros:noetic-desktop-full` | 同上，额外安装 `ros-noetic-desktop-full` 元包（+Gazebo, 仿真, 感知包） |
| `osrf/ros:noetic-desktop-full-focal` | `full` 的完整名称，省略 `-focal` 时默认 Focal |

继承关系：`focal` → `apt install ros-noetic-desktop-full` → `full`。`desktop-full` 是 `desktop` 的超集。

**选型建议：**
- 需要 RViz/rqt/编译运行节点 → `osrf/ros:noetic-desktop-focal`（优先选用）
- 需要 Gazebo/完整仿真 → `osrf/ros:noetic-desktop-full` 或显式安装 `ros-noetic-gazebo-*`
- 生产运行镜像 → 使用 `ros:noetic-ros-base` 或 `desktop`，仅安装实际依赖，镜像更小更快

## Debugging build failures

1. `apt-get` failure — check package name; run `apt-cache search <name>` in container
2. `COPY failed: file not found` — check `.dockerignore` and build context
3. `source: not found` — use `bash -c` or `.` instead of `source`
4. `catkin_package` not found — missing `find_package(catkin REQUIRED COMPONENTS roscpp)`
5. Timeout on registry — pre-pull base images with `docker pull` before build
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
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    ros-noetic-roscpp \
    ros-noetic-std-msgs \
    ... \
    || true && \
    (apt-get install -y ros-noetic-cmake-utils || true)
```

### Step 6: ADR documentation

Record dependency decisions in `docs/adr/` — especially when `package.xml` and
`CMakeLists.txt` disagree, or when using try-install fallbacks.
