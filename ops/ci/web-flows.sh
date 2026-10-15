#!/usr/bin/env bash
# Fast public-page browser journey written in Rust; serves the production build.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
manifest=apps/web/tests/web-flows/Cargo.toml
browser_version=155.0.8059.39
# The browser pair is a download, not build output: keep it in the user cache
# (as Playwright keeps its browsers) so a gate that starts from an empty target/
# does not fetch it again. Versioned directories, so a bump never reuses a pair.
browser_cache="${JERYU_WEB_FLOWS_BROWSER_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/jeryu-web-flows/chrome-for-testing}"
browser_root="$browser_cache/$browser_version"
if [[ -z "${CHROME_BIN:-}" || -z "${CHROMEDRIVER_BIN:-}" ]]; then
  [[ "$(uname -s):$(uname -m)" == Linux:x86_64 ]] || {
    echo 'Set CHROME_BIN and CHROMEDRIVER_BIN to a matched pair on this platform.' >&2
    exit 1
  }
  mkdir -p "$browser_root"
  # Concurrent gates share the cache: one downloads, the others wait for it.
  exec {browser_lock}>>"$browser_cache/.lock"
  flock "$browser_lock"
  for product in chrome chromedriver; do
    if [[ ! -x "$browser_root/$product-linux64/$product" ]]; then
      archive="$(mktemp "$browser_root/$product.XXXXXX.zip")"
      unpacked="$(mktemp -d "$browser_root/$product.XXXXXX")"
      curl --fail --location --retry 2 --proto '=https' --proto-redir '=https' \
        "https://storage.googleapis.com/chrome-for-testing-public/$browser_version/linux64/$product-linux64.zip" -o "$archive"
      unzip -q -o "$archive" -d "$unpacked"
      # Publish the directory only once it is whole: an interrupted unzip must
      # not leave an executable that later runs mistake for a cached pair.
      rm -rf "$browser_root/$product-linux64"
      mv "$unpacked/$product-linux64" "$browser_root/$product-linux64"
      rm -rf "$archive" "$unpacked"
    fi
  done
  exec {browser_lock}>&-
  export CHROME_BIN="$browser_root/chrome-linux64/chrome"
  export CHROMEDRIVER_BIN="$browser_root/chromedriver-linux64/chromedriver"
fi
[[ -f apps/web/dist/index.html ]] || npm --workspace @jeryu/web run build
export CARGO_TARGET_DIR="$PWD/target/web-flows/cargo"
cargo fmt --manifest-path "$manifest" -- --check
cargo clippy --locked --manifest-path "$manifest" --all-targets -- -D warnings
cargo test --locked --manifest-path "$manifest" --test public_flows -- --nocapture
