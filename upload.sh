#!/bin/sh -e

gateway="https://swarm-gateways.net"
if [ "$1" != "" ]; then
    gateway="$1"
fi
alias sw='swarm --bzzapi $gateway'

bzz=$(sw --recursive --defaultpath dist/index.html up dist)

echo "$gateway/bzz:/$bzz"
