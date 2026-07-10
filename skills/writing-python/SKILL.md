---
name: writing-python
description: Develop Python projects with project-local runtime, virtual environments, and practical tooling.
---

# Python Development

Prefer project-local execution and predictable tooling.

## Runtime Rule

- **Never use bare `python` or `python3`.** Always `uv run python`.
- System Python (`/usr/bin/python3*`) is reserved for Docker/ROS — do not invoke it directly.
- If `uv run python` fails (no uv-managed Python), create one: `uv python install 3.13`.
- The default Python version is set by `~/.python-version` (user-global).

### Invocation patterns

| Scenario                              | Command                     |
| ------------------------------------- | --------------------------- |
| Project script (has pyproject.toml)   | `uv run <script>`             |
| One-off script (no project)           | `uv run --script /tmp/foo.py` |
| Quick REPL / inline                   | `uv run python -c "..."`      |
| Linting                               | `uv run ruff check .`         |
| Type checking                         | `uv run mypy .`               |
| Docker container scripts (ROS/Noetic) | `python3 /path/script.py`     |

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
