#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

# Skip check for git commit commands (message body may mention "npm")
if echo "$COMMAND" | grep -qE '^\s*git\s+(add|commit|stage)'; then
  exit 0
fi

# Block "npm" as an actual command, but allow "npx"
if echo "$COMMAND" | grep -qE '(^|\s|&&|\|\||;)npm\s'; then
  echo "BLOCKED: Use 'bun' instead of 'npm'. For example: 'bun add', 'bun run', 'bun install'." >&2
  exit 2
fi

exit 0
