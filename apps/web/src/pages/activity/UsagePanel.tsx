// UsagePanel.tsx — what the pipeline is spending, at the top of Activity.
//
// Three things in one band under the volume chart: a row per working slot with
// the tokens of the attempt it is running, today's totals, and a
// tokens-per-bucket sparkline of the last 24 hours.
//
// The numbers are live: the server pushes `usage.changed` on the pipeline
// scope and a 10-second poll covers a socket that is down. Between two answers
// the digits keep moving at the rate the producer reported, so a slot that is
// working looks like it is working; the next answer replaces the estimate. A
// reader who asked for less motion gets neither the tween nor the seconds: the
// values simply update.
//
// A slot whose producer sends no usage says so. Reporting zero tokens for an
// attempt that is plainly running would be untrue; "no usage reported" is not.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useShiftWorkers } from '../../hooks/useShift';
import { useUsage, useUsageNudge } from '../../hooks/useUsage';
import { formatCost } from '../shift/shiftModel';
import { todoHref } from '../shift/workPaths';
import {
  exactTokens,
  formatShare,
  formatTokens,
  projectTokens,
  usageSlotRows,
  usageSpark,
  usageTotals,
  type UsageSlotRow,
  type UsageTokens,
} from './usageModel';

/** The span the sparkline covers, and the window the totals are read over. */
const RANGE = '24h';
const RANGE_LABEL = 'last 24 h';
const SPARK_W = 240;
const SPARK_H = 28;
/** How often the ticking digits step while waiting for the next answer. */
const TICK_MS = 1_000;

export interface UsagePanelProps {
  /** The shell's family scope, or '' when a pinned repository is the scope. */
  family: string;
}

export function UsagePanel({ family }: UsagePanelProps): JSX.Element | null {
  const reduced = usePrefersReducedMotion();
  const usage = useUsage({ family, range: RANGE });
  useUsageNudge(usage.isSuccess);
  const workers = useShiftWorkers();
  // Still digits need no clock at all; ticking ones restart on every answer.
  const seconds = useSecondsSince(reduced ? null : usage.dataUpdatedAt);

  // An older forge answers this path with a 404: leave the panel out rather
  // than explain it above the feed, exactly as the volume band does.
  if (usage.isError) return null;

  const rows = usageSlotRows(usage.data, workers.data?.workers ?? [], family);
  const totals = usageTotals(usage.data);
  const spark = usageSpark(usage.data, { width: SPARK_W, height: SPARK_H, label: RANGE_LABEL });

  return (
    <section
      className={`activity-usage${reduced ? ' activity-usage--still' : ''}`}
      aria-label="Token usage"
      data-testid="activity-usage"
    >
      <div className="activity-usage__head">
        <h2 className="activity-usage__title">
          Tokens
          <span className="activity-usage__count">
            {' '}
            {rows.length} working slot{rows.length === 1 ? '' : 's'}
          </span>
        </h2>
        <svg
          className="activity-usage__spark"
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={spark.summary}
          data-testid="activity-usage-spark"
        >
          {spark.points ? (
            <polyline className="activity-usage__spark-line" points={spark.points} />
          ) : null}
        </svg>
      </div>

      {rows.length === 0 ? (
        <p className="activity-usage__quiet" data-testid="activity-usage-quiet">
          No slot is working right now.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="activity-usage__table">
            <thead>
              <tr>
                <th scope="col">Slot</th>
                <th scope="col">Todo</th>
                <th scope="col">Model</th>
                <th scope="col">In</th>
                <th scope="col">Out</th>
                <th scope="col">Cache</th>
                <th scope="col">Tokens/min</th>
                <th scope="col">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <SlotRow key={row.key} row={row} seconds={seconds} reduced={reduced} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dl className="activity-usage__totals" data-testid="activity-usage-totals">
        <Total label="Tokens in today" value={totals.tokens.input} known={totals.known} />
        <Total label="Tokens out today" value={totals.tokens.output} known={totals.known} />
        <div className="activity-usage__total">
          <dt>Cache hit share</dt>
          <dd title={`${exactTokens(totals.tokens.cacheRead)} read from cache`}>
            {totals.known ? formatShare(totals.cacheHitShare) : '—'}
          </dd>
        </div>
        <div className="activity-usage__total">
          <dt>Spent today</dt>
          <dd>{formatCost(totals.spentUsd)}</dd>
        </div>
      </dl>
    </section>
  );
}

function Total({
  label,
  value,
  known,
}: {
  label: string;
  value: number;
  known: boolean;
}): JSX.Element {
  return (
    <div className="activity-usage__total">
      <dt>{label}</dt>
      <dd title={known ? exactTokens(value) : undefined}>
        {known ? formatTokens(value) : '—'}
      </dd>
    </div>
  );
}

function SlotRow({
  row,
  seconds,
  reduced,
}: {
  row: UsageSlotRow;
  seconds: number;
  reduced: boolean;
}): JSX.Element {
  const tokens: UsageTokens | null =
    row.tokens === null ? null : projectTokens(row.tokens, row.tokensPerMin, seconds);
  return (
    <tr data-testid={`activity-usage-slot-${row.slot}`}>
      <th scope="row">
        {row.slot}
        {row.family ? <span className="activity-usage__family"> {row.family}</span> : null}
      </th>
      <td>
        {row.todoId ? (
          <Link to={todoHref(row.todoId, row.family)} title={row.todoTitle ?? undefined}>
            {row.todoId}
          </Link>
        ) : (
          '—'
        )}
      </td>
      <td>{row.model ?? '—'}</td>
      {tokens === null ? (
        // One sentence across the numbers: nothing to total, nothing to tick.
        <td className="activity-usage__silent" colSpan={5}>
          no usage reported (todoq too old)
        </td>
      ) : (
        <>
          <TokenCell value={tokens.input} reduced={reduced} />
          <TokenCell value={tokens.output} reduced={reduced} />
          <TokenCell value={tokens.cacheRead + tokens.cacheWrite} reduced={reduced} />
          <td className="activity-usage__num">
            {row.tokensPerMin === null ? '—' : formatTokens(Math.round(row.tokensPerMin))}
          </td>
          <td className="activity-usage__num">{formatCost(row.costUsd)}</td>
        </>
      )}
    </tr>
  );
}

/**
 * One count, compact, with the exact number in its title. The digits carry a
 * `key` of the value they say, so every step remounts the span and replays the
 * tick animation; the still variant keys on nothing and simply updates.
 */
function TokenCell({ value, reduced }: { value: number; reduced: boolean }): JSX.Element {
  return (
    <td className="activity-usage__num" title={exactTokens(value)}>
      <span className="activity-usage__digits" key={reduced ? 'still' : value}>
        {formatTokens(value)}
      </span>
    </td>
  );
}

/**
 * Seconds since `at`, stepping once a second; 0 while `at` is null (the reader
 * asked for less motion) or not yet known.
 */
function useSecondsSince(at: number | null): number {
  // The clock is the state; the seconds are read from it, so a new answer
  // (a new `at`) resets them without the effect setting anything.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (at === null || at === 0) return () => {};
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [at]);
  if (at === null || at === 0 || now <= at) return 0;
  return Math.round((now - at) / 1000);
}
