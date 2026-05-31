#!/bin/bash
# Double-click this file to start Free AI Forever (macOS).
# It opens this Terminal window, starts the app, and opens it in a window.
# Keep this Terminal window open while you use the app; close it (or press
# Control + C) to stop the app.

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found."
  echo "Install the LTS version from https://nodejs.org, then double-click this file again."
  echo ""
  echo "Press Return to close this window."
  read -r _
  exit 1
fi

node launch.mjs
