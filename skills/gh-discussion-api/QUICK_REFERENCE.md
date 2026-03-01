# GitHub Discussion API Skill - Quick Reference

## 📦 Installation

```bash
# 1. Install gh CLI (if needed)
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update && sudo apt install gh

# 2. Install jq for JSON processing
sudo apt install jq

# 3. Authenticate
gh auth login
```

## 🎯 Quick Commands

```bash
# List categories
~/.config/opencode/skills/gh-discussion-api/list-categories.sh [OWNER] [REPO]

# Create discussion from file
~/.config/opencode/skills/gh-discussion-api/create-discussion.sh \
  -t "Discussion Title" \
  -f path/to/document.md \
  -c general

# Dry run (test without creating)
~/.config/opencode/skills/gh-discussion-api/create-discussion.sh \
  -t "Title" \
  -f document.md \
  --dry-run
```

## 📋 Categories

| Slug | Category |
|-------|----------|
| `general` | General discussions |
| `announcements` | Project announcements |
| `q-a` | Questions and answers |
| `ideas` | Feature requests |
| `show-and-tell` | Show off projects |
| `polls` | Community polls |

## 🔗 Useful Links

- **Skill Directory**: `~/.config/opencode/skills/gh-discussion-api/`
- **Main Docs**: `SKILL.md`
- **User Guide**: `README.md`
- **Create Script**: `create-discussion.sh`
- **List Script**: `list-categories.sh`

## 📝 Example: Creating Documentation Discussion

```bash
# Create markdown document
cat > /tmp/docs.md << 'EOF'
# Analysis Results

This document contains...
EOF

# Create discussion
~/.config/opencode/skills/gh-discussion-api/create-discussion.sh \
  -t "[Documentation] Analysis Results" \
  -f /tmp/docs.md \
  -c general
```

## 💡 Tips

1. **Always test with `--dry-run` first** to verify content
2. **Use category slugs** (not names) from the list
3. **Read body from files** for better formatting and larger content
4. **Check categories** before creating if unsure which to use
5. **Ensure gh and jq are installed** for the scripts to work

## 📊 Why GraphQL API?

This skill uses GitHub's GraphQL API directly instead of the `gh-discussions` extension because:

- ✅ GraphQL API is fully scriptable (no interactive prompts)
- ✅ Complete control over all parameters (title, body, category)
- ✅ Better error handling and debugging
- ✅ Consistent across different gh CLI versions
- ✅ Can read content from files easily

---

*Generated: February 27, 2026*
*Skill Location: ~/.config/opencode/skills/gh-discussion-api/*
