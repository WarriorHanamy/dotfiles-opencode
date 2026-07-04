---
name: typescript-cli-safety
description: Safe TypeScript CLI patterns for SSH, build pipelines, and error handling. Use when writing or reviewing CLI code that runs remote commands, manages builds, or interacts with device hosts.
---

# TypeScript CLI Safety

Patterns learned from production bugs. See also: `cli-guideline` skill for general CLI design.

## Remote Execution (SSH)

### Rule: never swallow stderr

`runSSH()` MUST print stderr before exiting on failure. The caller should
never see a bare exit code with no context.

```ts
// BAD: silent failure, user sees only "exit code 1"
const result = { stdout, stderr, exitCode };
if (result.exitCode !== 0) process.exit(result.exitCode);

// GOOD: dump remote stderr to local stderr before exit
const result = { stdout, stderr, exitCode };
if (result.exitCode !== 0) {
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}
```

### Rule: prefer explicit check=false

The caller owns the error. Always pass `check=false` and handle the
result, rather than relying on the default `check=true` which exits
without context.

```ts
// BAD: default check=true — silent exit on failure
await runSSH(buildCmd);

// GOOD: caller handles error display + logging
const { stdout, stderr, exitCode } = await runSSH(buildCmd, false);
if (exitCode !== 0) {
  if (stderr) process.stderr.write(stderr);
  process.exit(exitCode);
}
```

## Build Pipeline

### Rule: always tee to log

Build output MUST be written to a log file AND displayed to the user
simultaneously. This ensures post-mortem analysis without losing
visible feedback.

```ts
const logDir = `${WORKSPACE}/logs`;
mkdirSync(logDir, { recursive: true });
const logFile = `${logDir}/build-${pkg || "all"}.log`;

// Remote command: 2>&1 | tee writes both to screen and file
const cmd = `${buildCmd} 2>&1 | tee ${logFile}`;
```

### Rule: tell user where to find the log on failure

```ts
if (exitCode !== 0) {
  console.error(`[build] FAILED: catkin build ${pkg}`);
  console.error(`[build]   Log: ${logFile}`);
  // stderr already printed by runSSH
  process.exit(1);
}
```

## Runtime vs CI Separation

### Rule: runtime commands are pure launchers

Commands like `bun run smoke <test>` and `bun run prod start <recipe>`
MUST NOT include sync or build. Those are the agent's CI responsibility
(codified in AGENTS.md).

```ts
// BAD: runtime command does CI work
async function doSmokeFov() {
  if (!onDeviceHost()) {
    await cmdSync();        // should NOT be here
    await cmdBuildPkg(pkg); // should NOT be here
  }
}

// GOOD: only SSH bridge, no CI
async function doSmokeFov() {
  if (!onDeviceHost()) {
    sshVia(args, true);  // SSH bridge only
    return;
  }
  // ... launch tmux + RVIZ
}
```

## Error Handling

### Rule: structured error messages

A failed command MUST display:
1. What failed: `[build] FAILED: catkin build FAST_LIO`
2. Remote stderr (always, non-negotiable)
3. Log file path if applicable
4. Fix suggestion if known

### Rule: never use bare process.exit()

```ts
// BAD
process.exit(1);

// GOOD
console.error("[cmd] What failed + why");
process.stderr.write(result.stderr);
console.error("[cmd] Suggestion: do X instead");
process.exit(1);
```

## File Rename / Remove Safety

### Rule: verify target file exists before modifying

When renaming or removing a file, always confirm the old path exists
first. `oldString` in edit operations must be an exact match; use
read + grep to locate the content before attempting edits.

```ts
// BAD: assume file exists at expected path
write(newPath, content);
fs.rm(oldPath);

// GOOD: verify old path first
if (!existsSync(oldPath)) {
  console.error(`[refactor] File not found: ${oldPath}`);
  process.exit(1);
}
```

## Summary Checklist

- [ ] Every `runSSH()` call passes `check=false` (no silent failure)
- [ ] stderr is always displayed before exit
- [ ] Build commands tee to `logs/` directory
- [ ] Runtime commands never include sync/build
- [ ] Error messages include what failed + context + fix suggestion
- [ ] File renames verify source path exists first
