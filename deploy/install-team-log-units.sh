#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
# Install the systemd units that publish the team log whenever its file changes.
# Usage: install-team-log-units.sh TEAM_LOG_FILE
set -eu

if [ "$#" -ne 1 ]; then
    echo "usage: $0 TEAM_LOG_FILE" >&2
    exit 2
fi

source_file=$(readlink -f "$1")
root=$(cd "$(dirname "$0")/.." && pwd)

for unit in lynkeus-team-log.path lynkeus-team-log.service; do
    sed -e "s|@TEAM_LOG@|$source_file|g" -e "s|@ROOT@|$root|g" \
        "$root/deploy/systemd/$unit.in" > "/etc/systemd/system/$unit"
done

systemctl daemon-reload
systemctl enable --now lynkeus-team-log.path
