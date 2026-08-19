---
name: zerotier-config-and-fix
description: Inspect, join, and troubleshoot ZeroTier networks on this host, including adding self-hosted moons (signed .moon worlds) for relay paths, diagnosing half-open tunnels (DIRECT peers but dead data plane), and fixing them (ufw 9993/udp, restart zerotier-one both sides). Use when user mentions zerotier, moon, orbit, peers DIRECT/RELAY, network join, tunnel half-open, node cannot NAT-punch, or when the private docker registry or an l* pod is unreachable with "no route to host".
---

# ZeroTier Config and Fix

This host (rec-arch) is a LEAF node (`d5985e38e4`) in network `3b19b3a7162c47f4` `rec-zerotier` (controller: `3b19b3a716`, auto-authorizes new nodes). Network IPv4 pool: `192.168.200.0/24` (nodes get `192.168.200.x`). This host's ZeroTier IP: `192.168.200.101/24` on `zttqhz7yhc`. Moons are required as RELAY paths because peers cannot always NAT-punch.

## Known nodes

| Node | ztaddr | ZT IP | LAN endpoint | Role/Notes |
|------|--------|-------|--------------|------------|
| rec-arch (this host) | `d5985e38e4` | 192.168.200.101/24 | 192.168.20.89 | LEAF |
| rec-mac | `9b439c3fcb` | 192.168.200.102/24 | 192.168.21.91 | LEAF, Mac mini |
| rec-pad | `8c3a3fbace` | 192.168.200.1/24 | 14.103.218.102 | MOON, tablet |
| diff-j30-backup | `fcf494ad8f` | 192.168.200.201/24 | 192.168.10.131 (WiFi) | LEAF, J30 backup host — SAME device as the Jetson (ZT IP 200.201); LAN fallback `ssh diff@192.168.10.131` (see "Jetson fallback path"); holds `J30V2-orange` key authorized on rec-diff for `rec@` (see "Jetson ↔ rec-diff passwordless SSH") |
| jetson-c5 | `62f50a806d` | 192.168.200.202/24 | 192.168.22.81 (WiFi `DiffRobot_5G`) | LEAF, Jetson C5 (hostname `jetson-c5`, login user `diff`); LAN fallback `ssh diff@192.168.22.81` (see "Jetson C5 fallback path"); rec-diff `~/.ssh/id_ed25519` authorized 2026-08-17 |
| controller | `3b19b3a716` | — | 35.209.108.188 | network controller, auto-authorizes |
| moon operator | `a40d1da253` | — | 180.184.176.190 | MOON, registered via `orbit` |
| b278f58fad | `b278f58fad` | — | RELAY (no path yet) | LEAF 1.14.2, unknown hostname |

Moons are required as RELAY paths because peers cannot always NAT-punch.

## SSH access over ZeroTier

sshd binds `0.0.0.0:22`, but UFW (default DROP) restricts 22 by rule; the `sshd-zerotier`
rules (`ufw allow from 192.168.200.0/24 ...` and `sshd-zerotier-200` for
`192.168.200.0/24`) cover ZeroTier SSH. If SSH over ZT stops working, re-check the
rules first (`sudo ufw status | grep -E '22|zerotier'`).

## Firewall: ufw MUST allow zerotier's 9993/udp

rec-diff runs ufw with `Default: deny (incoming)`. ZeroTier's control plane
(9993/udp, outgoing + established) survives that, but the **data plane** does
not: after a peer (e.g. the Jetson) reboots, its incoming 9993/udp packets are
NEW connections and ufw DROPs them. Symptom: both `peers` tables show the other
side DIRECT (control plane alive), yet ZT ping/SSH/registry traffic fails
`no route to host` — a tunnel half-open caused by the firewall, not by ZeroTier.

```bash
sudo ufw allow 9993/udp          # REQUIRED on rec-diff (verified 2026-08-16)
sudo ufw status | grep 9993
```

After adding the rule, restart zerotier-one on BOTH sides (see "Troubleshooting"
→ half-open) and re-check `peers` + a real ZT ping.

## Status and reading output

```bash
sudo zerotier-cli info          # node id, version, ONLINE
sudo zerotier-cli listnetworks  # nwid, name, status, assigned IPs
sudo zerotier-cli peers         # ztaddr ver role lat link lastTX lastRX path
```

- `link` column: `DIRECT` = NAT punched, `RELAY` = via root (planet/moon)
- `role`: `PLANET` official roots, `MOON` self-hosted roots, `LEAF` ordinary node
- `path`: remote endpoint IP:port of the last used path

## Add a moon (must relay)

Moon worlds are signed since 1.12; you need the operator's `.moon` file, not just an ID.

