#!/bin/bash
# Helper script to create GitHub Discussion from a markdown file

set -e

# Default values
OWNER="WarriorHanamy"
REPO="parkour"
CATEGORY="general"
TITLE=""
BODY_FILE=""
DRY_RUN=false

# Usage
usage() {
  echo "Usage: $(basename "$0") [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  -o, --owner OWNER      Repository owner (default: $OWNER)"
  echo "  -r, --repo REPO        Repository name (default: $REPO)"
  echo "  -c, --category SLUG    Category slug (default: $CATEGORY)"
  echo "  -t, --title TITLE      Discussion title"
  echo "  -f, --file FILE       Read discussion body from file"
  echo "  --dry-run              Print GraphQL query without executing"
  echo "  -h, --help            Show this help message"
  echo ""
  echo "Examples:"
  echo "  # Create discussion from markdown file"
  echo "  $(basename "$0") -t '[Documentation] My Topic' -f README.md"
  echo ""
  echo "  # Create discussion with inline body"
  echo "  $(basename "$0") -t 'Question' -f - <<< 'My question text'"
  echo ""
  echo "  # Use 'Q&A' category"
  echo "  $(basename "$0") -t 'Help needed' -f ISSUE.md -c q-a"
  exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -o|--owner)
      OWNER="$2"
      shift 2
      ;;
    -r|--repo)
      REPO="$2"
      shift 2
      ;;
    -c|--category)
      CATEGORY="$2"
      shift 2
      ;;
    -t|--title)
      TITLE="$2"
      shift 2
      ;;
    -f|--file)
      if [[ "$2" == "-" ]]; then
        # Read from stdin
        BODY_FILE="/dev/stdin"
      else
        BODY_FILE="$2"
      fi
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

# Validate required arguments
if [[ -z "$TITLE" ]]; then
  echo "Error: --title is required"
  usage
fi

if [[ -z "$BODY_FILE" ]]; then
  echo "Error: --file is required"
  usage
fi

# Read body content
if [[ "$BODY_FILE" != "/dev/stdin" ]]; then
  if [[ ! -f "$BODY_FILE" ]]; then
    echo "Error: File not found: $BODY_FILE"
    exit 1
  fi
  BODY=$(cat "$BODY_FILE")
else
  BODY=$(cat)
fi

echo "📝 Creating GitHub Discussion..."
echo "   Owner: $OWNER"
echo "   Repo: $REPO"
echo "   Category: $CATEGORY"
echo "   Title: $TITLE"
echo "   Body length: $(echo -n "$BODY" | wc -c) characters"
echo ""

# Get repository ID
echo "📦 Getting repository ID..."
REPO_ID=$(gh api graphql -f query='
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    id
  }
}
' -F owner="$OWNER" -F name="$REPO" | jq -r '.data.repository.id')

if [[ -z "$REPO_ID" ]]; then
  echo "Error: Failed to get repository ID"
  exit 1
fi

echo "   Repository ID: $REPO_ID"
echo ""

# Get category ID
echo "📂 Getting category ID..."
CATEGORY_ID=$(gh api graphql -f query='
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    discussionCategories(first: 10) {
      nodes {
        id
        slug
      }
    }
  }
}
' -F owner="$OWNER" -F name="$REPO" | jq -r --arg slug "$CATEGORY" '.data.repository.discussionCategories.nodes[] | select(.slug == $slug) | .id')

if [[ -z "$CATEGORY_ID" ]]; then
  echo "Error: Category '$CATEGORY' not found"
  echo ""
  echo "Available categories:"
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
  ' -F owner="$OWNER" -F name="$REPO" | jq -r '.data.repository.discussionCategories.nodes[] | "  - \(.slug) (\(.name))"'
  exit 1
fi

echo "   Category ID: $CATEGORY_ID"
echo ""

# Create discussion
QUERY='
mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
  createDiscussion(input: {repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body}) {
    discussion {
      number
      url
    }
  }
}
'

if [[ "$DRY_RUN" == true ]]; then
  echo "🔍 Dry-run mode (not creating discussion)"
  echo ""
  echo "GraphQL query:"
  echo "$QUERY"
  echo ""
  echo "Variables:"
  echo "  repositoryId: $REPO_ID"
  echo "  categoryId: $CATEGORY_ID"
  echo "  title: $TITLE"
  echo "  body: $(echo "$BODY" | head -c 100)..."
else
  echo "✨ Creating discussion..."
  RESULT=$(gh api graphql -f query="$QUERY" -F repositoryId="$REPO_ID" -F categoryId="$CATEGORY_ID" -F title="$TITLE" -F body="$BODY")

  DISCUSSION_URL=$(echo "$RESULT" | jq -r '.data.createDiscussion.discussion.url')
  DISCUSSION_NUMBER=$(echo "$RESULT" | jq -r '.data.createDiscussion.discussion.number')

  echo ""
  echo "✅ Discussion created successfully!"
  echo "   URL: $DISCUSSION_URL"
  echo "   Number: #$DISCUSSION_NUMBER"
  echo ""
  echo "🔗 Open discussion:"
  echo "   gh browse $DISCUSSION_URL"
fi
