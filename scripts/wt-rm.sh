#!/usr/bin/env bash
# This script has moved to ~/.local/bin/wt-rm (system-wide).
# Use: wt-rm <branch-or-dir-suffix> [--keep-branch]
# Or via package.json: bun run wt:rm <branch-or-dir-suffix> [--keep-branch]
exec wt-rm "$@"
