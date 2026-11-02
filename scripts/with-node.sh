#!/usr/bin/env bash
# Runs a command with the Node version in .nvmrc, switching through nvm when the shell's Node is older.
required=$(<"$(dirname "$0")/../.nvmrc")
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

if (($(node_major) < required)); then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # npm sets npm_config_prefix for scripts, and nvm refuses to switch while it is set.
  unset npm_config_prefix
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh" --no-use >/dev/null 2>&1
    nvm use --silent "$required" >/dev/null 2>&1
  fi

  # nvm can exit 0 without switching, so check the result instead.
  if (($(node_major) < required)); then
    echo "RailBook needs Node $required or newer, but found $(node -v 2>/dev/null || echo none)." >&2
    echo "Install it with: nvm install $required" >&2
    exit 1
  fi
fi

exec "$@"
