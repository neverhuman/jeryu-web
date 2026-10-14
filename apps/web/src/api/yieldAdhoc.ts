// yieldAdhoc.ts — the `adhoc` part of `GET /api/v1/yield`, checked field by
// field. It arrived after the rest of the report, so an older server leaves it
// out and the Yield page hides the section. A value that is not an object is
// treated the same way; inside one, a number that is missing or not finite
// reads 0, and a group row without a name is dropped (spend with no repository
// or family is carried by `unattributed_usd`, never by a nameless row).

import type { YieldAdhoc, YieldAdhocGroup, YieldAdhocWeek } from './types/yield';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** A finite, non-negative amount or count; anything else reads 0. */
function amount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function groupOf(value: unknown, withFamily: boolean): YieldAdhocGroup | null {
  if (!isRecord(value)) return null;
  const group = text(value.group);
  if (group === null) return null;
  const row: YieldAdhocGroup = { group, usd: amount(value.usd), sessions: amount(value.sessions) };
  if (withFamily) row.family = text(value.family);
  return row;
}

/** Rows of one cut, largest spend first; a name listed twice keeps its first row. */
function groupsOf(value: unknown, withFamily = false): YieldAdhocGroup[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const rows: YieldAdhocGroup[] = [];
  for (const raw of value) {
    const row = groupOf(raw, withFamily);
    if (!row || seen.has(row.group)) continue;
    seen.add(row.group);
    rows.push(row);
  }
  return rows.sort((a, b) => b.usd - a.usd);
}

/** Weeks in key order; a row without a week key is dropped. */
function weeksOf(value: unknown): YieldAdhocWeek[] {
  if (!Array.isArray(value)) return [];
  const rows: YieldAdhocWeek[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const week = text(raw.week);
    if (week !== null) rows.push({ week, usd: amount(raw.usd) });
  }
  return rows.sort((a, b) => a.week.localeCompare(b.week));
}

/** The checked `adhoc` object, or undefined when the server sent none. */
export function parseYieldAdhoc(value: unknown): YieldAdhoc | undefined {
  if (!isRecord(value)) return undefined;
  return {
    total_usd: amount(value.total_usd),
    sessions: amount(value.sessions),
    unattributed_usd: amount(value.unattributed_usd),
    by_family: groupsOf(value.by_family),
    by_repo: groupsOf(value.by_repo, true),
    by_agent: groupsOf(value.by_agent),
    by_model: groupsOf(value.by_model),
    weekly: weeksOf(value.weekly),
  };
}
