# Agent Operating Profile

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
- Fresh projects use 2-space indentation by default.
- **Tool preference**: Use `edit` for in-place modifications; use `write` only for new files or when replacing entire content. Avoid large `write` operations that may time out.

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

## Stateless Reliability

- Instructions stay compact, explicit, and scenario-oriented.
- Cleanup criteria are rule-based instead of intuition-based.

## FastDDS Schema Reference

- FastDDS XML configuration schema: https://fast-dds.docs.eprosima.com/en/v2.6.11/fastdds/xml_configuration/transports.html
- Version: 2.6.11

## Memory Echoes

- When the user uses keywords like "modifications", "worktree", "stash", "patch", "rebase", or "branch", use `git -C <path>` to check the repository state and understand the intent.
- Identify the correct git worktree or repository location before taking actions.
- Use `git -C status`, `git -C log --oneline -5`, or `git -C branch -a` to orient yourself.
