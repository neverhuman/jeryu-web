// qualityGateModel.ts — projections for the Quality gate pages.
//
// Everything the pages need that is arithmetic rather than markup lives here:
// the ordering of the two tables, the one rule the overview points at, the
// geometry of the daily pass/fail chart, and the routes between the three
// pages. Keeping it apart keeps the pages readable and the maths tested.

import type {
  QualityGateDay,
  QualityGateRepoSummary,
  QualityGateRuleSummary,
} from '../../api/types';

/** Where the Quality gate pages live. */
export const QUALITY_GATE_PATH = '/quality-gate';

export function qualityGateRulePath(rule: string): string {
  return `${QUALITY_GATE_PATH}/rules/${encodeURIComponent(rule)}`;
}

/** `repo` is `owner/name`; both segments stay separate in the URL. */
export function qualityGateHeadPath(repo: string, sha: string): string {
  const [owner = '', name = ''] = repo.split('/');
  return `${QUALITY_GATE_PATH}/heads/${encodeURIComponent(owner)}/${encodeURIComponent(
    name
  )}/${encodeURIComponent(sha)}`;
}

/** The repository's own code page, at the scored commit, on the flagged line. */
export function repoCodeHref(repo: string, sha: string, path: string, line: number): string {
  return `/repos/jeryu/${repo}/blob/${encodeURIComponent(sha)}/${path}#L${line}`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 8);
}

/** A rate in 0..1 as whole percent; `—` when there was nothing to rate. */
export function percent(rate: number, of = 1): string {
  if (of === 0 || !Number.isFinite(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

/** Rules worst first: most findings, then most disputed, then by name. */
export function sortRules(rules: QualityGateRuleSummary[]): QualityGateRuleSummary[] {
  return [...rules].sort(
    (a, b) =>
      b.failures - a.failures ||
      b.dispute_rate - a.dispute_rate ||
      a.rule.localeCompare(b.rule)
  );
}

/** Repositories worst first: highest fail rate, then most heads flagged. */
export function sortRepos(repos: QualityGateRepoSummary[]): QualityGateRepoSummary[] {
  return [...repos].sort(
    (a, b) =>
      b.fail_rate - a.fail_rate ||
      b.heads_failed - a.heads_failed ||
      a.repo.localeCompare(b.repo)
  );
}

/**
 * The rule to drill into from the overview: the one failing most often. The
 * overview has one obvious action, and this is what it points at.
 */
export function topFailingRule(
  rules: QualityGateRuleSummary[]
): QualityGateRuleSummary | undefined {
  return sortRules(rules).find((rule) => rule.failures > 0);
}

export interface DailyBar {
  day: string;
  x: number;
  width: number;
  /** Passing heads: the lower block. */
  passY: number;
  passHeight: number;
  /** Heads the gate would have blocked: the upper block. */
  failY: number;
  failHeight: number;
  title: string;
}

export interface DailyGeometry {
  bars: DailyBar[];
  /** Tallest day, and the top of the scale. */
  max: number;
}

/** Stacked pass/fail columns over `width` × `height` user units. */
export function dailyGeometry(
  days: QualityGateDay[],
  width: number,
  height: number
): DailyGeometry {
  const max = Math.max(1, ...days.map((day) => day.passed + day.failed));
  const slot = days.length > 0 ? width / days.length : width;
  const barWidth = Math.max(1, slot * 0.7);
  const bars = days.map((day, index) => {
    const total = day.passed + day.failed;
    const totalHeight = (total / max) * height;
    const failHeight = total === 0 ? 0 : (day.failed / max) * height;
    const passHeight = totalHeight - failHeight;
    return {
      day: day.day,
      x: index * slot + (slot - barWidth) / 2,
      width: barWidth,
      failY: height - totalHeight,
      failHeight,
      passY: height - passHeight,
      passHeight,
      title: `${day.day}: ${day.passed} passed, ${day.failed} would have been blocked`,
    };
  });
  return { bars, max };
}

/** One sentence under the tiles: what the window says about the gate. */
export function windowSummary(
  windowDays: number,
  headsScored: number,
  headsFailed: number
): string {
  if (headsScored === 0) {
    return `No head was scored in the last ${windowDays} days.`;
  }
  return `${headsFailed} of ${headsScored} scored head${
    headsScored === 1 ? '' : 's'
  } scored below the floor in the last ${windowDays} days.`;
}
