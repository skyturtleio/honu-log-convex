#!/usr/bin/env bash
# Run any convex CLI command against the Coolify-hosted backend.
# Usage: bash scripts/convex-coolify.sh <convex-command> [args...]
# Examples:
#   bash scripts/convex-coolify.sh deploy
#   bash scripts/convex-coolify.sh env list
#   bash scripts/convex-coolify.sh env set KEY value
set -euo pipefail

ENV_FILE="$(dirname "$0")/../.env.coolify"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env.coolify not found. Copy .env.coolify from .env.example and fill in Coolify values." >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  echo "Usage: bash scripts/convex-coolify.sh <convex-command> [args...]" >&2
  echo "Examples:" >&2
  echo "  bash scripts/convex-coolify.sh deploy" >&2
  echo "  bash scripts/convex-coolify.sh env list" >&2
  echo "  bash scripts/convex-coolify.sh env set KEY value" >&2
  exit 1
fi

# Export non-empty, non-comment lines as environment variables
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ -z "$key" || "$key" == \#* ]] && continue
  # Skip lines with empty values
  [[ -z "$value" ]] && continue
  export "$key=$value"
done < "$ENV_FILE"

bunx convex "$@"
