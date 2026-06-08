#!/usr/bin/env bash
# Mirror the apps into a sandbox-readable staging dir for the Claude preview server.
#
# Why: the preview server runs in a sandbox that cannot read ~/Documents
# (macOS TCC protects it), so we copy the apps to /tmp where it can.
# Re-run this after editing app files, then (re)start the preview server.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="/tmp/jh-payroll-preview"
mkdir -p "$DEST"
for app in employee-paycheck payroll-compare; do
  rsync -a --delete "$REPO/$app/" "$DEST/$app/"
done
echo "Staged apps to $DEST"
