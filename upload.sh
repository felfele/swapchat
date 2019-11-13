#!/bin/sh -e

bzzapi="--bzzapi https://swarm-gateways.net"
if [ "$1" != "" ]; then
    bzzapi="--bzzapi $1"
fi
alias sw="swarm $bzzapi"

bzzaccount="0x5660eb1fc0fa1abc2bef8d50fe7a2e094490d501"
html_hash=$(sw up dist/index.html)
html_topic="0x646973706f636861745f68746d6c000000000000000000000000000000000000"

sw --bzzaccount "$bzzaccount" feed update --topic "$html_topic" "0x$html_hash"

script_hash=$(sw up dist/index.js)
script_topic="0x646973706f636861745f73637269707400000000000000000000000000000000"

sw --bzzaccount "$bzzaccount" feed update --topic "$script_topic" "0x$script_hash"

sw --recursive --defaultpath dist/index.html up dist
