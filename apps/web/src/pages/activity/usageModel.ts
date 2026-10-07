// usageModel.ts — pure helpers for the token-usage panel at the top of
// Activity: the rows one per working slot, today's totals, the sparkline's
// geometry, how a count reads, and what a slot is spending between two
// answers. Deterministic: every clock comes in as an argument, no DOM.

import type {
  PipelineEvent,
  ShiftWorker,
  UsageBucket,
  UsageResponse,
  UsageSlot,
  UsageTokenCounts,
  UsageTotals,
} from '../../api/types';
import { sameFamily } from '../../components/family/familyScope';
import { formatCount } from '../../format/number';

/** The four counts, folded to numbers, with what the producer left out at 0. */
export interface UsageTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** True when the producer sent no count at all: the slot is silent, not idle. */
function silent(counts: UsageTokenCounts): boolean {
  return (
    num(counts.input_tokens) === null &&
    num(counts.output_tokens) === null &&
    num(counts.cache_read_tokens) === null &&
    num(counts.cache_write_tokens) === null
  );
}

export function usageTokens(counts: UsageTokenCounts): UsageTokens {
  const input = num(counts.input_tokens) ?? 0;
  const output = num(counts.output_tokens) ?? 0;
  const cacheRead = num(counts.cache_read_tokens) ?? 0;
  const cacheWrite = num(counts.cache_write_tokens) ?? 0;
  return { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite };
}

/** One row of the panel: a slot that is working, and what its attempt costs. */
export interface UsageSlotRow {
  /** `operator/host/slot`, unique per row and stable across answers. */
  key: string;
  slot: string;
  family: string;
  todoId: string | null;
  todoTitle: string | null;
  model: string | null;
  /** Null when the producer reported no usage for this slot. */
  tokens: UsageTokens | null;
  tokensPerMin: number | null;
  costUsd: number | null;
}

function rowKey(entry: { operator?: string | null; host?: string | null; slot: string }): string {
  return [entry.operator ?? '', entry.host ?? '', entry.slot].join('/');
}

function inFamily(family: string, name: string | null | undefined): boolean {
  return family === '' || sameFamily(family, name);
}

/**
 * One row per working slot, in slot order (`w2` before `w10`). The usage read is the source of the
 * numbers; the heartbeats are the source of the roster, so a slot that is
 * working and reports nothing still gets a row — with no tokens, which is what
 * the panel says in words. A usage row for a slot that is no longer working is
 * kept too: it is the attempt that just finished.
 */
export function usageSlotRows(
  usage: UsageResponse | undefined,
  workers: ShiftWorker[],
  family: string
): UsageSlotRow[] {
  const slots: UsageSlot[] = (usage?.slots ?? []).filter(
    (slot): slot is UsageSlot => typeof slot?.slot === 'string' && slot.slot !== ''
  );
  const byKey = new Map<string, UsageSlot>();
  for (const slot of slots) byKey.set(rowKey(slot), slot);

  const working = workers.filter((worker) => worker.state === 'working');
  const keys = [
    ...new Set([...slots.map(rowKey), ...working.map(rowKey)]),
  ];

  return keys
    .map((key) => {
      const slot = byKey.get(key);
      const worker = working.find((candidate) => rowKey(candidate) === key);
      const counts: UsageTokenCounts = slot ?? {};
      const reported = slot !== undefined && slot.reported !== false && !silent(counts);
      return {
        key,
        slot: slot?.slot ?? worker?.slot ?? key,
        family: slot?.family ?? worker?.family ?? '',
        todoId: slot?.todo_id ?? worker?.todo_id ?? null,
        todoTitle: slot?.todo_title ?? null,
        model: slot?.model ?? null,
        tokens: reported ? usageTokens(counts) : null,
        tokensPerMin: reported ? num(slot?.tokens_per_min) : null,
        costUsd: reported ? num(slot?.cost_usd) : null,
      };
    })
    .filter((row) => inFamily(family, row.family))
    .sort(
      (a, b) =>
        a.slot.localeCompare(b.slot, undefined, { numeric: true }) || a.key.localeCompare(b.key)
    );
}

/** Today's totals the way the panel reads them, with the cache's share of the input. */
export interface UsageTotalsRead {
  tokens: UsageTokens;
  /** The read-from-cache share of everything that went in; null with no input. */
  cacheHitShare: number | null;
  spentUsd: number | null;
  /** False when the server sent no totals at all. */
  known: boolean;
}

export function usageTotals(usage: UsageResponse | undefined): UsageTotalsRead {
  const totals: UsageTotals = usage?.totals_today ?? {};
  const tokens = usageTokens(totals);
  const readIn = tokens.input + tokens.cacheRead;
  return {
    tokens,
    cacheHitShare: readIn > 0 ? tokens.cacheRead / readIn : null,
    spentUsd: num(totals.cost_usd),
    known: usage?.totals_today !== undefined && usage.totals_today !== null,
  };
}

