#!/bin/bash
# Zaph — Auto-Format Hook
# Fires AFTER every Write/Edit/MultiEdit tool call.
# Runs Prettier on TypeScript/JS files so Claude never leaves unformatted code.

INPUT=$(cat)

# Extract the file path that was just modified
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only format files that exist
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Format based on file extension
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx)
    # Run Prettier if available, silently fail if not configured yet
    npx prettier --write "$FILE_PATH" 2>/dev/null
    ;;
  *.json)
    npx prettier --write "$FILE_PATH" 2>/dev/null
    ;;
esac

# Always exit 0 — formatting failure should not block the workflow
exit 0
