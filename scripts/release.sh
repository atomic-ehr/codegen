#!/bin/bash
set -e

# Validate semver format
if ! echo "$1" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
    echo "❌ Error: Invalid version format"
    echo "Usage: bun run release <version>"
    echo "Example: bun run release 0.0.18"
    exit 1
fi

VERSION=$1

# Check if we're on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "❌ Error: Releases can only be made from the main branch"
    echo "Current branch: $CURRENT_BRANCH"
    echo "Please switch to main branch first: git checkout main"
    exit 1
fi

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "❌ Error: Working tree has uncommitted changes"
    echo "Please commit or stash your changes before releasing"
    exit 1
fi

echo "📦 Releasing version $VERSION..."

# Update package.json version
echo "Updating package.json..."
npm version $VERSION --no-git-tag-version

# Commit the changes
echo "Committing changes..."
git add package.json
git commit -m "chore: bump version to $VERSION"

# Create and push tag
echo "Creating and pushing tag v$VERSION..."
git tag "v$VERSION"
git push origin HEAD
git push origin "v$VERSION"

echo "✅ Successfully released version $VERSION"
