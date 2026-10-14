// scorecard.ts — wire types for the admin delivery scorecard:
//
//   GET /api/v1/scorecard?window=7d|30d|90d&family=&repo=
//
// Every metric key is present in the response. Missing sources are represented
// as `value: null` with `unknown.reason`, never as numeric zero.

export type ScorecardWindow = '7d' | '30d' | '90d';

export interface ScorecardQuery {
  window?: ScorecardWindow;
  family?: string;
  repo?: string;
}

export interface ScorecardUnknown {
  reason: string;
}

export interface ScorecardMetric {
  value: unknown | null;
  previous: unknown | null;
  daily: Array<unknown | null>;
  sample_size: number;
  source: string;
  detail: unknown | null;
  unknown?: ScorecardUnknown | null;
}

export interface ScorecardReport {
  schema_version: string;
  generated_at: string;
  window: ScorecardWindow;
  family: string | null;
  repo: string | null;
  metrics: Record<string, ScorecardMetric>;
}
