#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/wt-add.sh <branch-name> [base-branch]
# Creates a git worktree as a sibling directory with .env.local symlink and deps installed.

MAIN_REPO="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_NAME="$(basename "$MAIN_REPO")"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <branch-name> [base-branch]"
  echo ""
  echo "Examples:"
  echo "  $0 feature-xyz           # branch from main"
  echo "  $0 hotfix-auth release   # branch from release"
  exit 1
fi

BRANCH="$1"
BASE="${2:-main}"

# Convert slashes to hyphens for directory name
DIR_SUFFIX="${BRANCH//\//-}"
WORKTREE_DIR="$(dirname "$MAIN_REPO")/${PROJECT_NAME}-${DIR_SUFFIX}"

# --- Preflight checks ---

if [[ -d "$WORKTREE_DIR" ]]; then
  echo "Error: Directory already exists: $WORKTREE_DIR"
  exit 1
fi

if git -C "$MAIN_REPO" rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  echo "Error: Branch '$BRANCH' already exists."
  echo "To use an existing branch:"
  echo "  git worktree add \"$WORKTREE_DIR\" \"$BRANCH\""
  exit 1
fi

if ! git -C "$MAIN_REPO" rev-parse --verify "$BASE" >/dev/null 2>&1; then
  echo "Error: Base branch '$BASE' does not exist."
  exit 1
fi

# --- Create worktree ---

echo "Creating worktree..."
echo "  Branch: $BRANCH (from $BASE)"
echo "  Path:   $WORKTREE_DIR"
echo ""

git -C "$MAIN_REPO" worktree add -b "$BRANCH" "$WORKTREE_DIR" "$BASE"

# --- Symlink .env.local ---

if [[ -f "$MAIN_REPO/.env.local" ]]; then
  ln -s "$MAIN_REPO/.env.local" "$WORKTREE_DIR/.env.local"
  echo "Symlinked .env.local from main repo."
else
  echo "Warning: No .env.local found in main repo."
  echo "  Copy .env.example and fill it in:"
  echo "  cp $WORKTREE_DIR/.env.example $WORKTREE_DIR/.env.local"
fi

# --- Install dependencies ---

echo ""
echo "Installing dependencies..."
(cd "$WORKTREE_DIR" && bun install)

# --- Done ---

echo ""
echo "========================================"
echo "Worktree ready!"
echo "========================================"
echo ""
echo "  cd $WORKTREE_DIR"
echo "  bun run dev"
echo ""
echo "When done, clean up with:"
echo "  bun run wt:rm $DIR_SUFFIX"
echo ""
