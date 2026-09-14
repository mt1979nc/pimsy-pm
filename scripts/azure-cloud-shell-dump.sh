#!/usr/bin/env bash
# Wrapper for Cloud Shell. See azure-cloud-shell-dump.py and v1.11-PRISM-CUTOVER.md.
set -euo pipefail
exec python3 "$(dirname "$0")/azure-cloud-shell-dump.py" "${1:-prism-dump.json}"
