#!/usr/bin/env bash
# Verify every mermaid block in a markdown file compiles with mmdc.
# Usage: verify.sh <file.md>
set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "usage: $0 <file.md>" >&2
    exit 2
fi
file="$1"
tmpdir="$(mktemp -d /tmp/opencode/mmd-verify.XXXXXX)"
trap 'rm -rf "$tmpdir"' EXIT

# awk writes each ```mermaid block to $tmpdir/diag<N>.mmd (direct file writes,
# NOT stdout - a `while read` over process substitution would see no output).
awk '
    BEGIN { c = 0; f = "" }
    /^```mermaid/ { c++; f = sprintf("%s/diag%d.mmd", outdir, c); next }
    /^```/ { if (f != "") close(f); f = ""; next }
    f != "" { print > f }
' outdir="$tmpdir" "$file"

if ! ls "$tmpdir"/diag*.mmd >/dev/null 2>&1; then
    echo "no mermaid blocks found in $file" >&2
    exit 2
fi

failed=0
count=0
for f in "$tmpdir"/diag*.mmd; do
    count=$((count + 1))
    if mmdc -i "$f" -o "${f%.mmd}.svg" >/dev/null 2>&1; then
        echo "OK   $(basename "$f")"
    else
        echo "FAIL $(basename "$f")" >&2
        mmdc -i "$f" -o "${f%.mmd}.svg" 2>&1 | sed -n '2,4p' >&2
        failed=1
    fi
done

if [[ "$failed" -eq 0 ]]; then
    echo "all $count mermaid blocks compiled"
else
    exit 1
fi
