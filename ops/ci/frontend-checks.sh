#!/usr/bin/env bash
# Reproducible frontend checks. The native gate separately requires its governed
# auditor; this script does not grant score, review, merge, or release authority.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
mkdir -p target
exec > >(tee target/frontend-checks.log) 2>&1
source ops/ci/web-deps.sh
ensure_web_deps
ensure_playwright_browsers
bash ops/ci/tracked-ignored.sh
JERYU_SPLIT_FULL_CHECK=1 bash ops/ci/check.sh
npm --workspace @jeryu/web run lint
npm --workspace @jeryu/web run test:coverage
npm --workspace @jeryu/web run test:contracts
npm --workspace @jeryu/web run build
npm --workspace @jeryu/web run test:e2e:ci
npm --workspace @jeryu/web run build-storybook
npm --workspace @jeryu/web run ux-qa
bash ops/ci/security.sh