/** `12.4k`, `1.2M`, `947`. Anything unreadable reads as `—`. */
export function formatTokens(value: number | null | undefined): string {
  const n = num(value);
  if (n === null) return '—';
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}k`;
  return formatCount(n);
}

function trim(value: number): string {
  const text = value.toFixed(1);
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}

/** The exact count, for the `title` of a compact one. */
export function exactTokens(value: number | null | undefined): string {
  return `${formatCount(num(value))} tokens`;
}

/** `62%`, or `—` when nothing has gone in yet. */
export function formatShare(share: number | null | undefined): string {
  const n = num(share);
  return n === null ? '—' : `${Math.round(n * 100)}%`;
}

/**
 * What a slot's counts read as `seconds` after the answer came in: the rate
 * the producer reported, spread over the counts in proportion to what each of
 * them already is. An estimate between two answers, which is what makes the
 * digits tick rather than jump once every poll; the next answer replaces it.
 */
export function projectTokens(
  tokens: UsageTokens,
  tokensPerMin: number | null,
  seconds: number
): UsageTokens {
  const rate = num(tokensPerMin);
  if (rate === null || rate <= 0 || seconds <= 0 || tokens.total <= 0) return tokens;
  const added = (rate * seconds) / 60;
  const factor = (tokens.total + added) / tokens.total;
  const input = Math.round(tokens.input * factor);
  const output = Math.round(tokens.output * factor);
  const cacheRead = Math.round(tokens.cacheRead * factor);
  const cacheWrite = Math.round(tokens.cacheWrite * factor);
  return { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite };
}

// ---- The tokens-per-bucket sparkline -------------------------------------

export interface UsageSpark {
  /** `points` of a polyline; '' when there is nothing to draw. */
  points: string;
  /** The busiest bucket, so the line can say what its top means. */
  peak: number;
  total: number;
  buckets: number;
  summary: string;
}

function bucketTokens(bucket: UsageBucket): number {
  return num(bucket.tokens) ?? usageTokens(bucket).total;
}

/**
 * The sparkline of the last buckets the server sent, oldest first. Buckets
 * without a readable time are dropped rather than drawn at the origin.
 */
export function usageSpark(
  usage: UsageResponse | undefined,
  options: { width: number; height: number; label: string }
): UsageSpark {
  const buckets = (usage?.buckets ?? [])
    .filter((bucket) => typeof bucket?.at === 'string' && !Number.isNaN(Date.parse(bucket.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map(bucketTokens);
  const peak = Math.max(0, ...buckets);
  const total = buckets.reduce((sum, value) => sum + value, 0);
  const step = buckets.length > 1 ? options.width / (buckets.length - 1) : 0;
  const scale = peak > 0 ? peak : 1;
  const points =
    buckets.length < 2
      ? ''
      : buckets
          .map(
            (value, index) =>
              `${(index * step).toFixed(1)},${(options.height - (value / scale) * options.height).toFixed(1)}`
          )
          .join(' ');
  const summary =
    buckets.length === 0
      ? `Tokens per bucket over ${options.label}: nothing reported.`
      : `Tokens per bucket over ${options.label}: ${formatCount(total)} in ${buckets.length} ` +
        `bucket${buckets.length === 1 ? '' : 's'}, busiest ${formatCount(peak)}.`;
  return { points, peak, total, buckets: buckets.length, summary };
}

// ---- Per-attempt usage on an event row ----------------------------------

/**
 * The usage a row carries in `detail.usage` — `todo.attempt_finished` is the
 * row that carries it, and any other kind that grows one reads the same way.
 * An older producer, a detail that is not an object, or counts that are all
 * missing is no usage: the row then says nothing about tokens, not zero.
 */
export function attemptUsage(event: PipelineEvent): UsageTokens | null {
  const raw = event.detail?.usage;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const counts = raw as UsageTokenCounts;
  if (silent(counts)) return null;
  return usageTokens(counts);
}

/** How an attempt's tokens read on the row: `18.2k in · 1.4k out`. */
export function attemptUsageText(tokens: UsageTokens): string {
  return `${formatTokens(tokens.input + tokens.cacheRead)} in · ${formatTokens(tokens.output)} out`;
}

/** The same, said in full, for the row's `title`. */
export function attemptUsageTitle(tokens: UsageTokens): string {
  return (
    `${formatCount(tokens.input)} input, ${formatCount(tokens.output)} output, ` +
    `${formatCount(tokens.cacheRead)} read from cache, ${formatCount(tokens.cacheWrite)} written to cache`
  );
}
