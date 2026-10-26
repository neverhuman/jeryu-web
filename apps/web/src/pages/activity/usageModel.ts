// usageModel.ts — the token usage an Activity row carries: what a finished
// attempt reported in `detail.usage`, and how it reads on the row.
// Deterministic, no DOM.

import type { PipelineEvent, UsageTokenCounts } from '../../api/types';
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

function usageTokens(counts: UsageTokenCounts): UsageTokens {
  const input = num(counts.input_tokens) ?? 0;
  const output = num(counts.output_tokens) ?? 0;
  const cacheRead = num(counts.cache_read_tokens) ?? 0;
  const cacheWrite = num(counts.cache_write_tokens) ?? 0;
  return { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite };
}

/** `12.4k`, `1.2M`, `947`. Anything unreadable reads as `—`. */
function formatTokens(value: number | null | undefined): string {
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
