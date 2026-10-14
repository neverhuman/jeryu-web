// scorecardModel.ts — pure formatting and layout decisions for /scorecard.

import type { ScorecardMetric, ScorecardWindow } from '../../api/types';

export const SCORECARD_PATH = '/scorecard';
export const SCORECARD_WINDOWS: readonly ScorecardWindow[] = ['7d', '30d', '90d'];
export const DEFAULT_SCORECARD_WINDOW: ScorecardWindow = '30d';
export const SCORECARD_WINDOW_PARAM = 'window';
export const SCORECARD_REPO_PARAM = 'repo';
export const SCORECARD_TAB_PARAM = 'tab';

export type ScorecardTab = 'scorecard' | 'outcomes';

export function parseWindow(params: URLSearchParams): ScorecardWindow {
  const raw = params.get(SCORECARD_WINDOW_PARAM);
  return SCORECARD_WINDOWS.includes(raw as ScorecardWindow)
    ? (raw as ScorecardWindow)
    : DEFAULT_SCORECARD_WINDOW;
}

export function parseTab(params: URLSearchParams): ScorecardTab {
  return params.get(SCORECARD_TAB_PARAM) === 'outcomes' ? 'outcomes' : 'scorecard';
}

export function windowLabel(window: ScorecardWindow): string {
  return `${window.slice(0, -1)} d`;
}

export function metric(report: Record<string, ScorecardMetric>, id: string): ScorecardMetric {
  return (
    report[id] ?? {
      value: null,
      previous: null,
      daily: [],
      sample_size: 0,
      source: 'scorecard contract',
      detail: null,
      unknown: { reason: 'source_not_landed: scorecard metric' },
    }
  );
}

export function sourceNeed(m: ScorecardMetric): string {
  const reason = m.unknown?.reason ?? 'source_not_recorded';
  const named = reason.includes(':') ? reason.split(':').slice(1).join(':').trim() : '';
  return named || m.source || 'source';
}

export function unknownText(m: ScorecardMetric): string {
  return `Not measured yet — needs ${sourceNeed(m)}`;
}

export function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : 2;
  return `${value < 0 ? '-' : ''}$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(abs)}`;
}

export function formatDuration(seconds: number): string {
  const abs = Math.abs(seconds);
  const sign = seconds < 0 ? '-' : '';
  if (abs < 60) return `${sign}${Math.round(abs)} s`;
  const minutes = abs / 60;
  if (minutes < 90) return `${sign}${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${sign}${Math.round(hours * 10) / 10} h`;
  return `${sign}${Math.round((hours / 24) * 10) / 10} d`;
}

export function formatPercent(value: number): string {
  return `${formatCount(value)}%`;
}

export type MetricKind = 'count' | 'duration' | 'money' | 'percent' | 'ratio' | 'object';

export function formatMetricValue(value: unknown, kind: MetricKind): string {
  const number = asNumber(value);
  if (number !== null) {
    if (kind === 'duration') return formatDuration(number);
    if (kind === 'money') return formatUsd(number);
    if (kind === 'percent') return formatPercent(number);
    if (kind === 'ratio') return formatPercent(number * 100);
    return formatCount(number);
  }
  if (typeof value === 'object' && value !== null) return 'See detail';
  return '—';
}

