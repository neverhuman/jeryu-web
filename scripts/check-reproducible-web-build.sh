#!/usr/bin/env bash
# check-reproducible-web-build.sh [COMMIT] — prove `vite build` is a pure
# function of the commit: build COMMIT (default HEAD) twice, in two clones at
# different paths, and compare the sorted-path sha256 manifests of the dists.
# jeryu-deploy pins jeryu-web by commit plus the sha256 of exactly this
# manifest (its release build-web-dist.sh), so a difference here is a release
# that can never verify.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
commit="$(git -C "$repo" rev-parse "${1:-HEAD}^{commit}")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

build() { # DIR -> prints the manifest hash
  git clone -q --no-checkout "$repo" "$1"
  git -C "$1" checkout -q --detach "$commit"
  (cd "$1" && npm ci --include=dev --no-audit --no-fund --ignore-scripts >/dev/null 2>&1)
  (cd "$1/apps/web" && SOURCE_DATE_EPOCH=0 TZ=UTC npx --no-install vite build --logLevel error >/dev/null)
  (cd "$1/apps/web/dist" && find . -type f -printf '%P\0' | LC_ALL=C sort -z | xargs -0 sha256sum) >"$1.manifest"
  sha256sum "$1.manifest" | cut -c1-64
}

first="$(build "$work/one")"
second="$(build "$work/elsewhere/two")"
if [[ "$first" != "$second" ]]; then
  echo "web build of $commit is not reproducible: $first vs $second" >&2
  diff "$work/one.manifest" "$work/elsewhere/two.manifest" >&2 || true
  exit 1
fi
echo "web build of $commit is reproducible: $first ($(wc -l <"$work/one.manifest") files)"
