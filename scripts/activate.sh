#!/usr/bin/env bash

set -eu -o pipefail

fd="${NODE_CHANNEL_FD:-3}"

# Send message to parent process via IPC
send() {
    echo "$1" >&"$fd"
}
# Function to escape a string for JSON
json_escape() {
    local input="$1"
    local output=""
    local i char

    for ((i=0; i<${#input}; i++)); do
        char="${input:$i:1}"
        case "$char" in
            '"')  output+='\"' ;;
            '\')  output+='\\' ;;
            $'\b') output+='\b' ;;
            $'\f') output+='\f' ;;
            $'\n') output+='\n' ;;
            $'\r') output+='\r' ;;
            $'\t') output+='\t' ;;
            *)    output+="$char" ;;
        esac
    done

    echo "$output"
}

# Capture all environment variables and format as JSON
# Use env -0 to null-terminate each variable, which properly handles multi-line values
env_vars=""
while IFS= read -r -d '' env_entry; do
    # Split on the first = to separate key and value
    key="${env_entry%%=*}"
    value="${env_entry#*=}"

    # Skip if key is empty
    [ -z "$key" ] && continue

    # Escape special characters in the key and value for JSON
    key_escaped=$(json_escape "$key")
    value_escaped=$(json_escape "$value")

    # Append to env_vars with comma separator
    if [ -n "$env_vars" ]; then
        env_vars="$env_vars,\"$key_escaped\":\"$value_escaped\""
    else
        env_vars="\"$key_escaped\":\"$value_escaped\""
    fi
done < <(env -0)

# Send ready message with environment variables
send "{\"action\":\"ready\",\"env\":{$env_vars}}"

# Block indefinitely by reading from fd.
# When the parent VS Code process (which holds the other end of the pipe)
# terminates for any reason, this pipe will break. The 'read' command
# will then receive an EOF and exit, causing the script to terminate naturally.
while IFS= read -u "$fd" -r line; do
    sleep 5
done
