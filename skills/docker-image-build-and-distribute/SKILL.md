---
name: docker-image-build-and-distribute
description: Build and distribute Docker images across the R&D topology (Mac arm64 builder / rec-diff amd64 local / Jetson arm64 consumer) via the private arm64-only registry at 192.168.200.101:5000. Use when building images, pushing to the registry via mac-build delegation, pulling on the Jetson, or transferring images when the registry is unreachable.
---

# Image Build & Distribution (diff-dockers topology)

## Who builds what

Each arch builds **natively** on its own host. Never cross-compile with
buildx/qemu. The registry `192.168.200.101:5000` is **arm64-only**
(`specs/registry-arm64-only.spec.md`): only single-platform `linux/arm64`
images live there (an amd64 manifest in the registry is a defect).

| Arch | Built where | Why | Distribute via |
|------|-------------|-----|----------------|
| arm64 | Mac (Apple Silicon native) | Mac is arm64 | `mac-build.sh` -> rec-diff registry -> Jetson pull |
| amd64 | rec-diff (x86_64 native) | rec-diff is amd64 | local only (lx-sim) — never pushed to the registry |

Hosts (ZeroTier): Mac `192.168.200.102` (builder), rec-diff
`192.168.200.101` (mainstage + registry), Jetson (consumer).

## Build + push — the canonical path is `mac-build.sh` (rec-diff)

`scripts/mac-build.sh` in diff-dockers is the **reusable delegation
capability** (build-and-distribute.spec.md §4.1). It drives the Mac builder
clone from rec-diff: git sync -> `docker build` (layer-cached) -> `skopeo
copy` push. Never run per-project `make build` + `docker push` by hand.

```bash
# from rec-diff, in diff-dockers:
scripts/mac-build.sh --image <repo>       # build + push the layer image (all layers)
scripts/mac-build.sh --artifacts <repo>   # P2 (l3): build + compile + push artifacts data image
scripts/mac-build.sh --pull <repo>        # build only, dry check (no push)
```

`<repo>` = the project dir name (e.g. `l0-mid360-mavros-realsense-arm64`).

Why skopeo, never `docker push` (root cause, verified 2026-08-18): Docker
Desktop 29.x containerd image store + buildx provenance make `docker build`
export an OCI index with an in-toto attestation sub-manifest; `docker push`
then writes that index as `:latest` and a plain single-platform manifest can
never overwrite the tag afterwards. `skopeo copy` PUTs a plain
single-platform manifest onto the tag. **Mac `docker push` is forbidden.**

## Mac builder environment prerequisites

arm64 builds happen ENTIRELY on the Mac — including pulling base images.
Never pre-pull arm64 bases on rec-diff and ship them over; fix the Mac's
Docker Hub access instead. One-time setup:

1. **skopeo** — installed via Homebrew (`/opt/homebrew/bin/skopeo`),
   required for the push step.
2. **dockerd proxy (Docker Hub unreachable from CN network)** — mihomo
   (Clash Party) mixed-port `127.0.0.1:7890` runs on the Mac. Configure it
   via Docker Desktop GUI (Settings → Resources → Proxies → Manual →
   HTTP/HTTPS `http://127.0.0.1:7890` → Apply & Restart). Directly editing
   `~/Library/Group Containers/group.com.docker/settings-store.json` from an
   SSH session fails with TCC `Operation not permitted` — GUI is the only
   path.
3. **keychain/credsStore failure over SSH** — non-interactive SSH sessions
   cannot read the login keychain, and `docker pull/build` fails with
   "keychain cannot be accessed...". Fix: remove `credsStore` from
   `~/.docker/config.json` (keep the rest). The private registry is
   anonymous (no auth in its config.yml), so no credentials are lost.
4. **registry CA trust** — `~/.docker/certs.d/192.168.200.101:5000/ca.crt`
   (copy from `rec@rec-diff:~/diff-dockers/docker_registry/certs/ca.crt`).
   `skopeo copy` uses `--dest-tls-verify=false` (mac-build.sh), so the CA is
   only needed for docker CLI pulls.
5. PATH: Homebrew tools are at `/opt/homebrew/bin` (export in
   non-interactive shells).

## Pull on Jetson (containerd-native)

```bash
# on Jetson (diff@192.168.200.202 c5 / .201 j30), runtime store is k3s containerd:
sudo crictl rmi 192.168.200.101:5000/<repo>:latest    # invalidate stale cache
sudo crictl pull 192.168.200.101:5000/<repo>:latest
cd ~/vla_diff/lx-real-k8s && ./deploy-real.sh reset   # or kubectl rollout restart
```

`docker pull` works for the CLI path but does NOT populate the k8s store —
never use it as a pod pre-warm (container-standard.spec.md §4).

## Fallback (registry unreachable)

Bring-up only — use `docker save`/`scp`/`docker load`:

```bash
# builder (Mac):
docker save <repo>:latest | gzip > /tmp/<repo>.tar.gz
scp /tmp/<repo>.tar.gz diff@192.168.200.202:/tmp/    # ZeroTier

# Jetson:
gzip -dc /tmp/<repo>.tar.gz | docker load
```

## Verification

- Push success: `skopeo inspect --tls-verify=false
  docker://192.168.200.101:5000/<repo>:latest` shows a plain single-platform
  manifest (`Architecture: arm64`, no index/attestation entries).
- After pull on Jetson: `sudo crictl images | grep <repo>` shows the image;
  the repoDigest matches the registry digest.
- Topology and registry details live in `diff-dockers/AGENTS.md`
  (`Build topology` / `Canonical Push/Pull Paths`) and
  `specs/build-and-distribute.spec.md` (§4.1).
