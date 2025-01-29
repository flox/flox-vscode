#!/usr//bin/env bash

set -eu -o pipefail

editor=${1:-code}

# Get the file descriptor from NODE_CHANNEL_FD
fd="${NODE_CHANNEL_FD:-3}"

# Function to send a response back to Node.js
send() {
    echo "$1" >&"$fd"
}

send '{"action":"close"}'

while IFS= read -u "$fd" -r line; do
    flox activate -- bash -c "$editor -nw --verbose $PWD" 
    break
done
