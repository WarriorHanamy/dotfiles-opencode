---
description: Delegate a bounded task to Pi through the local Pi RPC bridge
---

Delegate this task to Pi using the local bridge:

```bash
pi-a2a "$PWD" "$ARGUMENTS"
```

Rules:
- Treat Pi as a peer agent, not as a shell command oracle.
- Send a bounded, self-contained question or verification task.
- Read the JSONL output and summarize only the useful result.
- Do not ask Pi to modify files unless the user explicitly requested cross-agent implementation.
