#!/usr/bin/env bash
# A Paseo daemon of this checkout's own, serving Paseo's web UI with this checkout's plugin
# installed. Its home is in the checkout's git directory, so each worktree gets its own and
# the user's Paseo is never touched.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
home="$(git rev-parse --absolute-git-dir)/paseo-ui"
plugin=$(jq -r .id "$root/paseo-plugin.json")

on_home() { paseo "$@" --home "$home"; }

case "${1:-}" in
  start)
    if [[ ! -f $home/config.json ]]; then
      mkdir -p "$home"
      # An OS-chosen port, so the daemons of several worktrees don't collide.
      on_home daemon config set daemon.listen 127.0.0.1:0 --string >/dev/null
      on_home daemon config set daemon.relay.enabled false >/dev/null
      on_home daemon config set features.webUi.enabled true >/dev/null
      # Otherwise the first start downloads a speech model.
      on_home daemon config set features.dictation.enabled false >/dev/null
      on_home daemon config set pluginsEnabled true >/dev/null
    fi
    if [[ $(on_home daemon status --json | jq -r .localDaemon) != running ]]; then
      on_home daemon start >/dev/null
    fi
    if on_home plugin ls --json | jq -e --arg id "$plugin" 'any(.[]; .id == $id)' >/dev/null; then
      on_home plugin reload "$plugin" >/dev/null
    else
      on_home plugin add "$root" --id "$plugin" >/dev/null
    fi
    on_home daemon status --json | jq -r '"url: http://\(.listen)/", "server: \(.serverId)"'
    ;;
  stop)
    on_home daemon stop >/dev/null
    ;;
  paseo)
    shift
    on_home "$@"
    ;;
  *)
    echo "usage: $0 start | stop | paseo <paseo command>" >&2
    exit 2
    ;;
esac
