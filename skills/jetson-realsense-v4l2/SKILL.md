---
name: jetson-realsense-v4l2
description: RealSense on Jetson (AGX Orin, L4T 36.4.x) stable 15Hz debugging and setup. Use when working with RealSense D435i on Jetson, RSUSB vs V4L2 backend choice, kernel patching for realsense (patch-realsense-ubuntu-L4T.sh), aligned depth rate problems, or container vs host RealSense rate issues.
---

# Jetson RealSense V4L2 Backend (Stable 15Hz)

## Conclusion

On Jetson (AGX Orin, L4T 36.4.7, kernel 5.15.148-tegra, JetPack 6.2.1):

- **RSUSB backend (`-DFORCE_RSUSB_BACKEND`) is NOT viable** for production on
  Jetson: depth stream jitters (0.002~0.6s intervals), aligned depth stalls or
  runs at ~2Hz. Intel docs also state RSUSB is prototype-only.
- **Native V4L2 backend + kernel patch is the required path**:
  1. Patch the L4T kernel with Intel's official script
     `scripts/patch-realsense-ubuntu-L4T.sh` (builds patched `uvcvideo.ko`
     with `1.1.1-realsense` version + HID IMU sensors).
  2. Build librealsense **without** `FORCE_RSUSB_BACKEND` so the V4L2 backend
     is available.
- USB port / USB 3.2 bandwidth is NOT the bottleneck (verified: identical
  rates on two different USB 3.2 ports).

## Verified numbers (host, V4L2, after kernel patch)

| Configuration                  | rate          | notes                        |
| ------------------------------ | ------------- | ---------------------------- |
| color 1080p@15 raw             | 14.99 fps     | ~15Hz perfect, zero jumps    |
| depth 720p@15 raw              | 14.88 fps     | sensor-inherent 0.8% (no drops) |
| depth 720p + color 1080p align | 14.85 fps     | 891/891 aligned, 0 failures  |
| depth 720p + color 720p align  | 14.87 fps     | 892/892 aligned, 0 failures  |

Depth 14.88 vs 15.0 is D435i hardware clock, NOT frame loss (frame_number
continuity: jumps=0). Color is effectively perfect 15Hz.

## Container results (production stack)

- **librealsense v2.50 align is slow on arm64 (~4.3 fps)** — the align
  bottleneck, not the container. Use **v2.58.3** (NEON-optimized align).
- **v2.58.3 in-container: depth 15.4Hz + color 15.0Hz + aligned 15.5Hz**
  (realsense2_camera 2.3.2 relinked against 2.58.3, ROS Noetic, --privileged).
- **Infrared streams (infra1/infra2) MUST be disabled**: they share the
  D435i stereo sensor with depth; enabling them stalls depth at 0 Hz
  (`backend-v4l2.cpp: Frames didn't arrived within 5 seconds`).
- SONAME gotcha: a wrapper built against v2.50 NEEDs `librealsense2.so.2.50`;
  ldconfig will NOT resolve a mismatched-soname symlink. Rebuild the wrapper
  against 2.58.3 (`-DCMAKE_PREFIX_PATH="/opt/ros/noetic;/usr/local"`).
- python bindings are irrelevant to realsense2_camera (pure C++); py3.8 is
  fine in the image. 2.58.3 has no cp38 aarch64 wheel — test with C++ API or
  host cp310 wheel.

## Execution path (full procedure)

### 1. Kernel patch (on the Jetson, ~30-60 min)

```bash
# clone on Jetson (needs proxy or direct github access)
git clone --depth 1 https://github.com/IntelRealSense/librealsense.git ~/librealsense
cd ~/librealsense

# make the script non-interactive: auto-accept license, skip camera detach check
sed -i 's|read -t 30 -n 1 -s -r -e -p .*|echo ACCEPTED|' scripts/patch-realsense-ubuntu-L4T.sh
sed -i 's|read -p "Remove all RealSense cameras attached. Hit any key when ready"|echo SKIP-CAMERA-CHECK|' scripts/patch-realsense-ubuntu-L4T.sh

# run it (downloads kernel source from gitlab.com/nvidia/nv-tegra, ~3.5G,
# builds patched modules into /lib/modules/$(uname -r)/extra/)
bash scripts/patch-realsense-ubuntu-L4T.sh
```

Script outputs `Failed to unload module videodev. Error type 1. Try rebooting`
→ reboot the Jetson; on boot the patched `videodev.ko`/`uvcvideo.ko` from
`extra/` are used (`depmod` search order: `extra updates ubuntu built-in`).

After reboot, load the patched UVC driver if not auto-loaded:

```bash
sudo modprobe uvcvideo
lsmod | grep uvcvideo     # expect 1.1.1-realsense via modinfo
ls /dev/video*            # expect 6 devices for D435i
```

Verify: `modinfo uvcvideo | grep version` → `1.1.1-realsense`.

### 2. Build librealsense with V4L2 backend (no RSUSB flag)

For container images: build with the same flags as before but WITHOUT
`-DFORCE_RSUSB_BACKEND=TRUE` (default = V4L2 + RSUSB both available, V4L2
selected on Linux when UVC driver present).

Key cmake flags (see l0-mid360-mavros-realsense-arm64 build script):

```bash
cmake -S /tmp/librealsense -B /tmp/librealsense/build \
  -DCMAKE_INSTALL_PREFIX=/opt/librealsense \
  -DPYTHON_EXECUTABLE=/usr/bin/python3 \
  -DPython_EXECUTABLE=/usr/bin/python3 \
  -DPYTHON_INSTALL_DIR=/opt/librealsense/lib/pyrealsense2 \
  -DBUILD_GRAPHICAL_EXAMPLES=FALSE \
  -DBUILD_EXAMPLES=FALSE \
  -DBUILD_PYTHON_BINDINGS=TRUE
```

Container MUST run `--privileged` (or mount `/dev/bus/usb` + `/dev/video*`)
so V4L2 devices are visible inside.

### 3. Host-side rate verification (before/after)

Use pyrealsense2 pipeline with `rs.align(rs.stream.color)` and count
framesets + aligned successes over 60s; frame_number continuity
(`jumps=0`) is the ground truth for "no drops". See
`/tmp/codex-lx/host-align-rate.py` pattern:

```python
align = rs.align(rs.stream.color)
# per frameset: aligned = align.process(f)   -> count successes/failures
# true rate = (last_frame_number - first) / (last_ts - first_ts)
```

## Gotchas

- `rosversion` errors inside containers: `export ROS_PACKAGE_PATH=/workspace/src:${ROS_PACKAGE_PATH}` (append, never overwrite `/opt/ros/noetic`).
- `cv2.imwrite` silently fails if the target dir doesn't exist — `os.makedirs(SAVE_DIR, exist_ok=True)`.
- Docker build on SMB mounts: AppleDouble files (`._*`) break `docker build` context — add `._*` to `.dockerignore`.
- Jetson disk is tight (was 100% full once): check `df -h` before big pulls; old backup images can be pruned (`docker image prune -a`, or `docker rmi` stopped containers' images).
- Proxy for Jetson: `ssh -R 7892:127.0.0.1:7892 diff@<jetson>` + `~/.env` with
  `export http_proxy=http://127.0.0.1:7892` + sshd `SetEnv BASH_ENV=/home/diff/.env`
  (non-interactive bash only reads `$BASH_ENV`, not `.profile`/`.bashrc`).
