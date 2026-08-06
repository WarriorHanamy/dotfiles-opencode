---
name: zerotier-config
description: Inspect, join, and troubleshoot ZeroTier networks on this host, including adding self-hosted moons (signed .moon worlds) for relay paths. Use when user mentions zerotier, moon, orbit, peers DIRECT/RELAY, network join, or when a node cannot NAT-punch and must relay through a moon.
---

# ZeroTier Config

This host (rec-arch) is a LEAF node (`9b439c3fcb`) in network `3b19b3a7162c47f4` (controller: `3b19b3a716`, a remote GCP node). Network default IPv4 pool: `192.168.199.0/24` (nodes get `192.168.199.x`). This host's ZeroTier IP: `192.168.199.102/24` on `feth3854`. Peer `d5985e38e4` holds `192.168.199.101`. Moon `a40d1da253` is installed/orbited; moons are required as RELAY paths because peers cannot always NAT-punch. macOS host: moons live in `/Library/Application Support/ZeroTier/One/moons.d/`, service is `com.zerotier.one` (launchd).

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

## Force DIRECT path down (test DIRECT->RELAY fallback)

ZeroTier only drops to RELAY after the direct path is truly dead (UDP port
9993 to the peer stops answering). While a direct path still responds it stays
DIRECT by design. To test the automatic fallback, block outbound UDP 9993 to
the peer's direct IP with pf. Scope the rule to the peer's IP only - never
block all UDP 9993, or the moon/planet roots die too and relay is lost.

```bash
# 1. Enable pf (idempotent; keeps existing rules intact)
sudo pfctl -e

# 2. Read the peer's DIRECT path IP from `sudo zerotier-cli peers`
#    (the `path` column of a DIRECT row, e.g. 192.168.20.89)
PEER_IP=192.168.20.89

# 3. Drop outbound UDP 9993 to that peer only
echo "block out proto udp to $PEER_IP port 9993" \
  | sudo pfctl -a "com.zerotier.test" -f -

# 4. Verify the rule is active
sudo pfctl -a "com.zerotier.test" -sr

# 5. Watch the fallback: link should flip DIRECT -> RELAY within seconds
sudo zerotier-cli peers

# 6. Restore: flush the anchor and reload the default pf config
sudo pfctl -a "com.zerotier.test" -F all
sudo pfctl -f /etc/pf.conf
```

Notes:
- The fallback is automatic and self-healing: once the direct path truly dies
  (e.g. after a network/WiFi change) ZeroTier drops to RELAY via the moon on
  its own; no config is needed. It will go back to DIRECT when NAT-punching
  succeeds again.
- The DIRECT->RELAY switch is NOT zero-loss: there is a short detection window
  (seconds) during which connectivity may blip. This is a 1.x design limit.
- Restarting the service (`sudo launchctl kickstart -k system/com.zerotier.one`)
  clears cached peer paths and forces a fresh path decision.
- On Linux the equivalent is a firewall rule dropping UDP 9993 to the peer IP.

## Troubleshooting

- Peer missing from `peers`: not on the same network or controller has not authorized it
- `lastRX` growing on a peer row: path stale, likely NAT change; restart zerotier-one
- All peers `RELAY` via planet: moon not installed/verified on one side, or moon down
- Network shows `ACCESS_DENIED`: controller allowlist missing this node's `d5985e38e4`

## Asset location

The operator-provided moon file goes in `assets/<moon_id>.moon` inside this skill
directory so it is tracked with the skill.
