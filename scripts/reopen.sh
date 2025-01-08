#!/usr//bin/env bash

set -eu -o pipefail

#echo "START" >  /tmp/test.out
#echo " => PATH: $PWD" >> /tmp/test.out

## Get the file descriptor from NODE_CHANNEL_FD
fd="${NODE_CHANNEL_FD:-3}"

#echo " => NODE_CHANNEL_FD: $NODE_CHANNEL_FD" >> /tmp/test.out

# Function to send a response back to Node.js
send() {
    echo "$1" >&"$fd"
}

send '{"action":"close"}'

# Read JSON messages from the file descriptor
while IFS= read -u "$fd" -r line; do

    # Print the message received for debugging
    #echo " => MESSAGE: $line" >> /tmp/test.out

    #echo -n " => FLOX ACTIVATE" >> /tmp/test.out
    flox activate -- bash -c "echo ' => CODE' >> /tmp/test.out && code -n --verbose $PWD" 
    #&> /tmp/test.out

    # Break after handling the first message
    break
done
