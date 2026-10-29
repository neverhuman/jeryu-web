// yieldHeadline.ts — the `headline` part of `GET /api/v1/yield`, checked field
// by field. It arrived after the rest of the report, so an older server leaves
// it out and the pages that lead with it hide the block. A value that is not an
// object is treated the same way; inside one, a count that is missing or not
// finite reads 0, a percentile that is not finite reads null (a blank beats a
// made-up median), and a rate is kept only when it is a share between 0 and 1.

import type {
  YieldBadChangeRate,
  YieldExceptionRate,
  YieldHeadline,
  YieldSpan,
} from './types/yield';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A finite, non-negative count; anything else reads 0. */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** A finite, non-negative number of seconds, or null. */
function seconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** A share, 0..1, or null: a "rate" outside that is not one. */
function rate(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function reason(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** `{name: count}` of the counts that are real; anything else is dropped. */
function tally(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const out: Record<string, number> = {};
  for (const [name, raw] of Object.entries(value)) {
    const many = count(raw);
    if (name.trim() !== '' && many > 0) out[name] = many;
  }
  return out;
}

function spanOf(value: unknown): YieldSpan {
  if (!isRecord(value)) return { n: 0, p50: null, p90: null };
  const span: YieldSpan = { n: count(value.n), p50: seconds(value.p50), p90: seconds(value.p90) };
  const why = reason(value.unknown);
  if (why) span.unknown = why;
  return span;
}

function exceptionOf(value: unknown): YieldExceptionRate {
  if (!isRecord(value)) return { todos: 0, needed_human: 0, rate: null, reasons: {} };
  return {
    todos: count(value.todos),
    needed_human: count(value.needed_human),
    rate: rate(value.rate),
    reasons: tally(value.reasons),
  };
}

function badChangeOf(value: unknown): YieldBadChangeRate {
  if (!isRecord(value)) {
    return { changes: 0, bad: 0, rate: null, flaky_reds: 0, by_repo: {} };
  }
  const row: YieldBadChangeRate = {
    changes: count(value.changes),
    bad: count(value.bad),
    rate: rate(value.rate),
    flaky_reds: count(value.flaky_reds),
    by_repo: tally(value.by_repo),
  };
  const why = reason(value.unknown);
  if (why) row.unknown = why;
  return row;
}

/** The checked `headline` block, or undefined when the server sent none. */
export function parseYieldHeadline(value: unknown): YieldHeadline | undefined {
  if (!isRecord(value)) return undefined;
  const lead = isRecord(value.lead_time) ? value.lead_time : {};
  return {
    lead_time: {
      filed_to_prod_s: spanOf(lead.filed_to_prod_s),
      claim_to_main_s: spanOf(lead.claim_to_main_s),
    },
    exception_rate: exceptionOf(value.exception_rate),
    bad_change_rate: badChangeOf(value.bad_change_rate),
  };
}
