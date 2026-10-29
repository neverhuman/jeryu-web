// headlineModel.ts — the three numbers that say how the factory is doing, in
// words: lead time (filed to production, and claim to main), the share of todos
// that needed a person, and the share of merged changes that turned main or the
// green ref red. `GET /api/v1/yield` carries them; Flow and Yield lead with
// them. Kept pure so the wording is tested without a browser.
//
// A number the window cannot support reads `—` with its reason beside it, as
// Flow's own numbers do: a blank beats a made-up median.

import type { YieldBadChangeRate, YieldExceptionRate, YieldHeadline, YieldSpan } from '../../api/types';

export type HeadlineId = 'lead-time' | 'exception-rate' | 'bad-change-rate';

export interface HeadlineTile {
  id: HeadlineId;
  label: string;
  value: string;
  detail: string;
}

/** Why a number is blank, in the reader's words. */
const WHY: Record<string, string> = {
  too_few_samples: 'too few to read a median',
  no_merged_changes: 'nothing merged in this window',
};

export function unknownReason(code: string | undefined): string | null {
  if (!code) return null;
  return WHY[code] ?? code.replace(/_/g, ' ');
}

/**
 * A duration in the largest two units that fit: `4 h 10 m`, `2 d 6 h`, `45 m`,
 * `30 s`. Null reads `—`.
 */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '—';
  }
  const seconds = Math.round(totalSeconds);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = minutes - hours * 60;
    return rest ? `${hours} h ${rest} m` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours - days * 24;
  return rest ? `${days} d ${rest} h` : `${days} d`;
}

/** A 0..1 rate in whole percent; `—` when it is undefined. */
export function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** `p50 (p90 at the 90th)`, or `—` with the reason the window gives none. */
export function spanValue(span: YieldSpan): string {
  return formatDuration(span.p50);
}

export function spanDetail(span: YieldSpan, what: string): string {
  const why = unknownReason(span.unknown);
  if (span.p50 === null) {
    return `${what}: ${plural(span.n, 'todo')}${why ? `, ${why}` : ''}`;
  }
  const p90 = span.p90 === null ? '' : `, ${formatDuration(span.p90)} at the 90th`;
  return `${what}: ${plural(span.n, 'todo')}${p90}`;
}

/** The reasons a person was needed, most todos first. */
export function topReasons(rate: YieldExceptionRate, most = 2): string[] {
  return Object.entries(rate.reasons)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, most)
    .map(([name, count]) => `${name.replace(/_/g, ' ')} ${count}`);
}

function badChangeDetail(bad: YieldBadChangeRate): string {
  const why = unknownReason(bad.unknown);
  if (bad.rate === null) {
    return why ?? 'no merged change to judge';
  }
  const flaky = bad.flaky_reds
    ? `, ${plural(bad.flaky_reds, 'red stretch', 'red stretches')} a rerun cleared`
    : '';
  return `${bad.bad} of ${plural(bad.changes, 'merged change')} turned main red or failed to deploy${flaky}`;
}

/**
 * The three tiles, headline first. Lead time leads with filed to production --
 * the whole wait a person asking for work feels -- and names claim to main
 * beside it.
 */
export function headlineTiles(headline: YieldHeadline): HeadlineTile[] {
  const { filed_to_prod_s: prod, claim_to_main_s: main } = headline.lead_time;
  const exception = headline.exception_rate;
  return [
    {
      id: 'lead-time',
      label: 'Lead time, filed to production',
      value: spanValue(prod),
      detail: [spanDetail(prod, 'median'), spanDetail(main, 'claim to main')].join(' · '),
    },
    {
      id: 'exception-rate',
      label: 'Needed a person',
      value: formatPercent(exception.rate),
      detail: [
        `${exception.needed_human} of ${plural(exception.todos, 'todo')}`,
        ...topReasons(exception),
      ].join(' · '),
    },
    {
      id: 'bad-change-rate',
      label: 'Bad changes',
      value: formatPercent(headline.bad_change_rate.rate),
      detail: badChangeDetail(headline.bad_change_rate),
    },
  ];
}
