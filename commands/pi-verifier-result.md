---
description: Read a delegated pi-verifier job result or status
---

# Pi Verifier Result

Job id, job dir, or `latest`:

$ARGUMENTS

## Required Action

```bash
JOB="$ARGUMENTS"
if [ -z "$JOB" ]; then JOB="latest"; fi
/home/rec/.pi/agent/bin/pi-verifier-result "$JOB"
```

## Feedback Contract

If a verifier result is available, report the JSON fields: `blocked`, `type`, `recommendations`, `reason`, `evidence`, `retry`.
If the job is still running, report `status`, the latest event types, and the retry command.
