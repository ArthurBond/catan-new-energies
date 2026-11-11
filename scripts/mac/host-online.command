#!/bin/sh
# Double-click to host CATAN: New Energies for friends on other networks.
# Builds the game, starts the server and brings up the invite link through Tailscale Funnel.
# First time: see MULTIPLAYER.md (install Tailscale and sign in).
cd "$(dirname "$0")/../.." || exit 1

# Finder starts this without your shell profile, so look for Node.js in the usual places too.
if ! command -v npm >/dev/null 2>&1; then
  for dir in /opt/homebrew/bin /usr/local/bin "$HOME"/.nvm/versions/node/*/bin "$HOME/.volta/bin"; do
    if [ -x "$dir/npm" ]; then PATH="$dir:$PATH"; fi
  done
  export PATH
fi

fail() {
  echo
  echo "The game server stopped because of an error. Read the messages above."
  printf "Press Return to close this window. "
  read -r _
  exit 1
}

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org and try again."
  fail
fi

if [ ! -d node_modules ]; then
  echo "Installing the game's packages for the first time. This takes a minute..."
  npm install || fail
fi

# caffeinate keeps the Mac awake for as long as the server runs.
if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -i npm run host:online || fail
else
  npm run host:online || fail
fi
