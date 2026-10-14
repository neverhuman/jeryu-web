// scorecardTestData.ts — invented Scorecard response: acme/globex, host node-a.

import type { ScorecardMetric, ScorecardReport } from '../../api/types';

export function scoreMetric(overrides: Partial<ScorecardMetric> = {}): ScorecardMetric {
  return {
    value: null,
    previous: null,
    daily: [null, null, null, null, null, null, null],
    sample_size: 0,
    source: 'invented source',
    detail: null,
    unknown: { reason: 'source_not_landed: invented source' },
    ...overrides,
  };
}

const stations = {
  queue: { samples: 6, total_p50_s: 3600, queue_p50_s: 1800, process_p50_s: 1800 },
  work: { samples: 6, total_p50_s: 18_000, queue_p50_s: 0, process_p50_s: 18_000 },
  review: { samples: 5, total_p50_s: 7200, queue_p50_s: 3600, process_p50_s: 3600 },
  gate: { samples: 5, total_p50_s: 5400, queue_p50_s: 3600, process_p50_s: 1800 },
  deploy: { samples: 4, total_p50_s: 3600, queue_p50_s: 0, process_p50_s: 3600 },
};

const wip = {
  queue: { waiting: 1, active: 0, held: 0 },
  work: { waiting: 0, active: 2, held: 1 },
  review: { waiting: 1, active: 1, held: 0 },
  gate: { waiting: 2, active: 0, held: 0 },
  deploy: { waiting: 0, active: 1, held: 0 },
};

