# Agent Operating Profile

> The full content below is already in your system prompt. Read or create project-level AGENTS.md instead.

## Language and Output

- Replies are primarily in Chinese; English is used for unclear wording and technical terms.
- Code comments and technical documentation are written in English.
- Use ASCII hyphen `-` consistently.
- Keep responses clear, concise, and low-noise.

## Interaction Flow

- Before action: state the plan and reason in one short sentence.
- During execution: explain meaningful tool steps.
- After completion: provide result, impact, and practical next steps.

## Decision Model

- Ambiguous requests are clarified with concrete options.
- Irreversible actions are explicitly confirmed first.
- Unknown facts are marked as unknown; avoid fabricated details.

## Coding and Style

- Existing projects follow repository style configs and local patterns.
- Fresh projects use 4-space indentation by default.
- **Tool preference**: Use `edit` for in-place modifications; use `write` only for new files or when replacing entire content. Avoid large `write` operations that may time out.
- **ROS verification**: Use `pi-build-verifier` at system/phase boundaries (batch end, pre-PR), not per-file.

## Workspace Hygiene

- Keep workspace clean and keep temporary analysis scripts in `/tmp`.
- Maintain `.gitignore` so generated files stay out of version control.
- Empty project bootstrap can use the `setup-fresh-project` skill.
- If the project contains a Makefile, prefer to read it to understand task pipelines and project conventions.

## Long-Running Tasks

- `pty_*` tools are used for commands likely to exceed 2 minutes.
- `pty_*` tools are used for background or interactive long-lived processes.
- If a normal shell command reaches timeout, continue with PTY execution.

## System Environment

- Host system: Arch Linux with Hyprland (Wayland).
- For ROS/PX4 projects, always use Docker containers to ensure environment consistency.

## Shell Environment

| Context | Shell | Note |
|---------|-------|------|
| User (terminal) | fish | `o push`/`o p` → `opencode run "commit and push ..."` |
| Agent (tool exec) | bash | All shell commands run via bash |

## pi-build-verifier and Pi A2A

`pi-build-verifier` is a **system-level meta prompt verifier**, not a per-file build checker.

- Binary: `~/.pi/agent/bin/pi-build-verifier`
- Must be in PATH (`~/.pi/agent/bin`) — already added via `.bashrc`.
- **Do not invoke after every file edit.** It validates whether the full project state (AGENTS.md + Docker lifecycle + git diff + build system) is coherent at system/phase boundaries — e.g., before a PR, after a batch of changes, or when explicitly requested.
- Usage:
  ```bash
  pi-build-verifier <PROJECT_ROOT>
  ```
- Do not pipe git diff and do not pass file lists. `PROJECT_ROOT` is the only argument; the verifier derives git changes itself after AGENTS.md/Docker contract bootstrap passes.
- First step is AGENTS.md + Docker lifecycle validation, before git diff. If `"blocked":true`, fix AGENTS.md and Docker devel/test/release documentation first.
- Build commands are always Docker-based. Bare host `catkin build`/`colcon build` commands are valid only as inner commands explicitly run inside a Docker devel container.
- Follow the `retry` field: if `retry:true`, rerun pi-build-verifier after addressing recommendations; if `retry:false`, treat the recommendations as sufficient for the current pass and move on.
- For opencode -> Pi delegation, use:
  ```bash
  pi-a2a <PROJECT_ROOT> "<bounded task for Pi>"
  ```

## System Prompts (not skills)

Skills that use NO tools (read-only classifiers, build runners) belong under
`~/.pi/agent/system_prompts/<name>/system-prompt.md` and are loaded via
`--append-system-prompt`.  They are NOT listed in `pi config` TUI and do NOT
appear in the model's tool selection.

| Directory | Command | Purpose |
|-----------|---------|---------|
| `system_prompts/verify-build/` | `--append-system-prompt` | System meta prompt verifier (pi-build-verifier) |
| `system_prompts/docker-build/` | `--append-system-prompt` | Docker build + push to local registry |

## Python Environment

- **Never use bare `python` or `python3`.** Always invoke via `uv run python`.
- The global uv-managed Python (3.13, set by `~/.python-version`) is the default for all one-off scripts and project entrypoints.
- One-off scripts in `/tmp` or workspace use `uv run --script <file>` with PEP 723 inline dependency metadata (`# /// script`).
- Project scripts use `uv run <entrypoint>` defined in `[project.scripts]`.
- `uv run <tool>` for linters/formatters (ruff, mypy, etc.).
- System Python (`/usr/bin/python3`) is **only** for Docker/ROS containers.

