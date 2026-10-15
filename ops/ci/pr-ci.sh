#!/usr/bin/env bash
# Canonical local PR gate for jeryu-web. host-ci prefers this script and posts the
# `jeryu-web/required` check-run from its exit status; .github/workflows/ci.yml runs
# the same lanes on the GitHub mirror so the two surfaces cannot diverge.
set -euo pipefail

# BEGIN GENERATED JANKURAI PIN — DO NOT EDIT
# The governed Jankurai identity is the binary installed on this host and its
# installation receipt: require_jankurai verifies both and exports JERYU_JANKURAI_*
# from the receipt. The one pin of record is jeryu-tool's tool-manifest.toml.
# END GENERATED JANKURAI PIN


repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

# Cheapest gate first: a tracked file that .gitignore excludes makes every
# later lane rewrite it and leaves the tree dirty, so stop here.
echo "[pr-ci] tracked-but-ignored files" >&2
bash ops/ci/tracked-ignored.sh

# jeryu governs the worker count from live load; never default high.
if [ -n "${JERYU_CI_JOBS:-}" ]; then
  JOBS="${JERYU_CI_JOBS}"
elif command -v jeryu-ci-governor >/dev/null 2>&1; then
  JOBS="$(jeryu-ci-governor 2>/dev/null || echo 8)"
else
  JOBS=8
fi
export JERYU_CI_JOBS="$JOBS"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-$JOBS}"

# Resolve and verify the absolute governed auditor before any lane runs.
source ops/ci/lib.sh
require_jankurai

# Verify only this PR worktree against the family manifest; the post-rollout
# control-plane check verifies the complete canonical family. The renderer is
# jeryu-tool's, outside this checkout: a missing one fails closed, and one inside
# this checkout (which the pull request under test could have written) is refused.
if [ -z "${JERYU_TOOL_RENDER+x}" ]; then
JERYU_TOOL_RENDER="$repo_root/../jeryu-tool/ops/render-tool-manifest.sh"
fi
[ -n "$JERYU_TOOL_RENDER" ] || { echo "[pr-ci] missing JERYU_TOOL_RENDER" >&2; exit 1; }
[ -x "$JERYU_TOOL_RENDER" ] || { echo "[pr-ci] renderer is not executable: $JERYU_TOOL_RENDER" >&2; exit 1; }
render_real="$(realpath "$JERYU_TOOL_RENDER")"
case "$render_real/" in
"$(realpath "$repo_root")/"*) echo "[pr-ci] refusing a renderer inside this checkout: $JERYU_TOOL_RENDER" >&2; exit 1 ;;
esac
echo "[pr-ci] jankurai pin drift check" >&2
consumer_repo="$(awk -F'\"' '/^workspace =/ {print $2; exit}' agent/audit-policy.toml)"
bash "$render_real" --check --repo "$consumer_repo" \
--repo-root "$consumer_repo=$repo_root"

# Install web deps FIRST: the check lane already typechecks the workspace, and a
# branch that adds a dependency must not meet it with the previous run's tree.
# shellcheck source=ops/ci/web-deps.sh
source ops/ci/web-deps.sh
ensure_web_deps
ensure_playwright_browsers

echo "[pr-ci] (jobs=$JOBS) standard lanes" >&2
bash ops/ci/fast.sh
JERYU_SPLIT_FULL_CHECK=1 bash ops/ci/check.sh
bash ops/ci/score.sh
bash ops/ci/security.sh
bash ops/ci/artifact_support.sh

echo "[pr-ci] web required checks" >&2
# check.sh (JERYU_SPLIT_FULL_CHECK=1) has already typechecked the workspace.
npm --workspace @jeryu/web run test:coverage
npm --workspace @jeryu/web run test:contracts
npm --workspace @jeryu/web run build
# Every later lane serves or inspects this one build; none rebuilds it.
export JERYU_WEB_DIST_FRESH=1
bash ops/ci/dist-reproducible.sh
bash ops/ci/web-flows.sh
npm --workspace @jeryu/web run test:e2e:ci
npm --workspace @jeryu/web run build-storybook
npm --workspace @jeryu/web run ux-qa
echo "[pr-ci] jeryu-web OK" >&2
