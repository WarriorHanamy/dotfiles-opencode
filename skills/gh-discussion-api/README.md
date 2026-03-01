# GitHub Discussion API Skill

This skill provides tools and documentation for creating and managing GitHub Discussions using GitHub CLI and GraphQL API.

## 📁 File Structure

```
~/.config/opencode/skills/gh-discussion-api/
├── SKILL.md                    # Main documentation
├── create-discussion.sh         # Script to create discussions from markdown files
├── list-categories.sh            # Script to list discussion categories
├── README.md                   # This file
└── QUICK_REFERENCE.md           # Quick reference card
```

## 🚀 Quick Start

### 1. Install Prerequisites

```bash
# Install GitHub CLI (latest version)
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh

# Install jq for JSON processing
sudo apt install jq

# Authenticate
gh auth login

# Verify installation
gh --version
```

### 2. Add Scripts to PATH (Optional)

```bash
# Create symlink for easy access
ln -s ~/.config/opencode/skills/gh-discussion-api/create-discussion.sh ~/.local/bin/gh-create-discussion
ln -s ~/.config/opencode/skills/gh-discussion-api/list-categories.sh ~/.local/bin/gh-list-categories

# Or add to PATH
export PATH="$HOME/.config/opencode/skills/gh-discussion-api:$PATH"
```

## 📝 Usage Examples

### Create Discussion from Markdown File

```bash
# Simple usage
./create-discussion.sh -t "[Documentation] Topic" -f DOCUMENT.md

# Using symlink
gh-create-discussion -t "[Documentation] Topic" -f DOCUMENT.md

# Specify category
./create-discussion.sh -t "Question" -f ISSUE.md -c q-a

# Use different repository
./create-discussion.sh -o "other-user" -r "other-repo" -t "Discussion" -f README.md -c general
```

### List Discussion Categories

```bash
# List categories for current repository
./list-categories.sh

# List categories for specific repository
./list-categories.sh WarriorHanamy parkour
```

### Available Categories

Typical GitHub Discussions categories:

| Slug       | Name         | Description                              |
| ----------- | ------------ | ---------------------------------------- |
| `general`   | General       | General discussions about the project        |
| `announcements` | Announcements | Project announcements and updates          |
| `q-a`       | Q&A           | Questions and answers                    |
| `ideas`      | Ideas         | Feature requests and ideas                 |
| `show-and-tell` | Show and Tell | Share your projects and creations       |
| `polls`     | Polls         | Community polls                         |

## 🎯 Common Use Cases

### Use Case 1: Document Code Analysis

```bash
# 1. Create documentation file
cat > ANALYSIS.md << 'EOF'
# Code Analysis

This document analyzes...

## Findings

- Finding 1
- Finding 2

EOF

# 2. Create discussion
./create-discussion.sh \
  -t "[Documentation] Code Analysis" \
  -f ANALYSIS.md \
  -c general
```

### Use Case 2: Ask Technical Question

```bash
# 1. Create question file
cat > QUESTION.md << 'EOF'
# Question About Feature X

I'm trying to implement feature X but encountering issues.

## Current Approach

```python
def my_function():
    # code here
    pass
```

## Expected Behavior

Should do Y

## Actual Behavior

Does Z instead

## Environment

- Python 3.11
- Version 1.2.3
EOF

# 2. Create Q&A discussion
./create-discussion.sh \
  -t "Question: How to implement feature X?" \
  -f QUESTION.md \
  -c q-a
```

### Use Case 3: Share Project Updates

```bash
# 1. Create announcement
cat > ANNOUNCEMENT.md << 'EOF'
# New Release v2.0.0

## What's New

- Feature A
- Feature B
- Bug fix C

## Migration Guide

To upgrade from v1.0:

\`\`\`bash
npm update my-package@latest
\`\`\`

## Breaking Changes

- API endpoint changed from /old to /new

EOF

# 2. Create announcement discussion
./create-discussion.sh \
  -t "[Announcement] Release v2.0.0" \
  -f ANNOUNCEMENT.md \
  -c announcements
```

## 🔧 Advanced Usage

### Using with GitHub Actions

```yaml
name: Create Documentation Discussion

on:
  push:
    tags:
      - 'v*'

jobs:
  create-discussion:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Create Discussion
        run: |
          gh api graphql -f query='
          mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
            createDiscussion(input: {repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body}) {
              discussion {
                number
                url
              }
            }
          }
          ' -F repositoryId='R_...' -F categoryId='DIC_...' -F title='Release ${{ github.ref_name }}' -F body="$(cat CHANGELOG.md)"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Batch Creating Discussions

```bash
#!/bin/bash
# Create multiple discussions from files

for file in docs/*.md; do
  title="[Documentation] $(basename "$file" .md)"
  ./create-discussion.sh -t "$title" -f "$file" -c general
  sleep 1  # Rate limiting
done
```

## 🐛 Troubleshooting

### Issue: gh command not found

```bash
# Install gh CLI
sudo apt install gh

# Verify
which gh
gh --version
```

### Issue: Authentication required

```bash
# Login to GitHub
gh auth login

# Check auth status
gh auth status
```

### Issue: jq not found

```bash
# Install jq
sudo apt install jq

# Verify
which jq
jq --version
```

### Issue: Category not found

```bash
# List available categories
./list-categories.sh

# Use slug (not name) from the list
./create-discussion.sh -t "Title" -f FILE.md -c <slug>
```

### Issue: Discussion title already exists

GitHub Discussions allows duplicate titles, but for better organization:

```bash
# Add version number
./create-discussion.sh -t "[v2.0.0] Documentation" -f README.md

# Add date
./create-discussion.sh -t "[2024-01-15] Update" -f NEWS.md
```

## 📚 References

- [GitHub GraphQL API Documentation](https://docs.github.com/en/graphql)
- [GitHub CLI Manual](https://cli.github.com/manual/)
- [Discussions API Guide](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions)

## 🤝 Contributing

To add new scripts or update documentation:

1. Edit scripts in this directory
2. Update SKILL.md with new methods
3. Update this README with examples
4. Test scripts before use

## 📝 License

This skill is part of the OpenCode project and follows the same license.

## 📊 Why GraphQL API?

**Note**: The `gh-discussions` extension is interactive only and does not support command-line arguments. For automation and scripting purposes, using the GraphQL API directly is recommended.

**Advantages of GraphQL API**:
- ✅ Full control over title, body, and category
- ✅ No interactive prompts - fully scriptable
- ✅ Can read content from files
- ✅ Better error handling and debugging
- ✅ Consistent behavior across gh versions
