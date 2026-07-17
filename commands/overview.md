---
description: Lightweight repo overview — stack, structure, entrypoints, test/ops in one page
---

# Repository Overview

Launch 4 parallel exploration agents to produce a compact in-chat summary of the repository. No files are written.

## Target

$ARGUMENTS

If no target is specified, analyze the entire repository.

## Step 1: Launch 4 Explore Agents In Parallel

Launch ALL agents in a SINGLE message using `@ explore`. Use `"medium"` thoroughness.

### Agent 1: Structure & Entrypoints

```
@ explore Map the repository structure:
- Top-level directories and their purpose
- Entry points (main files, index files, CLI entry)
- Build/run commands: Makefile, package.json scripts, pyproject.toml entrypoints, CMakeLists.txt, launch files
- File naming conventions
Return a compact summary. No more than 15 lines.
```

### Agent 2: Stack & Config

```
@ explore Identify the tech stack:
- Languages, frameworks, runtime
- Key dependencies (top 5-8 significant ones with brief purpose)
- Package manager
- Config files (tsconfig, eslint, ruff, Dockerfile, etc.)
Return a compact summary. No more than 15 lines.
```

### Agent 3: Core Logic Map

```
@ explore Map the main modules/services:
- What are the major subsystems and what they do
- How they connect (data flow, IPC, topics, HTTP)
- Module boundaries and interfaces
Return a compact summary. No more than 15 lines.
```

### Agent 4: Testing & Operations

```
@ explore Analyze testing and ops:
- Test framework and test command
- Test file organization
- CI/CD pipeline
- Docker config
- Any deployment or ops setup
Return a compact summary. No more than 15 lines.
```

## Step 2: Synthesize

Once all agents return, produce a Markdown block in chat:

```markdown
## Overview of <repo-name>

**What it is:** [one sentence]

**Quick start:** [build/run/test commands]

### Directory Map
| Path | Purpose |
|------|---------|
| src/ | [one line] |
| ... | |

### Tech Stack
[languages, runtime, key deps]

### Architecture
[how modules connect, data flow]

### Testing
[framework, run command, CI status if visible]

### Risks & Info Gaps
[anything notable]
```

## Notes

- Keep output compact — one page. Resist adding detail.
- If an agent fails, note the gap in the overview.
- Do NOT write a file. The result stays in chat.
