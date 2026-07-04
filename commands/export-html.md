---
description: Convert markdown to standalone HTML with embedded images
---

# Export Markdown To HTML

Convert a markdown file into a self-contained HTML document. All images
referenced via relative `<img src="./assets/...">` tags are embedded as
base64 data URIs.

## Target

$ARGUMENTS

Must be a single markdown file path. If not provided, ask the user.

## Step 1: Parse Images

Find all `<img src="<relative-path>" ...>` tags in the markdown using Python `re`.
Resolve each path relative to the **parent directory of the markdown file**.

## Step 2: Embed Images As Base64

For each image:
- Determine MIME type from extension: `.png` → `image/png`, `.jpg/.jpeg` → `image/jpeg`
- Read the file as binary, base64-encode
- Replace `src="..."` with `src="data:<mime>;base64,<b64>"`

## Step 3: Convert Markdown To HTML Body

Use `uv run --with markdown python` with `markdown.markdown(md, extensions=['extra'])`.

## Step 4: Wrap In HTML Document

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>{first h1 heading from markdown}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
       max-width: 900px; margin: 0 auto; padding: 20px; line-height: 1.6; }
img { max-width: 100%; height: auto; }
pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
pre code { padding: 0; }
</style>
</head>
<body>
{html_body}
</body>
</html>
```

## Step 5: Write Output

Write to the **same directory** as the input markdown, with `.html` extension.

## Future: React Mode

Currently only markdown-to-static-HTML is supported. A React-based reader
(TOC sidebar, dark mode, search) may be added later as a separate mode or
`--react` flag, without modifying this command.
