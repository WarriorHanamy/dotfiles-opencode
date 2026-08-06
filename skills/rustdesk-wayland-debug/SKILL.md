---
name: rustdesk-wayland-debug
description: Debug and fix RustDesk remote-control problems on Wayland Linux (Hyprland/sway/uwsm sessions): screen capture failures, mouse/keyboard injection not working, uinput IPC missing, RemoteDesktop portal unavailable, black screen. Use when a RustDesk client/server on Wayland has broken capture, broken input, "XDG Desktop Portal unavailable" errors, or input works but screen is black (or vice versa).
---

# RustDesk Wayland Debug

Fix RustDesk 1.4.x remote-control on Wayland desktops (Hyprland, sway, uwsm/sddm-managed sessions). The two capabilities — **screen capture** and **keyboard/mouse injection** — use different backends and can break independently.

## Core architecture (RustDesk 1.4.x on Linux Wayland)

| Capability | Backend when `--server` (is_server_running=true) | Backend otherwise |
|---|---|---|
| Screen capture | xdg-desktop-portal ScreenCast (hyprland portal) | RemoteDesktop portal (input) |
| Input injection | **uinput** over IPC sockets from root `--service` | RemoteDesktop portal |

Key facts:
- `is_server_running()` = `ps aux | grep "rustdesk --server"` matches. TRUE → capture via ScreenCast + input via uinput. FALSE → both via RemoteDesktop portal.
- uinput IPC sockets are created by the **root `--service`** process (rustdesk.service) in `/tmp/RustDesk-service/`:
  - `ipc_uinput_keyboard`, `ipc_uinput_mouse`, `ipc_uinput_control`, `ipc_service`
- `RUSTDESK_FORCED_DISPLAY_SERVER=x11` forces X11 path: input works (XTEST) but capture is **black** because Hyprland composites at the Wayland layer and Xwayland root window is empty. Do NOT use this for full remote control.
- Screens are captured through `xdg-desktop-portal-hyprland` which only implements `ScreenCast`, `Screenshot`, `GlobalShortcuts`. It has **no RemoteDesktop** (upstream never implemented it; neither does xdg-desktop-portal-wlr).

## Symptom → cause table

| Symptom | Likely cause | Fix |
|---|---|---|
| "XDG Desktop Portal unavailable / screen capture failed" | RustDesk called `org.freedesktop.portal.RemoteDesktop` which no installed portal implements; or main xdg-desktop-portal crashed (empty session token assert in xdp-session.c) | See "Portal issues" below |
| Screen capture works, mouse/keyboard dead | uinput IPC sockets missing (root `--service` not providing them) | See "uinput fix" below |
| Input works (XTEST), screen is BLACK | `RUSTDESK_FORCED_DISPLAY_SERVER=x11` forced | Remove it; use Wayland path |
| RustDesk server killed/restarted by root service | `--service` lifecycle `pkill`s externally-managed `--server` | See "service isolation" below |
| `Failed scrap No such file or directory (os error 2)` at src/server.rs:604 (setup_uinput) | server can't connect to uinput IPC | uinput fix |
| Portal error `xdp_session_initable_init: assertion failed (session->token != NULL)` | client sent a session request with empty token → portal ABRT | Restart portal; usually a RustDesk/portal compat quirk, not user-fixable |

## Quick diagnostic sequence

```bash
# 1. Is screen capture backend OK?
ssh HOST 'grep -iE "ScreenCast|Failed scrap|RemoteDesktop|portal" /home/$USER/.local/share/logs/RustDesk/server/rustdesk_rCURRENT.log | tail'

# 2. Are uinput sockets actually present? (DIR MUST be read as root - perms hide them!)
ssh HOST 'sudo ls -la /tmp/RustDesk-service/ | grep uinput'

# 3. Is root --service running and is user --server running?
ssh HOST 'systemctl is-active rustdesk.service; systemctl --user is-active rustdesk-server.service'

# 4. Server logs for uinput creation
ssh HOST 'grep -iE "UInput keyboard created|UInput mouse created" /home/$USER/.local/share/logs/RustDesk/server/rustdesk_rCURRENT.log'

# 5. Client config points at right rendezvous server? (Mac client: ~/Library/Preferences/com.carriez.RustDesk/)
```

**CRITICAL trap**: `/tmp/RustDesk-service/` has mode `drwx--x--x` (root only). As an unprivileged user you see it EMPTY even when sockets exist. Always check with `sudo ls` before concluding uinput is missing.

## uinput fix (screen capture OK + input dead)

Requirements:
1. `/dev/uinput` readable/writable by the `--service` root process (it is by default). If the remote user also needs it, add udev rule:
   ```
   KERNEL=="uinput", GROUP="input", MODE="0660"
   ```
   then `sudo udevadm control --reload-rules && sudo udevadm trigger`.

2. Root `--service` must create the uinput IPC sockets. On stock Arch the `rustdesk.service` unit runs `rustdesk --service` as root and works — BUT on uwsm/sddm Hyprland sessions it ALSO tries to manage desktop `--server` processes and can fail/loop. See "service isolation".

