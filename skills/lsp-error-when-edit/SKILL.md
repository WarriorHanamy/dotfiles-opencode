---
name: lsp-error-when-edit
description: |
     Use this skill to fix LSP errors when using the `edit` tool.
---

# LSP error when edit

If you encounter LSP error when using the `write` or `edit` tool. This typically means some setup issue in LSP.

## Python

Python use pyright for LSP.

### Package not found - may due to `virtualenv`

To prevent LSP errors about 'package not found' when venv is used, create `pyrightconfig.json` with content:

```json
{
  "venvPath": ".",
  "venv": ".venv"
}
```

### False positive type error reported - when using `pandas`

As long as it can run and pass test, we can use `# type: ignore` to dismiss the LSP warnings:

```python
df: pd.DataFrame = ...
some_variable = df["some_column"].iloc[0]  # type: ignore
```
