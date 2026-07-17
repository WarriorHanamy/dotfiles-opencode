---
description: Run tests, fix every failure, re-run until green
---

# Fix Tests

Run the test suite, diagnose each failure, apply minimal fixes, then re-run until all pass.

## Target

$ARGUMENTS

If no target is specified, run the full test suite.

## Workflow

### Step 1: Detect Test Command

Read project root for test configuration, in order:

1. `Makefile` — look for `test` target
2. `package.json` — `scripts.test`
3. `pyproject.toml` — tool-specific runner (pytest, pytest-asyncio)
4. `Cargo.toml` — `cargo test`
5. Fallback: `npm test` / `uv run pytest`

Set `$TEST_CMD` accordingly.

### Step 2: Round 1 — Run Tests

```
$TEST_CMD
```

Capture the full output. If green, stop and report.

### Step 3: Diagnose & Fix (Loop, Max 3 Rounds)

For each failure:

1. Read the error output to identify which test case failed and the error location.
2. Read the test file and source file around the failing line.
3. Identify root cause:
   - Bug in source code → fix the source
   - Test asserts wrong expected value → fix the test (document why in the fix)
   - Test fixture/test setup issue → fix test setup
4. Apply the minimal fix. Do NOT rewrite unrelated code.
5. Log the fix: `[file:line] — description of what was wrong and what changed`

### Step 4: Re-Run

```
$TEST_CMD
```

If green, stop and report.
If still red, repeat from Step 3.
If 3 rounds pass and failures remain, stop and report remaining failures with suspected root cause.

## Output

```
## Fix Tests Result

<green icon> All tests passed after X fix(es):

| File | Fix |
|------|-----|
| path/to/file.ts:line | what changed |

[if not fully fixed]
<red icon> Y failures remain after 3 rounds:

| File | Suspected cause |
|------|-----------------|
| path/to/file.ts:line | root cause analysis |

## Commands

$TEST_CMD
```

## Rules

- Prioritize fixing source code before changing tests.
- Only change a test if it contradicts documented expected behavior.
- Report every fix with file:line and reason.
- Do not refactor or add new features.
