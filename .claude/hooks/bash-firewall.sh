#!/bin/bash
# Zaph — Bash Firewall Hook
# Fires BEFORE every Bash tool call. Exit 2 = block + send error to Claude.

# Read the JSON payload Claude sends describing what it's about to do
INPUT=$(cat)

# Extract the command string
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# If no command found, allow (not a bash action)
if [ -z "$COMMAND" ]; then
  exit 0
fi

# ── Patterns that are ALWAYS blocked ─────────────────────────────────────────
BLOCKED_PATTERNS=(
  "rm -rf /"
  "rm -rf ~"
  "rm -rf \."
  "git push --force"
  "git push -f "
  "git reset --hard"
  "git checkout main"
  "git checkout master"
  "DROP TABLE"
  "DROP DATABASE"
  "truncate "
  "mkfs"
  "> /dev/sd"
  "chmod 777"
  "curl.*| bash"
  "wget.*| bash"
  "eas submit"
  "npx expo publish"
  "cat .env"
  "cat .env."
)

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qi "$pattern"; then
    echo "🚫 BLOCKED: Command matches dangerous pattern: '$pattern'" >&2
    echo "   Command was: $COMMAND" >&2
    echo "   Choose a safer alternative." >&2
    exit 2
  fi
done

# ── Allow everything else ────────────────────────────────────────────────────
exit 0
