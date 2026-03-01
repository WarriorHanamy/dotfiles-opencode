#!/bin/bash
# Script to list all discussion categories for a repository

set -e

OWNER="${1:-$(gh repo view --json owner,name | jq -r '.owner.login')}"
REPO="${2:-$(gh repo view --json owner,name | jq -r '.name')}"

echo "📂 Discussion Categories for $OWNER/$REPO"
echo ""

gh api graphql -f query='
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    discussionCategories(first: 10) {
      nodes {
        id
        name
        slug
        description
      }
    }
  }
}
' -F owner="$OWNER" -F name="$REPO" | jq -r '.data.repository.discussionCategories.nodes[] |
  "📌 \(.name) (\(.slug))
     ID: \(.id)
     Description: \(.description // "N/A")
"'
