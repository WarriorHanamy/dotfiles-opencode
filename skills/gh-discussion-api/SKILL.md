---
name: gh-discussion-api
description: Create and manage GitHub Discussions using gh CLI and GraphQL API. Use when creating GitHub discussions, managing discussion categories, or automating discussion workflows.
---

# GitHub Discussion API Skill

## Overview

This skill provides methods for creating and managing GitHub Discussions using GitHub CLI (gh) and GraphQL API.

## Prerequisites

- GitHub CLI (gh) version 2.80+ installed
- `gh` authenticated with GitHub
- `jq` for JSON processing

## Methods

### Method 1: Using GraphQL API (Recommended)

#### 1. Get Repository Node ID

```bash
gh api graphql -f query='
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    id
  }
}
' -F owner="OWNER" -F name="REPO_NAME"
```

Example:
```bash
gh api graphql -f query='
query($owner: String!, $name: String!) {
  repository(owner: "WarriorHanamy", name: "parkour") {
    id
  }
}
'
```

#### 2. List Discussion Categories

```bash
gh api graphql -f query='
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    discussionCategories(first: 10) {
      nodes {
        id
        name
        slug
      }
    }
  }
}
' -F owner="OWNER" -F name="REPO_NAME"
```

**Common Categories**:
- General - General discussions
- Announcements - Project updates
- Q&A - Questions and answers
- Ideas - Feature requests

#### 3. Create Discussion

```bash
gh api graphql -f query='
mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
  createDiscussion(input: {repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body}) {
    discussion {
      number
      url
    }
  }
}
' -F repositoryId="REPOSITORY_NODE_ID" -F categoryId="CATEGORY_ID" -F title="TITLE" -F body="BODY"
```

**Full Example**:
```bash
gh api graphql -f query='
mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
  createDiscussion(input: {repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body}) {
    discussion {
      number
      url
    }
  }
}
' -F repositoryId='R_kgDORXwijg' -F categoryId='DIC_kwDORXwijs4C3SoP' -F title='My Discussion Title' -F body='Discussion content here'
```

#### 4. Read Discussion Content from File

```bash
gh api graphql -f query='
mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
  createDiscussion(input: {repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body}) {
    discussion {
      number
      url
    }
  }
}
' -F repositoryId='R_kgDORXwijg' -F categoryId='DIC_kwDORXwijs4C3SoP' -F title='Documentation Title' -F body="$(cat path/to/document.md)"
```

---

## Helper Functions

### Get All Repository Information

Create a function in `~/.bashrc` or `~/.zshrc`:

```bash
gh-discussion-info() {
  local owner="${1:-$(gh repo view --json owner,name | jq -r '.owner.login')}"
  local name="${2:-$(gh repo view --json owner,name | jq -r '.name')}"

  echo "=== Repository Info ==="
  gh api graphql -f query='
  query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      id
      discussionCategories(first: 10) {
        nodes {
          id
          name
          slug
        }
      }
    }
  }
  ' -F owner="$owner" -F name="$name" | jq
}
```

Usage:
```bash
# Get info for current repo
gh-discussion-info

# Get info for specific repo
gh-discussion-info "WarriorHanamy" "parkour"
```

### Create Discussion with Category Name

```bash
gh-discussion-create() {
  local repo_id="${1}"
  local category_slug="${2:-general}"
  local title="${3}"
  local body="${4}"

  # Get category ID from slug
  local category_id=$(gh api graphql -f query='
  query($owner: String!, $name: String!) {
    repository(owner: "WarriorHanamy", name: "parkour") {
      discussionCategories(first: 10) {
        nodes {
          id
          slug
        }
      }
    }
  }
  ' | jq -r ".data.repository.discussionCategories.nodes[] | select(.slug == \"$category_slug\") | .id")

  if [ -z "$category_id" ]; then
    echo "Error: Category '$category_slug' not found"
    return 1
  fi

  # Create discussion
  gh api graphql -f query='
  mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
    createDiscussion(input: {repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body}) {
      discussion {
        number
        url
      }
    }
  }
  ' -F repositoryId="$repo_id" -F categoryId="$category_id" -F title="$title" -F body="$body"
}
```

---

## Common Issues and Solutions

### Issue 1: gh Command Too Old

**Symptom**:
```
gh: unknown command "discussion"
```

**Solution**:
```bash
# Install latest gh CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh
```

### Issue 2: Unknown Category ID

**Symptom**:
```
GraphQL error: Could not resolve to a node with the global ID of 'INVALID_ID'
```

**Solution**: Query categories first to get correct IDs

```bash
gh api graphql -f query='
query($owner: String!, $name: String!) {
  repository(owner: "WarriorHanamy", name: "parkour") {
    discussionCategories(first: 10) {
      nodes {
        id
        name
        slug
      }
    }
  }
}
' | jq '.data.repository.discussionCategories.nodes'
```

### Issue 3: Missing jq

**Symptom**:
```
jq: command not found
```

**Solution**:
```bash
# Install jq
sudo apt install jq
```

---

## Example Workflow: Creating Documentation Discussion

```bash
# 1. Prepare document file
cat > DOCUMENTATION.md << 'EOF'
# Documentation Title

This is the documentation content...

Detailed analysis...
EOF

# 2. Get repository ID
REPO_ID=$(gh api graphql -f query='
query($owner: String!, $name: String!) {
  repository(owner: "WarriorHanamy", name: "parkour") {
    id
  }
}
' -F owner="WarriorHanamy" -F name="parkour" | jq -r '.data.repository.id')

# 3. Get category ID (General)
CATEGORY_ID=$(gh api graphql -f query='
query($owner: String!, $name: String!) {
  repository(owner: "WarriorHanamy", name: "parkour") {
    discussionCategories(first: 10) {
      nodes {
        id
        slug
      }
    }
  }
}
' | jq -r '.data.repository.discussionCategories.nodes[] | select(.slug == "general") | .id')

# 4. Create discussion
gh api graphql -f query='
mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
  createDiscussion(input: {repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body}) {
    discussion {
      number
      url
    }
  }
}
' -F repositoryId="$REPO_ID" -F categoryId="$CATEGORY_ID" -F title="[Documentation] My Title" -F body="$(cat DOCUMENTATION.md)"
```

---

## Why GraphQL API (Not Extensions)?

**Note**: The `gh-discussions` extension is interactive only and does not support command-line arguments for title/body. For automation and scripting purposes, using the GraphQL API directly is recommended.

**Advantages of GraphQL API**:
- ✅ Full control over title, body, and category
- ✅ No interactive prompts - fully scriptable
- ✅ Can read content from files
- ✅ Better error handling and debugging
- ✅ Consistent behavior across gh versions

---

## References

- GitHub GraphQL API: https://docs.github.com/en/graphql
- GitHub CLI Docs: https://cli.github.com/manual/
- Discussions API: https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions
