#!/usr/bin/env bash
# Fail-closed Jankurai evidence lane. Every tool runs strictly: a failing tool
# fails the lane, and nothing here synthesizes an artifact. Output goes only
# under target/jankurai/. The ratchet against protected main is the forge's
# hosted audit of main (ADR 0011/0012), not a baseline this run produces.
set -euo pipefail
source ops/ci/lib.sh
require_jankurai

mkdir -p target/jankurai/security target/jankurai/proofbind

jankurai audit . --mode advisory --policy agent/audit-policy.toml \
  --json target/jankurai/repo-score.json \
  --md target/jankurai/repo-score.md \
  --repair-queue-jsonl target/jankurai/repair-queue.jsonl \
  --full --no-score-history

jankurai security run . --out target/jankurai/security/evidence.json

git rev-parse --verify origin/main >/dev/null 2>&1 || {
  echo "proof evidence needs origin/main to compute the changed set" >&2
  exit 1
}
jankurai proofbind verify . --changed-from origin/main \
  --out target/jankurai/proofbind/surface-witness.json \
  --obligations-out target/jankurai/proofbind/obligations.json

jankurai copy-code . --json target/jankurai/copy-code.json --md target/jankurai/copy-code.md

jankurai migrate . --analyze \
  --out target/jankurai/migration-report.json --md target/jankurai/migration-report.md

printf 'proof evidence ok\n'
