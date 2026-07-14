---
description: Delegate pi-verifier to Pi through A2A and notify this opencode session on completion
---

# opencode -> Pi pi-verifier A2A Delegate

Project root argument:

$ARGUMENTS

## Required Action

Use the `pi_verifier_delegate` tool. Do not run shell `pi-verifier`, `pi-a2a`, or `pi-verifier-delegate` directly from this command.

Tool argument:

```json
{
  "project_root": "$ARGUMENTS"
}
```

If `$ARGUMENTS` is empty, use the current project root.

## Feedback Contract

Report the returned job handle briefly. The A2A bridge will notify this opencode session when Pi finishes. `pi-verifier-result <job_id>` remains available only as recovery/audit.
