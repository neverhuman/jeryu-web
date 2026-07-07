#!/usr/bin/env bash
# Canonical jeryu-web security lane wrapper.
#
# Runs the operational security posture and is the single entry point referenced
# by `just security`, the root `npm run security` script, and CI. The lane runs:
#   gitleaks detect   — secret scanning
#   npm audit --audit-level=high   — JS dependency advisories (apps/web)
#   cargo audit       — Rust dependency advisories (when a Cargo.lock exists)
#   zizmor            — GitHub Actions workflow security lint
#   syft              — SPDX-JSON SBOM generation
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"
exec bash ops/ci/security.sh
