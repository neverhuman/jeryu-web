#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

mkdir -p target/jankurai/e2e

# shellcheck source=ops/ci/web-deps.sh
source ops/ci/web-deps.sh
ensure_web_deps
ensure_playwright_browsers

npm --workspace @jeryu/web run test:e2e:actions
npm --workspace @jeryu/web run test:e2e:matrix

cat > target/jankurai/e2e/receipt.json <<'JSON'
{
  "schema_version": "jeryu.web.e2e/v1",
  "lane": "e2e",
  "mode": "ui-only",
  "project": "chromium",
  "action_matrix": "apps/web/e2e/action-matrix.json",
  "junit": "apps/web/playwright-report/junit.xml"
}
JSON
