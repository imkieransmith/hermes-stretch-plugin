#!/usr/bin/env bash
# Link this checkout into Hermes as a unified plugin package (documented dev
# path: "Developing a unified package" in docs/hermes/desktop-plugin-sdk.md).
#
#   ~/.hermes/plugins/stretch-break  ->  <this repo>
#
# Hermes Desktop then copies desktop/plugin.js into
# ~/.hermes/desktop-plugins/stretch-break/ (marked "linked": true) and re-syncs
# + hot-reloads it on every save.
#
# Usage: scripts/link.sh            # link
#        scripts/link.sh --unlink   # remove the link
set -euo pipefail

ID="stretch-break"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
TARGET="$HERMES_HOME/plugins/$ID"

if [[ "${1:-}" == "--unlink" ]]; then
  if [[ -L "$TARGET" ]]; then rm "$TARGET" && echo "Removed link $TARGET"; else echo "No link at $TARGET"; fi
  exit 0
fi

mkdir -p "$HERMES_HOME/plugins"

if [[ -L "$TARGET" ]]; then
  current="$(readlink "$TARGET")"
  if [[ "$current" == "$REPO" ]]; then echo "Already linked: $TARGET -> $REPO"; exit 0; fi
  echo "ERROR: $TARGET already links to $current (run with --unlink first)" >&2; exit 1
elif [[ -e "$TARGET" ]]; then
  echo "ERROR: $TARGET exists and is not a symlink; move it aside first." >&2; exit 1
fi

if [[ -e "$HERMES_HOME/desktop-plugins/$ID" && ! -e "$HERMES_HOME/desktop-plugins/$ID/.hermes-package.json" ]]; then
  echo "WARN: $HERMES_HOME/desktop-plugins/$ID exists without a package marker (a hand-installed copy)."
  echo "      Hermes won't overwrite it and two copies of id '$ID' would clash. Remove it first."
fi

ln -s "$REPO" "$TARGET"
echo "Linked: $TARGET -> $REPO"
echo
echo "Next: in Hermes Desktop open Capabilities → Plugins, click Rescan, then switch 'Stretch Break' on."
