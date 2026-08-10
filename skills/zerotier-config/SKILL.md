---
name: zerotier-config
description: Inspect, join, and troubleshoot ZeroTier networks on this host, including adding self-hosted moons (signed .moon worlds) for relay paths. Use when user mentions zerotier, moon, orbit, peers DIRECT/RELAY, network join, or when a node cannot NAT-punch and must relay through a moon.
---

# ZeroTier Config

This host (rec-arch) is a LEAF node (`d5985e38e4`) in network `3b19b3a7162c47f4` (controller: `3b19b3a716`, a remote GCP node). Network default IPv4 pool: `192.168.199.0/24` (nodes get `192.168.199.x`). This host's ZeroTier IP: `192.168.199.101/24` on `zttqhz7yhc`. Moons are required as RELAY paths because peers cannot always NAT-punch.

Known peers: moon `a40d1da253` (operator, 180.184.176.190, registered via `orbit`), `9b439c3fcb` (192.168.21.91).

## SSH access over ZeroTier

sshd binds `0.0.0.0:22`, but UFW (default DROP) only allows 22 from `192.168.199.0/24` because of the `sshd-zerotier` rule (`ufw allow from 192.168.199.0/24 to any port 22 proto tcp comment 'sshd-zerotier'`). If SSH over ZT stops working, re-check this rule first (`sudo ufw status | grep zerotier`).

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

## Troubleshooting

- Peer missing from `peers`: not on the same network or controller has not authorized it
- `lastRX` growing on a peer row: path stale, likely NAT change; restart zerotier-one
- All peers `RELAY` via planet: moon not installed/verified on one side, or moon down
- Network shows `ACCESS_DENIED`: controller allowlist missing this node's `d5985e38e4`

## Asset location

The operator-provided moon file goes in `assets/<moon_id>.moon` inside this skill
directory so it is tracked with the skill.
