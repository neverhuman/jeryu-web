#!/usr/bin/env bash
# Sourced by pr-ci.sh and e2e.sh: make apps/web/node_modules match apps/web/package-lock.json.
#
# Gate runners keep node_modules between runs as a cache, so "install only when it is missing"
# leaves a stale tree after the lockfile changes (a pinned terser 5.51.2 failed as "terser not
# found" until the cache was cleared by hand). Record the lockfile digest after each install and
# reinstall whenever it differs; npm ci removes the old tree itself.
ensure_web_deps() {
  local lock=apps/web/package-lock.json stamp=apps/web/node_modules/.jeryu-lockfile-sha256 want
  want="$(sha256sum "$lock" | cut -d' ' -f1)"
  if [ -d apps/web/node_modules ] && [ "$(cat "$stamp" 2>/dev/null)" = "$want" ]; then
    return 0
  fi
  echo "[web-deps] installing apps/web dependencies for lockfile ${want:0:12}" >&2
  npm ci --prefix apps/web
  printf '%s\n' "$want" >"$stamp"
}