```bash
sudo mkdir -p /var/lib/zerotier-one/moons.d
sudo cp <skill_dir>/assets/<moon_id>.moon /var/lib/zerotier-one/moons.d/
sudo zerotier-cli orbit <moon_id> <moon_id>
```

Verify:

```bash
sudo zerotier-cli peers   # expect a MOON role row with low latency
sudo zerotier-cli listpeers 2>/dev/null || sudo zerotier-cli peers
```

Registered moons on this host: `a40d1da253` (`orbit a40d1da253 a40d1da253`, confirmed MOON role after `systemctl restart zerotier-one`).

If `orbit` rejects the world, check file signature/size and restart the service:

```bash
sudo systemctl restart zerotier-one
```

## Force relay through the moon

Both ends of the connection must orbit the same moon; a root relays packets only
between nodes that share it. After both sides orbit:

```bash
sudo zerotier-cli peers   # peer row should change RELAY path to the moon's IP:port
```

If the peer still relays via planet (9993), restart zerotier-one on both sides and
re-check; planets remain active roots alongside the moon.

## Jetson fallback path (WiFi LAN, no ZT)

The Jetson (`diff@192.168.200.201`, ZT) has a plain-LAN fallback that does
NOT depend on ZeroTier: **`ssh diff@192.168.10.131`**. rec-diff wlan0 is
`192.168.20.89/22` and the Jetson WiFi is `192.168.10.131/22` — reachable via
the default gateway `192.168.20.1` (different /22, not a same-subnet direct
link). The IP was `192.168.22.0` before 2026-08-16; it is DHCP-assigned, so
re-verify with `arp-scan` / `ping 192.168.10.131` if it changes again.

Jetson interface topology:

| Iface | Address | Purpose |
|-------|---------|---------|
| `wlP1p1s0` | `192.168.10.131/22` | WiFi management LAN (DHCP; was `192.168.22.0` pre-2026-08-16) — ZeroTier traffic theoretically exits here |
| `eno1` | `192.168.2.50/24` | **LiDAR link, NOT a network path** — never try to reach the Jetson via 192.168.2.x |
| `zttqhz7yhc` | `192.168.200.201/24` | ZeroTier overlay |

Fixed 2026-08-14 (previously degraded):

- Symptom: `ping 192.168.200.201` from rec-diff 100% loss, reverse also 100%
  loss — ZT tunnel half-open in BOTH directions. Both services healthy,
  rec-diff `peers` showed Jetson DIRECT via `192.168.10.131/56809`, but the
  Jetson's `peers` had NO row for rec-diff (`d5985e38e4`).
- Fix: `sudo systemctl restart zerotier-one` on BOTH hosts (rec-diff locally,
  Jetson via `ssh diff@192.168.10.131`). After ~15 s both `peers` tables show the
  other side DIRECT (rec-diff via `192.168.10.131/9993`, Jetson via
  `192.168.20.89/9993`); pings then 0% loss both directions; registry
  `https://192.168.200.101:5000/v2/` reachable from Jetson over ZT.
- Bonus: controller row (`3b19b3a716`) went from RELAY (no path) to DIRECT after
  the restart.
- Verified 2026-08-16: Jetson WiFi IP moved to `192.168.10.131` (DHCP);
  rec-diff `ping 192.168.200.201` showed Destination Host Unreachable (ARP
  INCOMPLETE on `zttqhz7yhc`), ZT peers still DIRECT with growing counters.
  Found the new IP via the k8s NODE column (`kubectl get pods -o wide`) /
  ZT peer `path` `192.168.10.131/9993`. Restarting zerotier-one on BOTH
  sides restored the tunnel in ~10 s.

Rule: when ZT to 200.201 is down, use `ssh diff@192.168.10.131` for all
management. Caveats: the docker registry (`192.168.200.101:5000`) has no TLS
SAN for the wlan0 IP (192.168.20.89), so image pulls do NOT work over the
LAN fallback — ZT must be restored for registry traffic (or re-issue certs).
Note the LAN path is management-only and does NOT exercise the ZT data plane;
a ZT failure that survives `ssh diff@192.168.10.131` connectivity is a pure
tunnel/firewall problem (see "Firewall: ufw MUST allow zerotier's 9993/udp"
and Troubleshooting).

## Jetson C5 fallback path (WiFi LAN, no ZT)

The Jetson C5 (`jetson-c5`, ZT `192.168.200.202`) has a plain-LAN fallback that
does NOT depend on ZeroTier: **`ssh diff@192.168.22.81`** (passwordless, key
auth configured 2026-08-17). Its WiFi SSID is `DiffRobot_5G` (5 GHz ch52). The
LAN IP `192.168.22.81/22` shares the `192.168.20.0/22` subnet with rec-diff
wlan0 (`192.168.20.89/22`) and the same default gateway `192.168.20.1`, so it
is directly reachable without routing. It is DHCP-assigned; re-verify with
`arp-scan -l -I wlan0` / `ping 192.168.22.81` if it changes.

