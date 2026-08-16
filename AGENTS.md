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
## Workspace Hygiene

- Keep workspace clean and keep temporary analysis scripts in `/tmp`.
- Maintain `.gitignore` so generated files stay out of version control.
- Empty project bootstrap can use the `setup-fresh-project` skill.
- If the project contains a Makefile, prefer to read it to understand task pipelines and project conventions.

## Port Conflict Checker

- `port-check <port> [port...]` (installed at `~/.local/bin/port-check`, source: `~/port-check.sh`) checks whether port(s) collide with ports declared in `~/AGENTS.md`.
- Run it BEFORE declaring/using a new port; on conflict it prints the declaring project folder and exits 1, on success it is silent and exits 0.


## Long-Running Tasks

- `pty_*` tools are used for commands likely to exceed 2 minutes.
- `pty_*` tools are used for background or interactive long-lived processes.
- If a normal shell command reaches timeout, continue with PTY execution.

## System Environment

- Host system: Arch Linux with Hyprland (Wayland).
- For ROS/PX4 projects, always use Docker containers to ensure environment consistency.

## Remote Hosts

| Name | Host | User | Auth | Note |
|------|------|------|------|------|
| diff-j30-backup | 192.168.22.0 | diff | SSH key (passwordless, installed) | J30 backup host; initial password was `1` |
| mac (client) | 192.168.200.102 | hanamywarrior | SSH key (this host's authorized_keys) | opencode attach client; arm64 image builder; no SMB |
| jetson (diff) | 192.168.200.201 / 192.168.55.1 | nv | SSH key | arm64 deployment device; docker pull consumer |

## Development Topology (remote agent)

This host (rec-diff) is the development mainstage: source, git, docker
registry, and the opencode server. The Mac is a thin client that attaches to
the opencode server over ZeroTier.

- opencode server: systemd user unit `opencode-serve.service`, listens on
  `192.168.200.101:4096` (ufw 4096/tcp), basic auth user `opencode`.
- Mac client: `oc-remote` (`~/bin/oc-remote` on the Mac) — interactive attach
  or one-shot run against this server.
- Source of truth: `/home/rec/diff-dockers/` (each `l*` dir is its own repo).
- Git remotes: `localhost:8929` (gitlab-tunnel.service -> cloud GitLab).
- Docker registry: `192.168.200.101:5000` (diff-registry, user `rec`,
  empty password) — canonical image path Mac/rec-diff -> Jetson.
- The agent always runs HERE (rec-diff), never on the Mac. Mac-local skills
  are injected per-session by `oc-remote -s <skill>` (run mode only).

## Shell Environment

| Context | Shell | Note |
|---------|-------|------|
| User (terminal) | fish | `o push`/`o p` → `opencode run "commit and push ..."` |
| Agent (tool exec) | bash | All shell commands run via bash |

## System Prompts (not skills)

Skills that use NO tools (read-only classifiers, build runners) belong under
`~/.pi/agent/system_prompts/<name>/system-prompt.md` and are loaded via
`--append-system-prompt`.  They are NOT listed in `pi config` TUI and do NOT
appear in the model's tool selection.

| Directory | Command | Purpose |
|-----------|---------|---------|

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
- **APT caching**: use BuildKit cache mounts (`/var/cache/apt` + `/var/lib/apt`, `sharing=locked`) and disable `/etc/apt/apt.conf.d/docker-clean` first; never `rm -rf /var/lib/apt/lists/*` or `apt-get clean`. See `write-dockerfile` skill for the mandatory pattern.
- **Build command**: `docker compose build <service>` (BuildKit is required for cache mounts; Docker >= 23 enables it by default). If Docker Hub is unreachable, pre-pull base images — never disable BuildKit with `DOCKER_BUILDKIT=0`.
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

## Stateless Reliability

- Instructions stay compact, explicit, and scenario-oriented.
- Cleanup criteria are rule-based instead of intuition-based.

## Memory Echoes

- When the user uses keywords like "modifications", "worktree", "stash", "patch", "rebase", or "branch", use `git -C <path>` to check the repository state and understand the intent.
- Identify the correct git worktree or repository location before taking actions.
- Use `git -C status`, `git -C log --oneline -5`, or `git -C branch -a` to orient yourself.

## Cross-Repo Operations

- When operating across repositories, first read `<target-repo>/AGENTS.md` to understand its conventions, build system, and project-specific rules.

## Git Naming Convention

- "main" (unqualified) always means the **local** main branch.
- "origin/main", "remote main", or "gitlab/main" explicitly mean the remote branch.

## Git Remotes (uss-nav)

Each uss-nav repo has a single remote on the local GitLab; pushes go straight there:

```
l3-dispatcher-planner: origin http://localhost:8929/big_brain/l3-dispatcher-planner.git
l3-uss-nav-arm64:      gitlab  http://localhost:8929/big_brain/l3-uss-nav.git
```

No other remotes (github/company/rec-uss-nav) are configured; do not push to them.

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
