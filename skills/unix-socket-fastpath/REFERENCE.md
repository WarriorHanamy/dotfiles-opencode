# Reference: bridge protocol template + real-world failure table

## Protocol template (owner documents this in the layer contract)

```
socket dir (shared):  /dev/shm/lx-3dgs  (every container via ipc: host, ADR 0013)
frame:                4-byte LE length + payload
odom.sock  (l2 listens, renderer connects):
  payload = struct '<8d'   (t_sec, x, y, z, qx, qy, qz, qw)
image.sock (renderer listens, l2 connects):
  payload = struct '<BBHHId' (cam_id, kind, width, height, seq, t_sec) + raw
  kind 0 = rgb8 W*H*3, kind 1 = depth16 mm W*H*2
global.ply (renderer -> l2, static file, PointXYZ binary PLY):
  exported by the renderer right after model load; consumers wait for the
  file (tmpfs cleared on restart) and republish under real-sensor topic names
  (/cloud_registered, /global_pcd) so downstream makes no sim/real distinction.
```

Rule: the layer that owns the data format owns the protocol definition
(`AGENTS.md`); the other side implements it.

## Real-world failure table (l2-3dgs integration, 2026-08)

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| Bridge subscribes fine, never forwards | `accept()` blocked inside the rospy timer callback (1 s timeout per tick); `sendall` unreachable | accept loop in its own thread; timer only sends |
| Both sides "listen" on the same path, zero connections | Renderer unlinked the l2-created socket and bound its own; l2 kept accepting on a dead inode | One direction per socket; consumer connects |
| Consumer thread silently dead, no logs | `self.sock_path = sock_path` missing in `__init__` -> AttributeError in thread | Store all fields in `__init__`; wrap thread target to print tracebacks during bring-up |
| No renderer output in `docker logs` but process alive | Python stdout block-buffered on pipes | `print(..., flush=True)` or `functools.partial(print, flush=True)` |
| Health check permanently UNHEALTHY | socket file mtime never updates with traffic; `stat -c %Y` check invalid | Probe: connect + read one frame with timeout |
| Every diagnostic probe kills the stream | accept-loop replaced the client without closing the old one; single-consumer sockets hand the stream to the last connector | Close previous client on re-accept; consumers reconnect (~1 s retry) |
| `ps -C python3` shows no process while container is Up | `-C` matches comm name exactly; thread PIDs leak from `pgrep -f` on the script path | Use `ps aux | grep -F '[g]splat'` and `pgrep -f ... | head -1` carefully |
| `rostopic hz` silent in docker exec | exec shell lacks `ROS_PACKAGE_PATH`/devel setup (rospack fails) | Source noetic + devel + export `ROS_PACKAGE_PATH=/workspace/src` before ROS CLI |

## Startup race

Producer init may be slow (model/PLY load, 10-60 s). Consumers MUST retry in a
loop, not fail once. Producer binds its socket as late as model load allows —
or consumers just retry until it appears.

## Verification checklist (end-to-end)

1. `stat -c %i` socket file identical in both containers
2. probe consumer read succeeds on both directions
3. bridge threads alive (`/proc/<pid>/task/*/wchan`)
4. data-rate check on the consumed topic (e.g. `rostopic hz`)
5. health probe passes (connect + read, not mtime)
6. kill one side, confirm the other reconnects
