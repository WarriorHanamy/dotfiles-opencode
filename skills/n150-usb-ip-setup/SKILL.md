---
name: n150-usb-ip-setup
description: Configure USB ethernet IP subnet between dev machine and N150 device. N150 runs Ubuntu 20.04 with netplan/NetworkManager; dev machine runs Arch Linux with systemd-networkd. Use when connecting to N150, changing subnet, or fixing USB link.
---

# N150 USB IP Setup

## Device Identities

| Role | Hostname | User | Password | USB Interface | MAC |
|---|---|---|---|---|---|
| N150 | n150 | dwl | (space) | enp2s0 | E0:51:D8:1A:2A:77 |
| Dev machine | (Arch) | rec | - | enp19s0f3u2 (altname enx00e04c261248) | 00:e0:4c:26:12:48 |

## IP Configuration

| Role | IP |
|---|---|
| N150 | 192.168.66.1/24 |
| Dev machine | 192.168.66.10/24 |
| Subnet | 192.168.66.0/24 |

## Persistence

### N150 side (netplan + NetworkManager)

File: `/etc/netplan/*.yaml`

```yaml
network:
  version: 2
  renderer: NetworkManager
  ethernets:
    enp2s0:
      dhcp4: no
      addresses:
        - 192.168.66.1/24
```

Apply:
```bash
sudo netplan apply
```

### Dev machine side (systemd-networkd)

File: `/etc/systemd/network/10-n150-usb.network`

```ini
[Match]
MACAddress=00:e0:4c:26:12:48

[Link]
RequiredForOnline=routable

[Network]
Address=192.168.66.10/24
```

Apply:
```bash
sudo networkctl reload
sudo networkctl reconfigure enp19s0f3u2
```

## Quick verification

```bash
# Ping N150
ping -c 3 192.168.66.1

# SSH to N150 (password is a single space)
sshpass -p " " ssh dwl@192.168.66.1

# Check link status
networkctl status enp19s0f3u2
```

## Temporary IP change (no persistence)

```bash
# Dev machine
sudo ip addr del <OLD_IP>/24 dev enp19s0f3u2
sudo ip addr add 192.168.66.10/24 dev enp19s0f3u2
```

## Troubleshooting

- After `netplan apply`, SSH drops immediately -- expected, reconnect via new IP.
- If systemd-networkd picks `20-ethernet.network` instead of `10-n150-usb.network`, run `sudo networkctl down enp19s0f3u2 && sudo networkctl up enp19s0f3u2`.
- The `10-` prefix ensures this file takes priority over the wildcard `20-ethernet.network` (first match wins in systemd-networkd).
