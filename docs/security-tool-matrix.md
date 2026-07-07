# Security Tool Matrix

The `jeryu-web` security lane (`tools/security-lane.sh` → `ops/ci/security.sh`,
run by `just security` and inside the `jeryu-web/required` gate).

| Concern | Tool | Command | Blocking |
| --- | --- | --- | --- |
| Secret scanning | gitleaks | `gitleaks detect` (tracked + untracked) | yes (secrets) |
| Committed secrets | built-in | `.env` file guard | yes |
| JS dependency advisories | npm | `npm audit --audit-level=high` (apps/web) | recorded |
| Rust dependency advisories | cargo-audit | `cargo audit` (when `Cargo.lock`) | recorded |
| Workflow security lint | zizmor | `zizmor .github/workflows` | recorded |
| SBOM / provenance | syft | `syft dir:. -o spdx-json` | recorded |

Dependency advisories and workflow findings are **recorded** (written to
`target/security/`) rather than merge-blocking until triaged; committed secrets
and `.env` files are a hard fail. Enable network-dependent scans with
`JERYU_SECURITY_NETWORK=1` (set in CI). Evidence receipt:
`target/security/evidence.json`.
