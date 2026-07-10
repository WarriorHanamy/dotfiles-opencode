#!/usr/bin/env bash
# lint-plantuml.sh — Validate PlantUML blocks in markdown files
# Usage:
#   bash lint-plantuml.sh [target-dir]          — heuristic checks only (fast)
#   bash lint-plantuml.sh --remote [target-dir] — full remote API validation
# Exit: 0 if clean, 1 if issues found

set -euo pipefail

REMOTE_MODE=false
TARGET_DIR=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --remote) REMOTE_MODE=true; shift ;;
        *) TARGET_DIR="${1%/}"; shift ;;
    esac
done

TARGET_DIR="${TARGET_DIR:-docs/compare}"
if [[ ! -d "$TARGET_DIR" ]]; then
    echo "ERROR: directory not found: $TARGET_DIR"
    exit 1
fi

# We use a temp Node.js script for heuristics — avoids bash regex edge cases
TMP_SCRIPT=$(mktemp /tmp/lint-plantuml.XXXXXX.js)
trap 'rm -f "$TMP_SCRIPT"' EXIT

cat > "$TMP_SCRIPT" << 'NODESCRIPT'
const fs = require("fs");
const zlib = require("zlib");

function encodePlantUml(str) {
    const deflated = zlib.deflateRawSync(Buffer.from(str));
    let result = "";
    const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
    for (let i = 0; i < deflated.length; i += 3) {
        const b1 = deflated[i];
        const b2 = i + 1 < deflated.length ? deflated[i + 1] : 0;
        const b3 = i + 2 < deflated.length ? deflated[i + 2] : 0;
        result += charset.charAt(b1 >> 2);
        result += charset.charAt(((b1 & 0x3) << 4) | (b2 >> 4));
        result += charset.charAt(((b2 & 0xf) << 2) | (b3 >> 6));
        result += charset.charAt(b3 & 0x3f);
    }
    return result;
}

const targetDir = process.argv[2];
const remoteMode = process.argv[3] === "true";

function extractBlocks(content, filename) {
    const blocks = [];
    const regex = /```plantuml\s*(wide)?\s*\n([\s\S]*?)```/g;
    let match;
    let bIdx = 0;
    while ((match = regex.exec(content)) !== null) {
        bIdx++;
        blocks.push({
            file: filename,
            index: bIdx,
            source: match[2].trim(),
        });
    }
    return blocks;
}

async function checkRemote(puml) {
    try {
        const url = "https://www.plantuml.com/plantuml/svg/" + encodePlantUml(puml);
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const text = await resp.text();
        const visible = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (visible.includes("Syntax Error")) {
            const lineMatch = visible.match(/\(line \d+\)/);
            const errPreview = visible.slice(0, 300);
            return { ok: false, detail: (lineMatch ? lineMatch[0] + " " : "") + errPreview };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, detail: "fetch failed: " + e.message };
    }
}

// --- Heuristic checks ---
function heuristicIssues(puml) {
    const issues = [];

    // 1. skinparam rectangle { ... } — NOT supported, use skinparam roundCorner N
    if (/skinparam\s+rectangle\s*\{/.test(puml)) {
        issues.push("[ERROR] skinparam rectangle { ... } — use skinparam roundCorner N instead");
    }

    // 2. diamond shape — not supported in component/class diagrams
    if (/diamond\s+"/.test(puml)) {
        issues.push("[WARN] diamond shape — not supported in component diagrams, use rectangle");
    }

    // 3. state UNKNOWN — UNKNOWN is a reserved keyword in some PlantUML versions
    if (/state\s+UNKNOWN\b(?!\s*")/.test(puml)) {
        issues.push("[WARN] state UNKNOWN — UNKNOWN may be reserved, use \"UNKNOWN\" or UNK");
    }

    // 4. "AliasA" + "AliasB" --> "Target" — + combining not valid in component diagrams
    if (/"[^"]*"\s*\+\s*"[^"]*"\s*-+>/.test(puml)) {
        issues.push("[ERROR] \"X\" + \"Y\" --> \"Z\" — + combining not supported, use separate arrows");
    }

    // 5. @startuml / @enduml pairing
    const starts = (puml.match(/@startuml/g) || []).length;
    const ends = (puml.match(/@enduml/g) || []).length;
    if (starts !== ends) {
        issues.push("[ERROR] @startuml/@enduml mismatch: " + starts + " starts, " + ends + " ends");
    }

    // 6. double "as" alias
    if (/\bas\s+\w+\s+as\s+\w+/.test(puml)) {
        issues.push("[WARN] double 'as' alias detected — check for accidental duplicate");
    }

    return issues;
}

async function main() {
    const files = fs.readdirSync(targetDir).filter((f) => f.endsWith(".md"));
    let totalBlocks = 0;
    let totalIssues = 0;

    for (const f of files) {
        const content = fs.readFileSync(targetDir + "/" + f, "utf-8");
        const blocks = extractBlocks(content, f);
        if (blocks.length === 0) continue;

        for (const block of blocks) {
            totalBlocks++;

            // Heuristic checks
            const issues = heuristicIssues(block.source);
            for (const issue of issues) {
                console.log(block.file + " #" + block.index + ": " + issue);
                totalIssues++;
            }

            // Remote validation
            if (remoteMode) {
                const result = await checkRemote(block.source);
                if (!result.ok) {
                    console.log(block.file + " #" + block.index + ": [REMOTE ERROR] " + result.detail);
                    totalIssues++;
                }
            }
        }
    }

    console.log("\n" + totalBlocks + " blocks scanned");
    if (totalIssues === 0) {
        console.log("ALL CLEAN");
        process.exit(0);
    } else {
        console.log("FAILED: " + totalIssues + " issue(s)");
        process.exit(1);
    }
}

main();
NODESCRIPT

echo "=== PlantUML Lint ==="
echo "Mode:  $([ "$REMOTE_MODE" = true ] && echo 'remote + heuristic' || echo 'heuristic only')"
echo "Target: $TARGET_DIR"
echo

node "$TMP_SCRIPT" "$TARGET_DIR" "$REMOTE_MODE"
