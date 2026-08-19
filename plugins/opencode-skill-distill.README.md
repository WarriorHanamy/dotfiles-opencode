# opencode-skill-distill

Distill past OpenCode session trajectories into reusable `SKILL.md` skills for OpenCode.

## Tools

- `opencode_sessions`: list recent OpenCode sessions under a directory (default `~/diff-dockers`).
- `opencode_distill`: read one session trajectory and distill it into `~/.config/opencode/skills/<name>/SKILL.md`.

## Usage in OpenCode

```
Use opencode_sessions to list recent sessions under ~/diff-dockers.
Then call opencode_distill with session_id <id>.
```

## Notes

- The distilled skill is written to `~/.config/opencode/skills` by default.
  Pass `skill_dir` to override, or `skill_name` to force the skill name.
- Existing skills are never overwritten unless `force: true`.
- The plugin creates a temporary OpenCode session to run distillation, then deletes it.
- Restart OpenCode (`opencode` TUI or `opencode serve`) after adding or editing this file.