Jetson C5 interface topology:

| Iface | Address | Purpose |
|-------|---------|---------|
| `wlP1p1s0` | `192.168.22.81/22` | WiFi management LAN (DHCP, SSID `DiffRobot_5G`) — ZeroTier traffic exits here |
| `l4tbr0` | `192.168.55.1/24` | USB device-mode bridge (down), like the V25 Jetson |
| `zttqhz7yhc` | `192.168.200.202/24` | ZeroTier overlay |

Verified 2026-08-17: ZT peer `62f50a806d` DIRECT via `192.168.22.81/35001`,
`ping 192.168.200.202` 0% loss; LAN ping to 192.168.22.81 0% loss.

## Jetson ↔ rec-diff passwordless SSH

Bidirectional key auth (all keys ed25519, no passphrase):

| Direction | Command | Key |
|-----------|---------|-----|
| rec-diff → Jetson | `ssh diff@192.168.200.201` (ZT) / `ssh diff@192.168.10.131` (LAN) | rec-diff `~/.ssh/id_ed25519` → Jetson `~diff/.ssh/authorized_keys` |
| Jetson → rec-diff | `ssh rec@192.168.200.101` (ZT) / `ssh rec@192.168.20.89` (LAN) | Jetson `~diff/.ssh/id_ed25519` (`J30V2-orange`) → rec-diff `~rec/.ssh/authorized_keys` |

Configured 2026-08-14. Jetson-side gotcha: `~diff/.ssh/known_hosts` was
`root:root` (image leftover, mtime 1970) so ssh could not write host keys —
ssh still connects but warns "Failed to add the host"; fix is
`sudo chown diff:diff ~/.ssh/known_hosts ~/.ssh/known_hosts.old`.

## Troubleshooting

- Peer missing from `peers`: not on the same network or controller has not authorized it
- `lastRX` growing on a peer row: path stale, likely NAT change; restart zerotier-one
- All peers `RELAY` via planet: moon not installed/verified on one side, or moon down
- Network shows `ACCESS_DENIED` / `REQUESTING_CONFIGURATION`: newly joined node not
  yet authorized. The controller auto-authorizes, but the node must be restarted to
  pick it up: `sudo systemctl restart zerotier-one`, then poll `zerotier-cli listnetworks`
  until `OK` and the IPv4 appears (takes up to ~30 s). No controller-side access is needed.
- Both sides show `listnetworks OK` but ZT pings fail in both directions AND one
  side's `peers` table is missing the other's row (e.g. Jetson missing rec-diff):
  tunnel half-open, session never established. Restart zerotier-one on both hosts
  and re-check `peers`; while degraded, use the Jetson LAN fallback
  (`ssh diff@192.168.10.131`, WiFi DHCP — see above).
  (Verified 2026-08-14: dual restart alone restored the link, 0% loss in ~15 s,
  no moon/orbit changes needed.)
- Both sides show the other DIRECT with counters growing, but ZT ping/SSH/
  registry STILL fail (`no route to host`) — **check rec-diff ufw for 9993/udp
  first**. This is the firewall-data-plane case (verified 2026-08-16): after a
  Jetson reboot, its incoming 9993/udp packets are NEW and rec-diff's ufw
  `deny (incoming)` DROPs them, so the control plane (outgoing + established)
  stays alive but the data plane dies. Fix:
  1. `sudo ufw allow 9993/udp` on rec-diff
  2. restart zerotier-one on BOTH hosts
  3. verify with a real ZT ping (`ping 192.168.200.201`) and registry probe
     (`curl -k https://192.168.200.101:5000/v2/` from the Jetson)
  4. roll any affected l* deployment (`kubectl rollout restart -n lx-real <dep>`)
     — an `ImagePullBackOff` with `no route to host` in its events is a NETWORK
     symptom, not a registry CA problem (see specs/registry-ca-trust.spec.md:
     `docker pull` is the single truth test; bare `ctr` TLS errors are expected).

## Registry reachability over ZT (Jetson)

The docker registry `192.168.200.101:5000` is reachable over ZT only. If the
Jetson can't pull (`no route to host` in pod events), it is a ZeroTier data-plane
problem, not a CA problem — restore the tunnel (above), then
`kubectl rollout restart -n lx-real <dep>`. Diagnostic ordering:
`ping 192.168.200.201` → `ssh diff@192.168.200.201` → `curl -k
https://192.168.200.101:5000/v2/` on the Jetson → `docker pull` (single truth
test, cri-dockerd shares docker's store). See `specs/registry-ca-trust.spec.md`.

## Asset location

The operator-provided moon file goes in `assets/<moon_id>.moon` inside this skill
directory so it is tracked with the skill.