## Docker Build Debugging

When building Docker images iteratively (resolving missing deps, fixing compile errors):

- **Split `RUN apt-get` into semantic layers** (base tools → build tools → system libs → runtime → debug tools → project deps). Each layer caches independently; adding a new package only rebuilds the affected layer.
- **Layer ordering by volatility**: stable layers first, volatile layers last. ROS/noetic deps go in the **last** `RUN apt-get` layer (just before COPY/compile) because they change most often during debugging. Debug tools go second-to-last (one-time addition, stable).
- **Pattern**: build → read error → add missing package to the thinnest valid layer → rebuild. Never append to an existing monolithic `RUN apt-get`.
- **APT cleanup**: every `RUN apt-get install` ends with `&& rm -rf /var/lib/apt/lists/*` to avoid bloating intermediate layers.
- **Build command**: `DOCKER_BUILDKIT=0 docker compose build <service>` (disable BuildKit to use local image cache when Docker Hub is unreachable).
- **Entrypoint shell**: use `.` not `source` in Dockerfile `RUN` (dash/sh); use `bash -c` when sourcing ROS `setup.bash` (bash-isms).
- **Container naming**: `{domain}-{phase}-{id}` where id = git sha (CI) or timestamp (local).
- **ROS dependency scanning**: union of `package.xml` tags + `CMakeLists.txt` `find_package(catkin COMPONENTS ...)`. Many projects have mismatches — conservative union is safest. See `write-dockerfile` skill.

## Artifacts Mount Convention

All projects using Docker-based builds MUST follow the canonical artifacts mount convention:

<pre>
Host: &lt;project_root&gt;/.artifacts/
Container: /workspace/.artifacts/
</pre>

Requirements:
- `.artifacts/` is the canonical host-side directory for build artifacts, caches, and runtime outputs. It MUST be hidden (dot-prefixed) and listed in `.gitignore`.
- Every compose service that compiles or runs the project MUST bind-mount `./.artifacts/` to `/workspace/.artifacts/` (or `.artifacts/{phase}/` for multi-phase setups where `{phase}` is `devel`, `test`, or `release`).
- Build artifacts reside under `.artifacts/{phase}/`.
- Never mount the entire project root as `/workspace`. Only mount source directories and `.artifacts/`.
- `/workspace` is the canonical container working directory.
- `CATKIN_WORKSPACE` / `COLCON_WORKSPACE` MUST be `/workspace`.

This convention is enforced by `pi-build-verifier` during system-level verification.

## Stateless Reliability

- Instructions stay compact, explicit, and scenario-oriented.
- Cleanup criteria are rule-based instead of intuition-based.

## Memory Echoes

- When the user uses keywords like "modifications", "worktree", "stash", "patch", "rebase", or "branch", use `git -C <path>` to check the repository state and understand the intent.
- Identify the correct git worktree or repository location before taking actions.
- Use `git -C status`, `git -C log --oneline -5`, or `git -C branch -a` to orient yourself.

## Cross-Repo Operations

- When operating across repositories, first read `<target-repo>/AGENTS.md` to understand its conventions, build system, and project-specific rules.

## Multi-Remote Push (uss-nav)

`uss-nav` has 3 remotes. After `git push` to `origin`, the user may also request push to `company` and `gitlab`:

```
origin   https://github.com/WarriorHanamy/uss-nav.git
company  https://github.com/zhywwyzh/uss-nav.git
gitlab   http://rec@192.168.108.83:8929/big_brain/rec-uss-nav.git
```

- `gitlab` push works directly (token in URL).
- `company` push may require interactive auth (GitHub credentials); if push fails or is aborted, notify the user.

## Preference

See the Makefile if it exists

Never tends to be backward-compatible
Never tends to be create many fallback paths

## Engineering-Focused Comment Style

Use Doxygen block comments (`/** ... */`) for C/C++ code with physical or mathematical semantics.

### Format

```cpp
/**
 * Single-sentence description of the function's physical meaning.
 *
 * @param[in] name  Description with unit [m/s]
 * @return Description with unit [m/s]
 */
```

### Rules

- Comments must be placed **before** the class/function definition, not after.
- One sentence description, no `@brief` tag.
- Every `@param` must include direction (`[in]`/`[out]`/`[inout]`) and unit in square brackets.
- `@return` must include unit.
- Total doc block: 4-6 lines max.
- Inline `//` comments inside function bodies: only for non-obvious physical or mathematical reasoning, not for explaining code syntax, single line.
- Block /*..*/ comments is to clarify the intention, the purpose.
