#!/usr/bin/env bash
# Waits until no other process has a lock on the file open on descriptor 9, then locks it. The lock
# lasts until every process that inherited 9 has closed it, so the mutate scripts open their lock
# file on 9, run this, then run Stryker. Mutation test runs side by side, from several worktrees,
# slow each other's tests down until mutants time out, and Stryker counts a mutant that times out
# as killed.
set -euo pipefail

if ! flock --nonblock 9; then
  echo "Waiting for another mutation test run, from this or another worktree, to finish." >&2
  flock 9
fi
