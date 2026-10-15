#!/usr/bin/env bash
# dist-reproducible.sh — rebuild the web app once more and require the same
# files as the dist the gate just built.
#
# jeryu-deploy pins jeryu-web by commit plus a sha256 over the whole dist (its
# release hashes a sorted `sha256sum` manifest and refuses a dist whose hash is
# not the locked one), so `vite build` must be a pure function of the commit.
# This once caught the random `import.meta.ROLLDOWN_FILE_URL_<id>` the bundler
# stamps into every asset module and leaves in the source maps'
# `sourcesContent`; vite.config.ts pins those to the asset's emitted file name.
#
# The gate's own build is the first of the two builds, so this costs one build.
# scripts/check-reproducible-web-build.sh is the stronger check (two clones at
# different paths, fresh installs) for a release candidate.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

web=apps/web
[[ -f "$web/dist/index.html" ]] || {
  echo "[dist-reproducible] no $web/dist: run the web build first" >&2
  exit 1
}
# A sibling of dist, at the same depth: source maps record their sources
# relative to the output file, so a deeper directory changes every map.
# Removed on every exit: the auditor scans this tree, and a bundle left behind
# by a failed run lowers the next run's score.
second="$PWD/$web/.reproducibility"
rm -rf "$second"
mkdir -p "$second"
trap 'rm -rf "$second"' EXIT

manifest() { # DIST -> sorted "<sha256>  <path>" lines
  (cd "$1" && find . -type f -printf '%P\0' | LC_ALL=C sort -z | xargs -0 sha256sum)
}

(cd "$web" && npx --no-install vite build --outDir "$second" --emptyOutDir --logLevel error)
mkdir -p target
if ! diff <(manifest "$web/dist") <(manifest "$second") >target/dist-reproducible.diff; then
  echo "[dist-reproducible] two builds of one tree differ:" >&2
  cat target/dist-reproducible.diff >&2
  exit 1
fi
echo "[dist-reproducible] ok: $(manifest "$second" | wc -l) files identical"