3. User `--server` (systemd user unit) should wait for the uinput sockets before starting:
   ```ini
   [Unit]
   Description=RustDesk Wayland Server (portal capture + uinput)
   After=graphical-session.target pipewire.service
   PartOf=graphical-session.target

   [Service]
   Type=simple
   ExecStartPre=/bin/sh -c 'n=0; while [ ! -S /tmp/RustDesk-service/ipc_uinput_keyboard ] || [ ! -S /tmp/RustDesk-service/ipc_uinput_mouse ] || [ ! -S /tmp/RustDesk-service/ipc_uinput_control ]; do n=$((n+1)); [ "$n" -ge 60 ] && exit 1; sleep 0.25; done'
   ExecStart=/usr/bin/rustdesk --server
   Restart=always
   RestartSec=5
   Environment="PULSE_LATENCY_MSEC=60" "PIPEWIRE_LATENCY=1024/48000"
   Environment="DISPLAY=:0" "WAYLAND_DISPLAY=wayland-1"
   Environment="XDG_CURRENT_DESKTOP=Hyprland" "XDG_SESSION_TYPE=wayland"

   [Install]
   WantedBy=default.target
   ```
   Install: `systemctl --user daemon-reload && systemctl --user enable --now rustdesk-server.service`.

## service isolation (root service killing user server)

RustDesk 1.4.9 `--service` lifecycle calls `stop_rustdesk_servers()` (`pkill rustdesk --server`) and tries to fork its own server via `sudo -E -u rec rustdesk --server`, which fails with "DISPLAY environment variable is empty" on Hyprland (its desktop detection misses the rootless-Xwayland branch). Fix: run the root service inside a private mount namespace that **masks `ps` and `sudo`** so it can't see/kill the user server nor spawn its own.

`/etc/systemd/system/rustdesk.service.d/override.conf`:
```ini
[Service]
Environment="PULSE_LATENCY_MSEC=60" "PIPEWIRE_LATENCY=1024/48000"
UnsetEnvironment=RUSTDESK_FORCED_DISPLAY_SERVER
ExecStart=
ExecStart=/usr/bin/unshare --mount /usr/local/lib/rustdesk-uinput-service
ExecStop=
```

`/usr/local/lib/rustdesk-uinput-service` (chmod 0755):
```sh
#!/bin/sh
set -eu

# RustDesk 1.4.9's privileged service also manages desktop --server processes.
# Keep loginctl available because IPC authorization checks the active seat UID.
# Prevent the service loop from spawning its own competing desktop server.
mount --bind /usr/bin/false /usr/bin/sudo
mount --bind /usr/bin/true /usr/bin/ps
exec /usr/bin/rustdesk --service
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rustdesk.service
systemctl --user restart rustdesk-server.service
```

Note: `unshare --mount` (no `--pid`) keeps host PID visibility and `loginctl` — RustDesk 1.4.9 requires these for uinput IPC peer authorization (`get_active_userid_fresh` checks seat0). Masking `ps`/`sudo` in the private mount ns is enough.

## Portal issues

- If `xdg-desktop-portal` main process ABRTs with `xdp_session_initable_init: assertion failed (session->token != NULL)`, restart it:
  ```bash
  systemctl --user restart xdg-desktop-portal xdg-desktop-portal-hyprland xdg-desktop-portal-gtk
  ```
- Verify the ScreenCast interface is actually reachable:
  ```bash
  gdbus call --session --dest org.freedesktop.portal.Desktop --object-path /org/freedesktop/portal/desktop \
    --method org.freedesktop.portal.ScreenCast.CreateSession "{'handle_token': <'x'>, 'session_handle_token': <'y'>}"
  ```
- Do NOT try to "fix" missing RemoteDesktop by installing xdg-desktop-portal-wlr or a git build of hyprland portal — neither implements RemoteDesktop. If uinput is unavailable, there is no input path on pure Wayland for RustDesk 1.4.x.

## Self-hosted relay notes (hbbs/hbbr)

- Fix stale relay IP: edit `/etc/systemd/system/rustdesk-server-hbbs.service.d/override.conf`:
  ```ini
  [Service]
  ExecStart=
  ExecStart=/usr/bin/rustdesk-server-hbbs --relay-servers <NEW_IP>:21117
  ```
  `sudo systemctl daemon-reload && sudo systemctl restart rustdesk-server-hbbs`. Verify with `journalctl -u rustdesk-server-hbbs | grep relay-servers`.
- hbbs DB of registered peers: `sudo sqlite3 /var/lib/rustdesk-server/db_v2.sqlite3 "SELECT id FROM peer;"`. A client re-registers under a NEW ID when it switches rendezvous servers — old ID stops working.
- Client server config (Linux): `~/.config/rustdesk/RustDesk2.toml` `[options]`:
  ```toml
  [options]
  custom-rendezvous-server = '<IP>:21116'
  relay-server = '<IP>:21117'
  key = '<hbbs public key from journalctl: "Key: ...">'
  ```
  The top-level `rendezvous_server =` field gets overwritten by the app; set `custom-rendezvous-server` under `[options]`. On macOS client the same fields live in `~/Library/Preferences/com.carriez.RustDesk/RustDesk.toml` and `RustDesk2.toml`.
- Set a persistent connection password headlessly: `sudo DISPLAY=:0 WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000 /usr/bin/rustdesk --password 'PASS'` (needs root).

## Verification

```bash
ssh HOST 'grep -iE "UInput keyboard created|UInput mouse created" /home/$USER/.local/share/logs/RustDesk/server/rustdesk_rCURRENT.log'
ssh HOST 'sudo ls /tmp/RustDesk-service/ | grep uinput'   # all 3 sockets
ssh HOST 'sudo lsof -p $(systemctl show rustdesk.service -p MainPID --value) | grep uinput'  # 2 writable fds
systemctl --user is-active rustdesk-server.service         # active
systemctl is-active rustdesk.service                       # active (root helper)
```

Success = root helper holds writable `/dev/uinput` fds, server log shows `UInput keyboard created` / `UInput mouse created`, and ScreenCast portal shows "Sharing initialized". Then connect from the client and move mouse / type.
