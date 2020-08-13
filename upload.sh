#!/bin/sh -e

gateway="http://localhost:8080"
if [ "$1" != "" ]; then
    gateway="$1"
fi

ref=$(curl -F file=@dist-html-only/index.html "$gateway/files")
hash=$(echo "$ref" | grep -o '[0-9a-f]\{64\}')

echo ""
echo "$gateway/files/$hash"
