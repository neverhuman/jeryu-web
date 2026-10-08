#!/usr/bin/env bash
# Fast public-page browser journey written in Rust; serves the production build.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
manifest=apps/web/tests/web-flows/Cargo.toml
browser_version=155.0.8059.39
browser_root="$PWD/target/web-flows/browser/$browser_version"
if [[ -z "${CHROME_BIN:-}" || -z "${CHROMEDRIVER_BIN:-}" ]]; then
  [[ "$(uname -s):$(uname -m)" == Linux:x86_64 ]] || {
    echo 'Set CHROME_BIN and CHROMEDRIVER_BIN to a matched pair on this platform.' >&2
    exit 1
  }
  mkdir -p "$browser_root"
  for product in chrome chromedriver; do
    if [[ ! -x "$browser_root/$product-linux64/$product" ]]; then
      archive="$(mktemp "$browser_root/$product.XXXXXX.zip")"
      curl --fail --location --retry 2 --proto '=https' --proto-redir '=https' \
        "https://storage.googleapis.com/chrome-for-testing-public/$browser_version/linux64/$product-linux64.zip" -o "$archive"
      unzip -q -o "$archive" -d "$browser_root"
      rm "$archive"
    fi
  done
  export CHROME_BIN="$browser_root/chrome-linux64/chrome"
  export CHROMEDRIVER_BIN="$browser_root/chromedriver-linux64/chromedriver"
fi
[[ -f apps/web/dist/index.html ]] || npm --workspace @jeryu/web run build
export CARGO_TARGET_DIR="$PWD/target/web-flows/cargo"
cargo fmt --manifest-path "$manifest" -- --check
cargo clippy --locked --manifest-path "$manifest" --all-targets -- -D warnings
cargo test --locked --manifest-path "$manifest" --test public_flows -- --nocapture
