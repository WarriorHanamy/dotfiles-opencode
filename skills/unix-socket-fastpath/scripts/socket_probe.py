#!/usr/bin/env python3
"""Unix-socket stream probe: connect as a consumer and read one frame.

Fast-path check for socket bridges. Exit 0 = connect OK + frame received.
Usage: socket_probe.py <socket_path> [--timeout 3] [--expect-odom|--expect-image]
"""

import argparse
import struct
import sys

ODOM_FMT = struct.Struct("<8d")
IMG_HDR = struct.Struct("<BBHHId")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sock_path")
    ap.add_argument("--timeout", type=float, default=3.0)
    ap.add_argument("--expect", choices=["odom", "image"])
    args = ap.parse_args()

    import socket

    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(args.timeout)
    try:
        s.connect(args.sock_path)
        print(f"connect OK: {args.sock_path}", flush=True)
        hdr = s.recv(4)
        if len(hdr) != 4:
            print("ERROR: no frame within timeout (producer not sending?)", flush=True)
            return 1
        (n,) = struct.unpack("<I", hdr)
        data = s.recv(n)
        if len(data) != n:
            print(f"ERROR: short frame {len(data)}/{n}", flush=True)
            return 1
        print(f"frame: {n} bytes", flush=True)
        if args.expect == "odom":
            t, x, y, z, qx, qy, qz, qw = ODOM_FMT.unpack(data)
            print(f"odom t={t:.3f} pos=({x:.3f},{y:.3f},{z:.3f})", flush=True)
        elif args.expect == "image":
            cam, kind, w, h, seq, t = IMG_HDR.unpack_from(data, 0)
            print(f"image cam{cam} kind{kind} {w}x{h} seq={seq}", flush=True)
        return 0
    except socket.timeout:
        print("ERROR: connect/recv timeout (producer listening?)", flush=True)
        return 1
    except OSError as e:
        print(f"ERROR: {e}", flush=True)
        return 1
    finally:
        s.close()


if __name__ == "__main__":
    sys.exit(main())
