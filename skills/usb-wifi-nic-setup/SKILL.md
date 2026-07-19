---
name: usb-wifi-nic-setup
description: Use when a USB WiFi dongle (Ugreen/aicsemi/Realtek/MediaTek) is plugged into Arch Linux but shows no wlan interface, appears as a tiny USB flash disk, or its interface name drifts (wlan1/wlan2/wlan3) across replugs, or when isolating a second WiFi NIC from the main default route.
---

# USB WiFi NIC Fast Setup (Arch + iwd + systemd-networkd)

## Overview

Consumer USB WiFi dongles boot as a 4MB "USB flash disk" (Windows driver payload). They need a mode-switch to expose the WiFi function, a (often DKMS) driver, then stable naming and route isolation. Verified path below is for Ugreen AIC8800D80 (AX900) but the flow generalizes.

## Fast Path

1. **Identify**: `lsusb` + `ip link`. Flash-disk mode signature: tiny vfat `sdX` with `Setup.exe`, no new wlan.
   - Ugreen AIC8800D80: storage mode `a69c:5724 "Aic MSC"` → WiFi mode `368b:8d88` (or `a69c:8d80` "AIC Wlan").
2. **Mode-switch**: `sudo pacman -S usb_modeswitch`, then `sudo eject /dev/sdX` (or `usb_modeswitch -v <vid> -p <pid> -K`). Re-check `lsusb` for the WiFi-mode ID.
3. **Driver**: check `modinfo <mod>`; for AIC8800 USB use AUR `aic8800d80-wifi-bt-git-dkms` (yay). Verify `dkms status` shows installed for the **running** kernel, then `modprobe aic_load_fw && modprobe aic8800_fdrv`. wlan interface appears in dmesg.
4. **Auto-switch on plug**: module aliases may not cover the vendor ID (`modinfo ... | grep alias`). Add udev rules:

   ```
   ACTION=="add", SUBSYSTEM=="usb", ATTR{idVendor}=="a69c", ATTR{idProduct}=="5724", RUN+="/usr/bin/usb_modeswitch -v a69c -p 5724 -K"
   ACTION=="add", SUBSYSTEM=="usb", ATTR{idVendor}=="a69c", ATTR{idProduct}=="8d80", RUN+="/usr/sbin/modprobe aic_load_fw", RUN+="/usr/sbin/modprobe aic8800_fdrv"
   ```

5. **Connect (iwd)**: write `/var/lib/iwd/<SSID>.psk` with `[Security]` + `Passphrase=...` (chmod 600), then `iwctl station <dev> scan` / `connect <SSID>`.
6. **Isolate from main NIC (no default-route steal)**: systemd-networkd `.network` matched by MAC, `RouteMetric=700`, `UseDNS=no`. **First lexical match wins** — name it `15-*.network` to beat the stock `20-wlan.network` (`Name=wl*`).
7. **Pin interface name**: iwd's `/usr/lib/systemd/network/80-iwd.link` forces `NamePolicy=keep kernel` → kernel names drift. Override with earlier-sorting `/etc/systemd/network/10-*.link`: `[Match] MACAddress=xx` + `[Link] Name=wlan1`.

## Gotchas (all observed)

- **Driver creates TWO managed interfaces** with related MACs (e.g. permanent `6c:1f...` and LA-bit variant `6a:1f...`); count varies per plug. Pin **both** MACs to fixed names (wlan1/wlan2) and match both in the `.network` file.
- **Name drift cause**: driver removes/re-adds netdevs at load; each recreation grabs the next free wlanX. Fixed by MAC-matched `.link` files, not by hoping.
- **iwd autoconnects ANY known SSID on the new NIC** (e.g. office SSID saved for wlan0) — there is no per-device SSID binding. High route metric makes this harmless; check `iw dev <dev> link` right after driver load.
- **mkinitcpio "module not found: nvidia"** error during DKMS install is a preexisting unrelated issue if it only fails for a non-running kernel; verify with `dkms status` instead of panicking.
- Running kernel vs installed `linux-headers` mismatch: DKMS builds for whatever `/usr/lib/modules/*` exists; confirm the running `uname -r` entry.

## Test Cycle (no physical replug needed)

```bash
USBDEV=$(basename $(readlink -f /sys/class/net/<wlanX>/device/..))
echo 0 | sudo tee /sys/bus/usb/devices/$USBDEV/authorized
sleep 2; echo 1 | sudo tee /sys/bus/usb/devices/$USBDEV/authorized
sleep 15  # then verify: lsusb mode ID, interface name, iwd reconnected, route metric
```

## Verify

- `ip route show default` — new NIC must have the worst metric; main NICs unchanged.
- `ping -I <wlanX> <gateway>` works; `curl --interface <wlanX> ifconfig.me` reflects that network (may have no internet — fine for device routers).
- `networkctl status <wlanX>` shows the intended custom Network File matched.
