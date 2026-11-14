#!/bin/sh
# Publish the team log as a web page.
# Usage: publish-team-log.sh TEAM_LOG_FILE
set -eu

if [ "$#" -ne 1 ]; then
    echo "usage: $0 TEAM_LOG_FILE" >&2
    exit 2
fi

source_file=$(readlink -f "$1")
root=$(cd "$(dirname "$0")/.." && pwd)
output="$root/web/site/team-log"

mkdir -p "$output"
exec docker run --rm --network none --read-only --user "$(id -u):$(id -g)" \
    -v "$source_file":/in/team-log.md:ro \
    -v "$output":/out \
    lynkeus-api:local python -m lynkeus.team_log /in/team-log.md /out
