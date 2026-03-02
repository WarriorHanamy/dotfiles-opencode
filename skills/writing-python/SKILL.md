---
name: writing-python
description: Develop Python projects with project-local runtime, virtual environments, and practical tooling.
---

# Python Development

Prefer project-local execution and predictable tooling.

## Runtime Rule

- Always use `$PROJECT_DIR/agent_bins/python` (or `./agent_bins/python`) when available.
- Do not use bare `python`.

## Quick Start

### Single-File Scripts

Use a clear script header and keep dependencies minimal.

```python
#!/usr/bin/env python3
"""Script description and usage examples."""

import sys
```
Run with:

```bash
$PROJECT_DIR/agent_bins/python script.py --help
```

### Multi-File Projects

```bash
# Run script
$PROJECT_DIR/agent_bins/python script.py
```

## Development Tools

From `/test` directory:

```bash
cd test

$PROJECT_DIR/agent_bins/python -m pytest
$PROJECT_DIR/agent_bins/python -m pyright
$PROJECT_DIR/agent_bins/python -m ruff check ../.opencode/skill
$PROJECT_DIR/agent_bins/python -m ruff format ../.opencode/skill
```

## Script Development Workflow

1. Create basic CLI shape with `--help`
2. Test immediately
3. Add `--dry-run`
4. Test again
5. Add `--verbose`
6. Test again
7. Keep changes incremental

## Best Practices

1. Use project wrapper first
2. Start simple and iterate
3. Minimize dependencies
4. Add type hints early
5. Lint and format consistently
6. Keep exit codes predictable

## Security

- Never commit secrets
- Never log secrets
- Use environment variables for credentials
- Validate required env vars at startup
