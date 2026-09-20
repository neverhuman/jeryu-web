#!/usr/bin/env bash
# stamp-version.sh [VERSION] — write the release stamp into `VERSION`.
#
# `VERSION` is the file an operator reads to decide whether a deploy is
# current, so the release cuts it rather than leaving it to a hand edit: run
# this with the version about to be tagged (or with no argument to restamp
# from the newest `jeryu-web-v*` tag in this clone), commit, then tag.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

version="${1:-}"
if [[ -z "$version" ]]; then
  version="$(git -C "$repo" tag --list 'jeryu-web-v*-split.*' --sort=-v:refname | head -n 1)"
  if [[ -z "$version" ]]; then
    echo "stamp-version.sh: no jeryu-web-v*-split.* tag to stamp from" >&2
    exit 1
  fi
fi

if [[ ! "$version" =~ ^jeryu-web-v[0-9]+\.[0-9]+\.[0-9]+-split\.[0-9]+$ ]]; then
  echo "stamp-version.sh: '$version' is not a jeryu-web-vX.Y.Z-split.N stamp" >&2
  exit 1
fi

printf '%s\n' "$version" >"$repo/VERSION"
echo "$version"
