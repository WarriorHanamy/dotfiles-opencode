---
name: unix-socket-fastpath
description: Design and debug unix-socket IPC between containers/processes (length-prefixed frame protocol, producer-listener/consumer-connect pattern). Use when wiring socket bridges, debugging silent socket failures (no data, stuck threads, health checks), or reviewing socket bridge code — covers frame format, accept-loop pitfalls, log buffering, and fast diagnosis.
---

# Unix Socket Fast-Path

Fast-path practice for unix-socket IPC between containers/processes, distilled
from real l2-3dgs <-> l2-uav-simulator bridge debugging.

## Quick start (correct pattern)

- **One socket per direction**; the DATA SOURCE listens, the consumer connects.
  Never have both sides listen on the same path (second bind unlinks the first —
  the first side then waits forever on a dead inode).
- Frame: `4-byte little-endian length + payload`; fixed `struct` header
  (`'<BBHHId'` etc.) + raw bytes. Length-prefixed framing is mandatory —
  SOCK_STREAM has no message boundaries.
- Share the socket directory via the IPC namespace (lx ADR 0013): all
  containers run `ipc: host`, sockets live in `/dev/shm/<app>/` — visible to
  every container without any bind mount or volume.
- Put `accept()` in its OWN thread, never inside a timer callback or the send
  loop: a blocking accept stalls the sender (classic: odom bridge that
  subscribes fine but never forwards).
- Accept-loop must close the previous client when accepting a new one, or
  probes/consumers silently steal the connection.

## Fast-path diagnosis (when data does not flow)

Order matters — cheapest first:

1. **Verify the socket file is shared**: `stat -c %i` on both sides must match.
2. **Probe as a consumer** (fastest isolation step):
   `python3 scripts/socket_probe.py /dev/shm/lx-3dgs/odom.sock`
   - connect OK + frame read  -> socket layer fine, problem is in the
     framework/consumer node
   - connect OK + no data     -> producer listen side stuck (see accept-loop
     pitfall) or not sending
   - connect refused          -> producer not yet listening (startup race) or
     wrong path/inode
3. **Never trust container logs for Python**: stdout is block-buffered on
   pipes. Add `flush=True` (or `functools.partial(print, flush=True)`) and
   prefer `print` over `rospy.loginfo` when the ROS log path itself is in
   question. `docker logs --since 2m` + grep is the window to check.
4. **Check the thread is actually alive**:
   `cat /proc/<pid>/task/*/wchan` — `poll_schedule_timeout` = blocked recv
   (ok), thread absent = dead. A dead daemon thread is silent: add stderr
   prints in the thread entry to see the traceback.
5. **AttributeError-in-thread trap**: a missing `self.sock_path = sock_path`
   in `__init__` kills the loop thread instantly with no visible error.
   Wrap thread targets in try/except that prints, during bring-up.
6. **Health checks cannot use socket mtime** — it never updates with traffic.
   Probe the stream: connect + read one frame (see `socket_probe.py`), not
   `stat -c %Y`.
7. **Probes steal the connection**: single-consumer sockets hand the stream to
   whoever connects last. Run probes quickly; production consumers must
   reconnect (retry loop, ~1s) — that is the resilience contract.
8. **/dev/shm is tmpfs**: cleared on container/host restart. Consumers MUST
   retry-connect (never fail once); producers bind after slow init (model
   load). Socket file mtime is useless for liveness — probe the stream.

## Workflows

### Design review checklist (before writing bridge code)

- [ ] data source listens, consumer connects (one direction per socket)
- [ ] length-prefixed framing, fixed struct header, documented protocol owner
- [ ] accept() in its own thread; close previous client on re-accept
- [ ] send side never blocks on accept; drop frame if no consumer (never queue)
- [ ] consumer reconnect loop with backoff; producer binds after slow init
      (e.g. model load) — consumers must retry, not fail once
- [ ] all prints `flush=True`; thread entry wrapped to surface tracebacks
- [ ] health probe = connect + read frame, with timeout

### Debugging sequence for "topic/topic data missing"

1. Probe both sockets as consumer (isolation: socket vs framework).
2. Confirm thread liveness of bridge loops (`/proc/<pid>/task/*/wchan`).
3. Add stderr prints (`flush=True`) at connect/send/receive boundaries.
4. Check producer accept-loop behavior and consumer reconnect timing.
5. Verify inode match across containers after any container restart.

## Reference

- See [REFERENCE.md](REFERENCE.md) for the full bridge protocol template and
  the real-world failure table from l2-3dgs integration.
- Probe script: [scripts/socket_probe.py](scripts/socket_probe.py)
