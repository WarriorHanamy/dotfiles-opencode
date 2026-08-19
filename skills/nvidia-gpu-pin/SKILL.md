---
name: nvidia-gpu-pin
description: Manage the NVIDIA GPU stack pinning on rec-diff. GPU driver/firmware/toolkit packages are pinned in /etc/pacman.conf IgnorePkg so routine `pacman -Syu` never breaks the docker --gpus / 3dgs-sim (gsplat CUDA) render stack. Use when the user asks about GPU driver updates, pinning, 升级驱动, 更新显卡驱动, or why docker --gpus broke after a system update.
---

# NVIDIA GPU Stack Pinning (rec-diff)

## Why

rec-diff relies on docker `--gpus` + CUDA for the 3dgs-sim (gsplat
renderer) and the l2 sim stack. NVIDIA driver/firmware/toolkit updates
landing mid-`pacman -Syu` can break driver-kernel module ABI or container
toolkit compatibility. The whole GPU stack is therefore pinned: it only
changes when explicitly chosen, as a standalone step with verification.

## Pinned packages (`IgnorePkg` in /etc/pacman.conf)

| Package | Reason |
|---------|--------|
| `nvidia-open-dkms` | kernel module; changes ABI with each update, needs module rebuild + reboot |
| `nvidia-utils` | user-space driver libs (libcuda etc.) |
| `opencl-nvidia` | OpenCL runtime |
| `cuda` | host CUDA toolkit (13.x) |
| `libva-nvidia-driver` | VA-API over NVDEC (video) |
| `linux-firmware-nvidia` | GSP firmware + ucodes (gsp_ga10x.bin etc.) |
| `libnvidia-container` | docker GPU runtime lib |
| `nvidia-container-toolkit` | docker --gpus integration; must stay in lockstep with libnvidia-container |

History: the old `nvidia-580xx-*` entries were removed (2026-08) — the
580xx driver series is no longer installed and was legacy.

## Update flow (manual, deliberate)

1. Check what is pending for the GPU stack only:

```bash
sudo pacman -Qu | rg -i "nvidia|cuda|container-toolkit|firmware"
```

2. Update the GPU stack in isolation — never inside a full `-Syu`:

```bash
sudo pacman -Syu --ignore "nvidia-open-dkms,nvidia-utils,opencl-nvidia,cuda,libva-nvidia-driver,linux-firmware-nvidia,libnvidia-container,nvidia-container-toolkit"
# then upgrade the pinned stack — explicit `pacman -S` bypasses IgnorePkg
# (IgnorePkg only skips packages during -Syu / dependency resolution):
sudo pacman -S nvidia-open-dkms nvidia-utils opencl-nvidia cuda libva-nvidia-driver linux-firmware-nvidia libnvidia-container nvidia-container-toolkit
```

3. After a driver change (nvidia-open-dkms / nvidia-utils / firmware):

```bash
sudo dkms status          # confirm module rebuilt
sudo reboot               # kernel module ABI + GSP firmware load
```

4. Verify the stack:

```bash
nvidia-smi                # driver + GPU visible
docker run --rm --gpus all <cuda-image> nvidia-smi   # docker path works
```

5. Re-run the l3 regression if the sim stack is affected:

```bash
cd l3-dispatcher-planner && make regression [RUNS=1] [NO_VIDEO=1]
```

## Risks of NOT pinning (why the pin exists)

- Driver-kernel ABI mismatch: dkms module rebuild fails or doesn't match
  the running kernel → no GPU, docker `--gpus` dead.
- Container CUDA runtime vs host driver: containers carry their own CUDA
  runtime; a too-new/too-old host driver can break gsplat rendering.
- toolkit/libnvidia-container split updates → `docker run --gpus` errors.

## GSP notes

Driver 610.x on the 4070 Ti SUPER (Ada, ga10x) runs GSP firmware by
default (`NVreg_EnableGpuFirmware=1`, `/lib/firmware/nvidia/610.57.04/gsp_ga10x.bin`).
Keep it enabled: disabling loses error recovery / power management paths
with no perf gain; the CUDA compute path (gsplat) does not depend on GSP.

## Facts to check first (do not assume)

- Actual installed driver: `pacman -Q nvidia-open-dkms nvidia-utils`
- Current pin list: `grep IgnorePkg /etc/pacman.conf`
- GPU state: `nvidia-smi`
