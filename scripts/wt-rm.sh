#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/wt-rm.sh <branch-or-dir-suffix> [--keep-branch]
# Removes a git worktree and optionally deletes the branch.

MAIN_REPO="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_NAME="$(basename "$MAIN_REPO")"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <branch-or-dir-suffix> [--keep-branch]"
  echo ""
  echo "Examples:"
  echo "  $0 feature-xyz               # remove worktree and delete branch"
  echo "  $0 feature-xyz --keep-branch  # remove worktree, keep branch"
  echo ""
  echo "Active worktrees:"
  git -C "$MAIN_REPO" worktree list
  exit 1
fi

SUFFIX="$1"
KEEP_BRANCH=false

if [[ "${2:-}" == "--keep-branch" ]]; then
  KEEP_BRANCH=true
fi

DIR_SUFFIX="${SUFFIX//\//-}"
WORKTREE_DIR="$(dirname "$MAIN_REPO")/${PROJECT_NAME}-${DIR_SUFFIX}"

# --- Preflight checks ---

if ! git -C "$MAIN_REPO" worktree list --porcelain | grep -q "worktree $WORKTREE_DIR$"; then
  echo "Error: No worktree found at $WORKTREE_DIR"
  echo ""
  echo "Active worktrees:"
  git -C "$MAIN_REPO" worktree list
  exit 1
fi

# Detect the branch checked out in the worktree
BRANCH="$(git -C "$WORKTREE_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

# --- Check for uncommitted changes ---

if [[ -n "$(git -C "$WORKTREE_DIR" status --porcelain 2>/dev/null)" ]]; then
  echo "Warning: Worktree has uncommitted changes!"
  echo ""
  git -C "$WORKTREE_DIR" status --short
  echo ""
  read -r -p "Continue and discard changes? [y/N] " confirm
  if [[ "$confirm" != [yY] ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# --- Remove worktree ---

echo "Removing worktree at $WORKTREE_DIR..."
git -C "$MAIN_REPO" worktree remove --force "$WORKTREE_DIR"
echo "Worktree removed."

# --- Optionally delete branch ---

if [[ "$KEEP_BRANCH" == true ]]; then
  echo "Branch '$BRANCH' kept."
elif [[ -n "$BRANCH" && "$BRANCH" != "main" && "$BRANCH" != "HEAD" ]]; then
  if git -C "$MAIN_REPO" branch -d "$BRANCH" 2>/dev/null; then
    echo "Branch '$BRANCH' deleted (was merged)."
  else
    echo "Branch '$BRANCH' is not fully merged into main."
    read -r -p "Force delete branch '$BRANCH'? [y/N] " confirm
    if [[ "$confirm" == [yY] ]]; then
      git -C "$MAIN_REPO" branch -D "$BRANCH"
      echo "Branch '$BRANCH' force-deleted."
    else
      echo "Branch '$BRANCH' kept."
    fi
  fi
fi

echo ""
echo "Done. Remaining worktrees:"
git -C "$MAIN_REPO" worktree list
