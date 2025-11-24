#!/usr/bin/env bash

set -eu -o pipefail

fd="${NODE_CHANNEL_FD:-3}"

# Send ready message to stdout as JSON
send() {
    echo "$1" >&"$fd"
}

# Send the ready message to the parent process.
send '{"action":"ready"}'

# Block indefinitely by reading from stdin.
# When the parent VS Code process (which holds the other end of the pipe)
# terminates for any reason, this pipe will break. The 'read' command
# will then receive an EOF and exit, causing the script to terminate naturally.
read -r