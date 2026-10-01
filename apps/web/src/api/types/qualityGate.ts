// qualityGate.ts — wire types for the quality-gate observation contract:
//
//   GET  /api/v1/quality-gate/overview?days=N
//   GET  /api/v1/quality-gate/rules/:rule?days=N
//   GET  /api/v1/quality-gate/heads/:owner/:name/:sha
//   POST /api/v1/quality-gate/findings/:id/dispute
//
// The gate is observed, not enforced: every head is scored and the result is
// recorded, so an operator can see how often it would have blocked a push
// before anyone makes it required.

/** One day of the pass/fail history. `day` is `YYYY-MM-DD` (UTC). */
export interface QualityGateDay {
  day: string;
  passed: number;
  failed: number;
}

/** How one rule behaved over the window. */
export interface QualityGateRuleSummary {
  rule: string;
  title: string;
  /**
   * Findings summed over every scored head: one problem left open across ten
   * pushes counts ten times. Prefer `latest_findings` when present.
   */
  failures: number;
  /** Repositories with any scored head in the window carrying the rule. */
  repos: number;
  /** Same as `failures`, named for what it counts; absent on an older server. */
  findings_all_heads?: number;
  /**
   * Distinct findings on each repository's latest scored head, summed over
   * repositories: what is open now. Absent on an older server.
   */
  latest_findings?: number;
  /** Repositories whose latest scored head carries the rule. */
  latest_repos?: number;
  /** Findings an admin disputed. */
  disputes: number;
  /** `disputes / failures`, 0 when the rule raised nothing. */
  dispute_rate: number;
}

/** How one repository fared over the window. */
export interface QualityGateRepoSummary {
  repo: string;
  heads_scored: number;
  heads_failed: number;
  fail_rate: number;
  /** The rule that failed this repo most often, when any did. */
  top_rule: string | null;
}

/**
 * A scoring dimension below the floor on repositories' latest heads. A score,
 * not a rule detection: the auditor files it under a rule id, but no rule
 * raised it, so it is kept out of the rule counts.
 */
export interface QualityGateDimensionSummary {
  dimension: string;
  /** Repositories whose latest scored head has the dimension below the floor. */
  repos: number;
  /** Median of those repositories' scores for the dimension. */
  median_score: number;
  floor: number;
  /** The rule id the auditor filed these results under, when it named one. */
  attributed_rule: string | null;
}

export interface QualityGateOverview {
  schema_version: number;
  generated_at: string;
  window_days: number;
  heads_scored: number;
  /** Heads that scored below the floor: what the gate would have blocked. */
  heads_failed: number;
  fail_rate: number;
  disputes: number;
  /** Repositories with a scored head in the window; absent on an older server. */
  repos_scored?: number;
  rules: QualityGateRuleSummary[];
  /** Dimension-floor results, kept out of `rules`; absent on an older server. */
  dimensions_below_floor?: QualityGateDimensionSummary[];
  repos: QualityGateRepoSummary[];
  daily: QualityGateDay[];
}

/** A scored head one rule flagged. */
export interface QualityGateFlaggedHead {
  repo: string;
  sha: string;
  branch: string;
  scored_at: string;
  score: number;
  threshold: number;
  findings: number;
  disputes: number;
}

export interface QualityGateRuleDetail {
  schema_version: number;
  rule: string;
  title: string;
  description: string;
  window_days: number;
  heads: QualityGateFlaggedHead[];
}

/** One finding on a scored head: where it is and what it saw. */
export interface QualityGateFinding {
  id: string;
  rule: string;
  title: string;
  path: string;
  line: number;
  evidence: string;
  disputed: boolean;
  dispute_reason: string | null;
  disputed_by: string | null;
  disputed_at: string | null;
}

/** One cap the auditor applied: what it means and what clears it. */
export interface QualityGateAppliedCap {
  id: string;
  meaning: string;
  how_to_clear: string;
  /** Findings on this head that the cap comes from; 0 when it has none. */
  findings: number;
}

export interface QualityGateHeadDetail {
  schema_version: number;
  repo: string;
  sha: string;
  branch: string;
  scored_at: string;
  score: number;
  threshold: number;
  passed: boolean;
  /** Every applied cap, explained; absent on an older server. */
  caps?: QualityGateAppliedCap[];
  findings: QualityGateFinding[];
}

export interface QualityGateDisputeRequest {
  reason: string;
}

export interface QualityGateDisputeResponse {
  finding: QualityGateFinding;
}