export const SCORECARD_REPORT: ScorecardReport = {
  schema_version: 'jeryu.scorecard/v1',
  generated_at: '2026-10-14T12:00:00Z',
  window: '7d',
  family: null,
  repo: null,
  metrics: {
    lead_time_p50: scoreMetric({
      value: 86_400,
      previous: 100_000,
      daily: [90_000, 88_000, null, 84_000, 86_400, 82_000, 80_000],
      sample_size: 6,
      source: 'flow_ledger: filed to deployed, nearest-rank p50 seconds',
      unknown: null,
    }),
    lead_time_p85: scoreMetric({
      value: 140_000,
      previous: 160_000,
      daily: [150_000, 140_000, null, 142_000, 139_000, 138_000, 136_000],
      sample_size: 6,
      source: 'flow_ledger: filed to deployed, nearest-rank p85 seconds',
      unknown: null,
    }),
    lead_time_spread: scoreMetric({ value: 53_600, previous: 60_000, sample_size: 6, unknown: null }),
    station_breakdown: scoreMetric({ value: stations, previous: stations, sample_size: 6, unknown: null }),
    flow_efficiency: scoreMetric({ value: 0.64, previous: 0.58, daily: [0.5, 0.6, 0.62, 0.7, 0.66, 0.64, 0.63], sample_size: 6, unknown: null }),
    wip_by_station: scoreMetric({ value: wip, previous: wip, sample_size: 10, unknown: null }),
    gate_queue_wait: scoreMetric({ value: { p50_s: 3600, p85_s: 7200 }, previous: { p50_s: 4500, p85_s: 8000 }, sample_size: 5, unknown: null }),
    holds_by_age_and_action: scoreMetric({ value: 2, previous: null, sample_size: 2, detail: { acting: 1, not_acting: 1 }, unknown: null }),
    completed_work_items_per_day: scoreMetric({ value: 2.4, previous: 2.1, daily: [2, 2.2, 2.1, 2.5, 2.4, 2.8, 2.6], sample_size: 17, unknown: null }),
    false_done_rate: scoreMetric({ value: 5.9, previous: 8.1, daily: [6, 5, 4, 7, 6, 5, 4], sample_size: 17, detail: { numerator: 1, denominator: 17 }, unknown: null }),
    releases_per_day: scoreMetric({ value: { releases: { 'acme/widgets': 0.4 }, deploys: { 'acme/widgets': 0.3 } }, previous: null, sample_size: 3, unknown: null }),
    change_failure_rate: scoreMetric({ value: 3.2, previous: 4, daily: [3, 4, 2, 3, 3.2, 2.8, 3.1], sample_size: 31, detail: { numerator: 1, denominator: 31 }, unknown: null }),
    rework_rate: scoreMetric({ value: 7.1, previous: 8.4, sample_size: 28, detail: { numerator: 2, denominator: 28 }, unknown: null }),
    prs_merged_per_day: scoreMetric({ value: 3.1, previous: 2.8, sample_size: 22, unknown: null }),
    arrival_vs_completion: scoreMetric({ value: { filed_per_day: 2.7, completed_per_day: 2.4, gap_per_day: 0.3 }, previous: null, sample_size: 36, unknown: null }),
    merged_but_unreleased: scoreMetric({ value: 4, previous: 5, sample_size: 4, detail: { oldest_age_s: 172_800 }, unknown: null }),
    changes_per_release: scoreMetric({ value: { p50: 3, p85: 5 }, previous: null, sample_size: 3, unknown: null }),
    successful_changes: scoreMetric({ value: 9, previous: 8, sample_size: 9, unknown: null }),
    completed_work_mix: scoreMetric({
      value: { feature: 8, fix: 5, rework: 2, ops: 3, unclassified: 1 },
      previous: null,
      sample_size: 19,
      detail: { share_of_classified_pct: { feature: 44.4, fix: 27.8, rework: 11.1, ops: 16.7 } },
      unknown: null,
    }),
    cost_per_successful_change: scoreMetric({ value: 42.25, previous: 45, daily: [40, 41, 43, 42, 44, 41, 42.25], sample_size: 9, detail: { total_usd: 380.25, changes: 9 }, unknown: null }),
    cost_per_merged_change: scoreMetric({ value: 31.1, previous: 33.2, sample_size: 17, unknown: null }),
    review_cost: scoreMetric({ value: 8.2, previous: 9.5, sample_size: 11, detail: { total_usd: 90.2, reviews: 11 }, unknown: null }),
    gate_flake_rate: scoreMetric({ value: 4.8, previous: 5.2, sample_size: 21, detail: { flaked: 1, commits: 21 }, unknown: null }),
    surviving_net_lines_per_day: scoreMetric({ source: 'line survival ledger', unknown: { reason: 'source_not_landed: line survival ledger' } }),
    raw_net_lines_per_day: scoreMetric({ source: 'durable pull request diff statistics', unknown: { reason: 'source_not_landed: pull request diff statistics' } }),
    escaped_defects_to_main: scoreMetric({ source: 'outcome ledger and review findings', unknown: { reason: 'source_not_landed: defect identities and review findings' } }),
    escaped_defects_to_prod: scoreMetric({ source: 'outcome and incident ledgers', unknown: { reason: 'source_not_landed: defect identities and incident ledger' } }),
    review_catch_rate: scoreMetric({ source: 'review finding outcomes and outcome ledger', unknown: { reason: 'source_not_landed: review finding outcomes' } }),
    main_red_time_per_repo: scoreMetric({ source: 'main health transitions', unknown: { reason: 'source_not_landed: main health transitions' } }),
    time_to_detect: scoreMetric({ source: 'incident ledger', unknown: { reason: 'source_not_landed: incident open and detect timestamps' } }),
    time_to_restore: scoreMetric({ source: 'incident ledger and successful deploy events', unknown: { reason: 'source_not_landed: incident ledger' } }),
    human_minutes_per_successful_change: scoreMetric({ source: 'human time and outcome ledgers', unknown: { reason: 'source_not_landed: human time ledger' } }),
    eta_error: scoreMetric({ source: 'immutable Flow ETA snapshots', unknown: { reason: 'source_not_recorded: Flow computes ETAs at read time and stores no snapshot' } }),
    worker_slot_utilisation: scoreMetric({ source: 'worker slot state history', unknown: { reason: 'source_not_landed: worker slot history' } }),
    runner_utilisation: scoreMetric({ source: 'runner heartbeat history', unknown: { reason: 'source_not_landed: runner heartbeat history' } }),
    hypotheses_checked_and_met: scoreMetric({ source: 'hypothesis records and release/deploy events', unknown: { reason: 'source_not_landed: hypothesis records' } }),
  },
};
