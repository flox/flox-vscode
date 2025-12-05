#!/usr/bin/env bash

set -eu -o pipefail

fd="${NODE_CHANNEL_FD:-3}"

# Send message to parent process via IPC
send() {
    echo "$1" >&"$fd"
}

# Capture all environment variables and format as JSON
# This creates a JSON object with all env vars
env_vars=$(env | while IFS='=' read -r key value; do
    # Escape special characters in the value for JSON
    value=$(echo "$value" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed 's/$/\\n/g' | tr -d '\n' | sed 's/\\n$//')
    echo "\"$key\":\"$value\""
done | paste -sd ',' -)

# Send ready message with environment variables
send "{\"action\":\"ready\",\"env\":{$env_vars}}"

# Block indefinitely by reading from fd.
# When the parent VS Code process (which holds the other end of the pipe)
# terminates for any reason, this pipe will break. The 'read' command
# will then receive an EOF and exit, causing the script to terminate naturally.
while IFS= read -u "$fd" -r line; do
    sleep 5
done
