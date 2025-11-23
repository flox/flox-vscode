#!/usr/bin/env bash

set -eu -o pipefail

fd="${NODE_CHANNEL_FD:-2}"

# Send ready message to stdout as JSON
send() {
    echo "$1" >&"$fd"
}

send '{"action":"ready"}'


while true; do
  sleep 2147483647
done