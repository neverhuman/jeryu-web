// version.ts — wire shape for `GET /api/v1/version` (jeryu-api `github/mod.rs`).

/**
 * What the running server says it is. `commit` and `webCommit` are null when
 * the build did not know them, so neither is safe to read without a check.
 */
export interface ServerVersion {
  /** Semantic version of the API binary, e.g. `5.0.0`. */
  version: string;
  /** Always `jeryu-api`; the server names itself so a proxy swap is visible. */
  name: string;
  /** The jeryu-deploy commit the binary was built from. */
  commit: string | null;
  /** The jeryu-web commit the served bundle was built from. */
  webCommit: string | null;
}
