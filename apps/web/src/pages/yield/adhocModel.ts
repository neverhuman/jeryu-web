// adhocModel.ts — what the Yield page decides about ad-hoc agent sessions:
// sessions people ran by hand, outside the todo queue, whose token spend a
// reporter attributes to a repository or a family. The spend is shown beside
// the todo economics and never mixed into them: cost per merged change, yield
// and every figure above it count todo work only.

import type { YieldAdhoc, YieldAdhocBy, YieldAdhocGroup, YieldAdhocWeek } from '../../api/types';
import { formatRate, formatUsd, share } from './yieldModel';

export const ADHOC_BY_PARAM = 'adhoc';

/** The cuts of the ad-hoc table, in the order the switcher shows them. */
export const ADHOC_BYS: readonly { id: YieldAdhocBy; label: string }[] = [
  { id: 'family', label: 'Family' },
  { id: 'repo', label: 'Repository' },
  { id: 'agent', label: 'Agent' },
  { id: 'model', label: 'Model' },
];
export const DEFAULT_ADHOC_BY: YieldAdhocBy = 'family';

/** The cut the address asks for; anything else is the default. */
export function parseAdhocBy(params: URLSearchParams): YieldAdhocBy {
  const raw = params.get(ADHOC_BY_PARAM);
  return ADHOC_BYS.find((by) => by.id === raw)?.id ?? DEFAULT_ADHOC_BY;
}

/**
 * Whether the section shows: `absent` (an older server sent nothing, so the
 * section is hidden), `quiet` (no session spent in the window) or `spent`.
 */
export type AdhocState = 'absent' | 'quiet' | 'spent';

export function adhocState(adhoc: YieldAdhoc | undefined): AdhocState {
  if (!adhoc) return 'absent';
  const rows = adhoc.by_family.length + adhoc.by_repo.length + adhoc.by_agent.length + adhoc.by_model.length;
  return adhoc.total_usd > 0 || adhoc.sessions > 0 || rows > 0 ? 'spent' : 'quiet';
}

/** The rows of one cut. */
export function adhocGroups(adhoc: YieldAdhoc, by: YieldAdhocBy): YieldAdhocGroup[] {
  switch (by) {
    case 'family':
      return adhoc.by_family;
    case 'repo':
      return adhoc.by_repo;
    case 'agent':
      return adhoc.by_agent;
    case 'model':
      return adhoc.by_model;
  }
}

/** A row's part of the ad-hoc total, in whole percent. */
export function adhocShare(row: Pick<YieldAdhocGroup, 'usd'>, adhoc: Pick<YieldAdhoc, 'total_usd'>): string {
  return formatRate(share(row.usd, adhoc.total_usd));
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export interface AdhocTile {
  id: 'total' | 'sessions' | 'unattributed';
  label: string;
  value: string;
  detail: string;
}

/** The three numbers at the head of the section. */
export function adhocTiles(adhoc: YieldAdhoc): AdhocTile[] {
  const perSession = adhoc.sessions > 0 ? adhoc.total_usd / adhoc.sessions : null;
  return [
    {
      id: 'total',
      label: 'Ad-hoc spend',
      value: formatUsd(adhoc.total_usd),
      detail: 'not in cost per merged change',
    },
    {
      id: 'sessions',
      label: 'Sessions',
      value: String(adhoc.sessions),
      detail: perSession === null ? 'no session reported spend' : `${formatUsd(perSession)} a session on average`,
    },
    {
      id: 'unattributed',
      label: 'Unattributed',
      value: formatUsd(adhoc.unattributed_usd),
      detail: `${formatRate(share(adhoc.unattributed_usd, adhoc.total_usd))} named no repository or family`,
    },
  ];
}

/** The sentence under the section title. */
export function adhocSummary(adhoc: YieldAdhoc, days: number): string {
  return `${formatUsd(adhoc.total_usd)} over ${plural(adhoc.sessions, 'session')} people ran by hand in the last ${days} days, outside the todo queue.`;
}

export interface AdhocBar {
  week: string;
  usd: number;
  /** 0..1 of the tallest bar's scale. */
  fraction: number;
  title: string;
}

/** One bar per week, scaled to the largest week; nothing when no week spent. */
export function adhocWeekBars(weekly: readonly YieldAdhocWeek[]): AdhocBar[] {
  const max = Math.max(0, ...weekly.map((row) => row.usd));
  if (!(max > 0)) return [];
  return weekly.map((row) => ({
    week: row.week,
    usd: row.usd,
    fraction: row.usd / max,
    title: `Week of ${row.week}: ${formatUsd(row.usd)}`,
  }));
}

/** What the weekly bars say to a screen reader. */
export function adhocWeekSummary(bars: readonly AdhocBar[]): string {
  if (bars.length === 0) return 'Ad-hoc spend by week: no spend in this window.';
  const first = bars[0];
  const last = bars[bars.length - 1];
  return `Ad-hoc spend by week, ${first.week} to ${last.week}: ${bars
    .map((bar) => `${bar.week} ${formatUsd(bar.usd)}`)
    .join(', ')}.`;
}

const REMAINDER_LABELS: Record<YieldAdhocBy, string> = {
  family: 'No family',
  repo: 'No repository',
  agent: 'No agent named',
  model: 'No model named',
};

/**
 * The spend no row of the cut carries (spend without a repository is in no
 * repository row, for one), so the table adds up to the total. Null under a
 * cent, which is rounding rather than spend.
 */
export function adhocRemainder(
  adhoc: YieldAdhoc,
  by: YieldAdhocBy
): { label: string; usd: number } | null {
  const listed = adhocGroups(adhoc, by).reduce((sum, row) => sum + row.usd, 0);
  const usd = adhoc.total_usd - listed;
  return usd >= 0.01 ? { label: REMAINDER_LABELS[by], usd } : null;
}