export function formatDelta(current: unknown, previous: unknown, kind: MetricKind): string {
  const now = asNumber(current);
  const before = asNumber(previous);
  if (now === null || before === null) return 'No previous window';
  const delta = now - before;
  if (Math.abs(delta) < 0.0001) return 'No change';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${formatMetricValue(delta, kind)} vs previous`;
}

export function sparklinePoints(values: readonly (unknown | null)[]): string {
  const numbers = values.map(asNumber);
  const known = numbers.filter((n): n is number => n !== null);
  if (known.length < 2) return '';
  const min = Math.min(...known);
  const max = Math.max(...known);
  const spread = max - min || 1;
  return numbers
    .map((n, index) => {
      if (n === null) return null;
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 28 - ((n - min) / spread) * 24;
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .filter((point): point is string => point !== null)
    .join(' ');
}

export function drilldownHref(id: string, window: ScorecardWindow, family: string, repo: string): string {
  const params = new URLSearchParams({ metric: id, window });
  if (family) params.set('family', family);
  if (repo) params.set('repo', repo);
  // Use only registered surfaces and exact metric identities. Substring
  // matches confused "prod" with PRs and sent flow metrics to a missing route.
  const targets: Record<string, string> = {
    lead_time_p50: '/work', lead_time_p85: '/work', lead_time_spread: '/work',
    flow_efficiency: '/work', wip_by_station: '/work', station_breakdown: '/work',
    holds_by_age_and_action: '/work', eta_error: '/work',
    completed_work_items_per_day: '/work', false_done_rate: '/work',
    cost_per_successful_change: '/work', human_minutes_per_successful_change: '/work',
    rework_rate: '/work', arrival_vs_completion: '/work', completed_work_mix: '/work',
    worker_slot_utilisation: '/work',
    change_failure_rate: '/in-flight', review_catch_rate: '/in-flight',
    surviving_net_lines_per_day: '/in-flight', raw_net_lines_per_day: '/in-flight',
    prs_merged_per_day: '/in-flight', merged_but_unreleased: '/releases',
    releases_per_day: '/releases', escaped_defects_to_main: '/in-flight',
    main_red_time_per_repo: '/in-flight', review_cost: '/in-flight',
    escaped_defects_to_prod: '/activity', time_to_detect: '/activity', time_to_restore: '/activity',
    gate_queue_wait: '/quality-gate', gate_flake_rate: '/quality-gate',
    runner_utilisation: '/runners', hypotheses_checked_and_met: '/yield',
  };
  return `${targets[id] ?? '/repos'}?${params.toString()}`;
}

export interface TileSpec {
  id: string;
  label: string;
  kind: MetricKind;
  rowLink: 'Todos' | 'Pull requests' | 'Incidents' | 'Rows';
}

export interface SectionSpec {
  title: string;
  tiles: TileSpec[];
}

export const HEADLINE_TILES: readonly TileSpec[] = [
  { id: 'lead_time_p50', label: 'Lead time p50', kind: 'duration', rowLink: 'Todos' },
  { id: 'change_failure_rate', label: 'Change failure rate', kind: 'percent', rowLink: 'Pull requests' },
  { id: 'time_to_restore', label: 'Time to restore', kind: 'duration', rowLink: 'Incidents' },
  { id: 'review_catch_rate', label: 'Review catch rate', kind: 'percent', rowLink: 'Pull requests' },
  { id: 'false_done_rate', label: 'False-done rate', kind: 'percent', rowLink: 'Todos' },
  { id: 'cost_per_successful_change', label: 'Cost per successful change', kind: 'money', rowLink: 'Todos' },
];

export const SECTIONS: readonly SectionSpec[] = [
  {
    title: 'Speed',
    tiles: [
      { id: 'lead_time_p85', label: 'Lead time p85', kind: 'duration', rowLink: 'Todos' },
      { id: 'flow_efficiency', label: 'Flow efficiency', kind: 'ratio', rowLink: 'Todos' },
      { id: 'lead_time_spread', label: 'Lead-time spread', kind: 'duration', rowLink: 'Todos' },
      { id: 'gate_queue_wait', label: 'Gate queue wait', kind: 'object', rowLink: 'Todos' },
    ],
  },
  {
    title: 'Volume',
    tiles: [
      { id: 'completed_work_items_per_day', label: 'Items/day', kind: 'count', rowLink: 'Todos' },
      { id: 'false_done_rate', label: 'False-done guardrail', kind: 'percent', rowLink: 'Todos' },
      { id: 'releases_per_day', label: 'Releases/day', kind: 'object', rowLink: 'Pull requests' },
      { id: 'change_failure_rate', label: 'Failure guardrail', kind: 'percent', rowLink: 'Pull requests' },
      { id: 'surviving_net_lines_per_day', label: 'Surviving net lines/day', kind: 'count', rowLink: 'Pull requests' },
      { id: 'rework_rate', label: 'Rework guardrail', kind: 'percent', rowLink: 'Todos' },
    ],
  },
  {
    title: 'Inventory',
    tiles: [
      { id: 'wip_by_station', label: 'WIP by station', kind: 'object', rowLink: 'Todos' },
      { id: 'merged_but_unreleased', label: 'Merged but unreleased', kind: 'count', rowLink: 'Pull requests' },
      { id: 'holds_by_age_and_action', label: 'Holds by age and action', kind: 'count', rowLink: 'Todos' },
      { id: 'arrival_vs_completion', label: 'Arrival vs completion', kind: 'object', rowLink: 'Todos' },
    ],
  },
  {
    title: 'Quality',
    tiles: [
      { id: 'change_failure_rate', label: 'Change failure rate', kind: 'percent', rowLink: 'Pull requests' },
      { id: 'escaped_defects_to_main', label: 'Escaped defects to main', kind: 'percent', rowLink: 'Pull requests' },
      { id: 'escaped_defects_to_prod', label: 'Escaped defects to prod', kind: 'percent', rowLink: 'Incidents' },
      { id: 'false_done_rate', label: 'False-done rate', kind: 'percent', rowLink: 'Todos' },
      { id: 'review_catch_rate', label: 'Review catch rate', kind: 'percent', rowLink: 'Pull requests' },
      { id: 'rework_rate', label: 'Rework rate', kind: 'percent', rowLink: 'Todos' },
      { id: 'main_red_time_per_repo', label: 'Main red time per repo', kind: 'percent', rowLink: 'Pull requests' },
      { id: 'gate_flake_rate', label: 'Gate flake rate', kind: 'percent', rowLink: 'Pull requests' },
    ],
  },
  {
    title: 'Recovery',
    tiles: [
      { id: 'time_to_detect', label: 'Time to detect', kind: 'duration', rowLink: 'Incidents' },
      { id: 'time_to_restore', label: 'Time to restore', kind: 'duration', rowLink: 'Incidents' },
    ],
  },
  {
    title: 'Economics',
    tiles: [
      { id: 'cost_per_successful_change', label: 'Cost per successful change', kind: 'money', rowLink: 'Todos' },
      { id: 'human_minutes_per_successful_change', label: 'Human minutes per successful change', kind: 'duration', rowLink: 'Todos' },
      { id: 'review_cost', label: 'Review cost', kind: 'money', rowLink: 'Pull requests' },
    ],
  },
  {
    title: 'Predictability & capacity',
    tiles: [
      { id: 'eta_error', label: 'ETA error', kind: 'duration', rowLink: 'Todos' },
      { id: 'lead_time_spread', label: 'Lead-time spread', kind: 'duration', rowLink: 'Todos' },
      { id: 'gate_queue_wait', label: 'Gate queue wait', kind: 'object', rowLink: 'Todos' },
      { id: 'worker_slot_utilisation', label: 'Worker slot utilisation', kind: 'percent', rowLink: 'Rows' },
      { id: 'runner_utilisation', label: 'Runner utilisation', kind: 'percent', rowLink: 'Rows' },
    ],
  },
  {
    title: 'Work mix',
    tiles: [
      { id: 'completed_work_mix', label: 'Completed work mix', kind: 'object', rowLink: 'Todos' },
    ],
  },
];
