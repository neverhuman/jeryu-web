#!/usr/bin/env bash
# Fail when the tree tracks files .gitignore excludes.
#
# A worker that force-adds build output (`git add -f`) makes every later lane
# rewrite those files, so the gate's own dirty-tree check keeps re-firing and
# the PR is re-gated forever. Catch it here, at the worker's own gate, and name
# the paths so the fix is obvious.
set -euo pipefail

repo_root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

tracked_ignored="$(git -C "$repo_root" ls-files -ci --exclude-standard)"
if [ -n "$tracked_ignored" ]; then
  {
    printf 'error: these tracked files are excluded by .gitignore:\n'
    printf '%s\n' "$tracked_ignored" | sed 's/^/  /'
    printf '\n'
    printf 'They were most likely force-added (git add -f). Every lane rewrites\n'
    printf 'them, so the gate sees a dirty tree on each run. Untrack them with\n'
    printf '`git rm -r --cached <path>` and commit, or stop ignoring them.\n'
  } >&2
  exit 1
fi

printf 'no tracked files are gitignored\n'
