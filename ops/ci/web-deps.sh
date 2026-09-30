#!/usr/bin/env bash
# Sourced by pr-ci.sh and e2e.sh: bring node_modules — and the browser build
# Playwright pins — in line with the checked-out lockfile before any lane runs.
#
# npm workspaces install the whole tree from the root package-lock.json, so that
# file, not a member's own lock, decides what apps/web can import. Gate runners
# keep node_modules between runs as a cache, so an install that only happens when
# the directory is absent describes whatever lockfile was checked out first: a
# branch that adds a dependency then fails deep in a lane ("TS2307: Cannot find
# module 'mermaid'") instead of at install time. Each install records the
# lockfile digest inside node_modules and any difference reinstalls; npm ci
# empties the old tree itself.
#
# Three rules this file keeps:
#   * one install at a time per tree (flock), so a second gate sharing the tree
#     never reads node_modules while npm ci is emptying it;
#   * an install that cannot reach the registry is reported here, naming the
#     packages that do not resolve, instead of surfacing as a type error later;
#   * the browser build is keyed on the Playwright version the lockfile pins.

# Print one line per direct dependency of the workspace root or any member that
# does not resolve, or resolves to a version other than the one the lockfile
# records. Silence means node_modules matches package-lock.json.
_web_deps_audit() {
  node --input-type=module <<'NODE'
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const lock = read('package-lock.json');
const entries = lock.packages ?? {};

// lockfileVersion 3 lists the workspace root as "" and each member by its
// directory; everything else is keyed under a node_modules path.
const workspaces = Object.keys(entries).filter((key) => !key.includes('node_modules'));

const problems = [];
for (const workspace of workspaces) {
  const manifest = entries[workspace] ?? {};
  const direct = { ...manifest.dependencies, ...manifest.devDependencies };
  const where = workspace === '' ? '.' : workspace;
  for (const [name, range] of Object.entries(direct)) {
    const nested = `${where}/node_modules/${name}`;
    const hoisted = `node_modules/${name}`;
    const installed = [nested, hoisted].find((dir) => existsSync(`${dir}/package.json`));
    if (!installed) {
      problems.push(`${name}@${range} required by ${where}/package.json is not installed`);
      continue;
    }
    const pinned = (entries[nested] ?? entries[hoisted])?.version;
    const actual = read(`${installed}/package.json`).version;
    if (pinned && actual !== pinned) {
      problems.push(`${name}: package-lock.json pins ${pinned}, ${installed} holds ${actual}`);
    }
  }
}
process.stdout.write(problems.join('\n'));
NODE
}

# Print each workspace member directory the lockfile names.
_web_deps_members() {
  node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const members = Object.keys(lock.packages ?? {}).filter(
  (key) => key !== '' && !key.includes('node_modules')
);
process.stdout.write(members.map((member) => `${member}\n`).join(''));
NODE
}

# A member tree left by an earlier install shadows the hoisted one, so a bump
# recorded only in the root lockfile would still resolve to the older copy.
# The root install rebuilds whichever member trees it needs.
_web_deps_clear_member_trees() {
  local member
  while read -r member; do
    case "$member" in
      '' | /* | *..*) continue ;;
    esac
    [ -d "$member/node_modules" ] || continue
    echo "[web-deps] clearing $member/node_modules; the root install rebuilds it" >&2
    rm -rf "${member:?}/node_modules"
  done < <(_web_deps_members)
}

# True when node_modules already carries the stamp for digest $2.
_web_deps_current() {
  [ -d node_modules ] && [ "$(cat "$1" 2>/dev/null)" = "$2" ]
}

# Run "$@" while holding this tree's install lock, so two gates running in the
# same checkout install one after the other instead of over each other.
_web_deps_locked() {
  local guard="${JERYU_WEB_DEPS_LOCK:-target/ci/web-deps.lock}" fd status
  mkdir -p "$(dirname "$guard")"
  exec {fd}>>"$guard"
  flock "$fd"
  "$@"
  status=$?
  exec {fd}>&-
  return "$status"
}

_web_deps_install() {
  local stamp=$1 want=$2 problems
  # Another gate may have installed this very lockfile while we waited.
  _web_deps_current "$stamp" "$want" && return 0
  echo "[web-deps] installing workspace dependencies for lockfile ${want:0:12}" >&2
  _web_deps_clear_member_trees
  if npm ci; then
    printf '%s\n' "$want" >"$stamp"
    return 0
  fi
  problems="$(_web_deps_audit || true)"
  {
    echo "[web-deps] npm ci failed for lockfile ${want:0:12}"
    if [ -n "$problems" ]; then
      echo "[web-deps] these dependencies of this branch do not resolve:"
      printf '%s\n' "$problems" | sed 's/^/[web-deps]   /'
    fi
    echo "[web-deps] a host that cannot reach the registry fails here, by name,"
    echo "[web-deps] rather than as a missing module inside a later lane."
  } >&2
  return 1
}

# Make node_modules describe the checked-out package-lock.json.
ensure_web_deps() {
  local lock=package-lock.json stamp=node_modules/.jeryu-lockfile-sha256 want problems
  if [ ! -f "$lock" ]; then
    echo "[web-deps] no $lock in $(pwd)" >&2
    return 1
  fi
  want="$(sha256sum "$lock" | cut -d' ' -f1)"
  if ! _web_deps_current "$stamp" "$want"; then
    _web_deps_locked _web_deps_install "$stamp" "$want" || return 1
  fi
  problems="$(_web_deps_audit)" || return 1
  [ -n "$problems" ] || return 0
  {
    echo "[web-deps] node_modules does not match package-lock.json:"
    printf '%s\n' "$problems" | sed 's/^/[web-deps]   /'
    echo "[web-deps] remove node_modules and run 'npm ci' to rebuild it from the lockfile."
  } >&2
  return 1
}

# The Playwright version the lockfile pins, which decides the browser build.
_web_deps_playwright_version() {
  node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const entry = Object.entries(lock.packages ?? {}).find(
  ([key]) => key.endsWith('node_modules/@playwright/test')
);
if (!entry?.[1]?.version) {
  console.error('[web-deps] package-lock.json pins no @playwright/test version');
  process.exit(1);
}
process.stdout.write(entry[1].version);
NODE
}

# Make the Playwright browser cache carry the build this branch's Playwright
# expects. The cache is shared by every checkout on the host, so the stamp and
# its lock live beside it rather than in a tree.
ensure_playwright_browsers() {
  local want cache stamp guard fd status=0
  want="$(_web_deps_playwright_version)" || return 1
  cache="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
  mkdir -p "$cache"
  stamp="$cache/.jeryu-playwright-version"
  guard="$cache/.jeryu-playwright.lock"
  exec {fd}>>"$guard"
  flock "$fd"
  if [ "$(cat "$stamp" 2>/dev/null)" != "$want" ] ||
    ! find "$cache" -maxdepth 1 -type d -name 'chromium-*' 2>/dev/null | grep -q .; then
    echo "[web-deps] installing the chromium build playwright $want expects" >&2
    if [ -n "${CI:-}" ]; then
      npm --workspace @jeryu/web exec -- playwright install --with-deps chromium
    else
      npm --workspace @jeryu/web exec -- playwright install chromium
    fi
    status=$?
    if [ "$status" -eq 0 ]; then
      printf '%s\n' "$want" >"$stamp"
    else
      echo "[web-deps] playwright install failed: the chromium build for playwright $want" >&2
      echo "[web-deps] is not on this host and could not be downloaded." >&2
    fi
  fi
  exec {fd}>&-
  return "$status"
}
