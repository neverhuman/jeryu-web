// UsagePanel.test.tsx — the token-usage panel at the top of Activity: the rows
// it folds from the usage read and the heartbeats, how counts read, what it
// does with a producer that reports nothing, and what it does on a server
// without the route.

import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ShiftWorker, UsageResponse } from '../../api/types';
import { ActivityPage } from '../activity';
import {
  attemptUsage,
  attemptUsageText,
  exactTokens,
  formatShare,
  formatTokens,
  projectTokens,
  usageSlotRows,
  usageSpark,
  usageTokens,
  usageTotals,
} from '../activity/usageModel';
import { useRealtimeStore } from '../../stores/realtimeStore';
import { mockPipelineApi } from './pipelinePageHelpers';
import { USAGE, pipelineEvent } from './pipelineTestData';
import { errorResponse, json, renderAt } from './shiftPageHelpers';

function renderPage(path = '/activity'): void {
  renderAt(path, '/activity', <ActivityPage />);
}

function worker(partial: Partial<ShiftWorker> & Pick<ShiftWorker, 'slot'>): ShiftWorker {
  return {
    operator: 'operator',
    host: 'node-0',
    family: 'jeryu',
    state: 'working',
    last_seen: '2026-09-19T13:04:55Z',
    healthy: true,
    ...partial,
  };
}

describe('usageModel', () => {
  it('formats big counts compactly and keeps the exact one for the title', () => {
    expect(formatTokens(947)).toBe('947');
    expect(formatTokens(12_400)).toBe('12.4k');
    expect(formatTokens(1_000)).toBe('1k');
    expect(formatTokens(1_240_000)).toBe('1.2M');
    expect(formatTokens(null)).toBe('—');
    expect(exactTokens(12_400)).toBe('12,400 tokens');
    expect(formatShare(0.624)).toBe('62%');
    expect(formatShare(null)).toBe('—');
  });

  it('folds the wire counts, leaving what the producer did not send at zero', () => {
    expect(usageTokens({ input_tokens: 10, output_tokens: 2 })).toEqual({
      input: 10,
      output: 2,
      cacheRead: 0,
      cacheWrite: 0,
      total: 12,
    });
    // A count that is not a count at all is not drawn as one.
    expect(usageTokens({ input_tokens: Number.NaN, output_tokens: -4 }).total).toBe(0);
  });

  it('makes one row per working slot, from the usage read and the heartbeats', () => {
    const rows = usageSlotRows(USAGE, [worker({ slot: 'w2', host: 'node-2' })], '');
    expect(rows.map((row) => row.slot)).toEqual(['w1', 'w2', 'w3']);
    expect(rows[0]).toMatchObject({
      todoId: '20260919-121041-9d0b27',
      model: 'opus-5',
      tokensPerMin: 1_800,
      costUsd: 1.42,
    });
    expect(rows[0].tokens?.total).toBe(12_400 + 3_100 + 240_000 + 8_000);
    // A slot that is working and reports nothing has no tokens, not zero ones.
    expect(rows[1].tokens).toBeNull();
    expect(rows[2].tokens).toBeNull();
    // An idle slot is not a row: there is no attempt to count.
    expect(usageSlotRows(undefined, [worker({ slot: 'w9', state: 'idle' })], '')).toEqual([]);
  });

  it('counts a slot silent when every count is missing, whatever `reported` says', () => {
    const response: UsageResponse = {
      generated_at: '2026-09-19T13:05:00Z',
      slots: [
        { slot: 'w1', host: 'h', operator: 'o', reported: true },
        { slot: 'w2', host: 'h', operator: 'o', input_tokens: 5, reported: false },
      ],
    };
    const rows = usageSlotRows(response, [], '');
    expect(rows[0].tokens).toBeNull();
    expect(rows[1].tokens).toBeNull();
  });

  it('keeps the family scope, in either spelling of it', () => {
    expect(usageSlotRows(USAGE, [], 'jeryu-split').map((row) => row.slot)).toEqual(['w1']);
    expect(usageSlotRows(USAGE, [], 'jain').map((row) => row.slot)).toEqual(['w3']);
  });

  it('reads today as tokens, a cache share of everything read, and money', () => {
    const totals = usageTotals(USAGE);
    expect(totals.tokens.input).toBe(1_240_000);
    expect(totals.spentUsd).toBe(18.4);
    expect(totals.cacheHitShare).toBeCloseTo(3_600_000 / (3_600_000 + 1_240_000), 6);
    expect(totals.known).toBe(true);
    // No totals at all is not a total of nothing.
    expect(usageTotals({ generated_at: '2026-09-19T13:05:00Z' }).known).toBe(false);
  });

  it('spreads the reported rate over the counts between two answers', () => {
    const tokens = usageTokens({ input_tokens: 100, output_tokens: 100 });
    const ticked = projectTokens(tokens, 60, 30);
    // 60 tokens/min for 30 s is 30 more tokens, split by what each count is.
    expect(ticked.total).toBe(230);
    expect(ticked.input).toBe(115);
    // No rate, no clock and nothing counted yet all leave the counts alone.
    expect(projectTokens(tokens, null, 30)).toEqual(tokens);
    expect(projectTokens(tokens, 60, 0)).toEqual(tokens);
    expect(projectTokens(usageTokens({}), 60, 30).total).toBe(0);
  });

  it('traces the sparkline oldest bucket first, scaled to the busiest', () => {
    const spark = usageSpark(USAGE, { width: 100, height: 10, label: 'last 24 h' });
    expect(spark.buckets).toBe(3);
    expect(spark.peak).toBe(48_000);
    expect(spark.total).toBe(12_000 + 48_000 + 24_000);
    // Three buckets, so two steps; the busiest one touches the top.
    expect(spark.points.split(' ')).toHaveLength(3);
    expect(spark.points).toContain('50.0,0.0');
    expect(spark.summary).toContain('busiest 48,000');
    // One bucket draws no line, and a time nobody can read is not a bucket.
    expect(usageSpark({ generated_at: 'x', buckets: [{ at: 'nope', tokens: 1 }] }, { width: 10, height: 2, label: '24h' })).toMatchObject({
      points: '',
      buckets: 0,
    });
  });

  it('reads an attempt row that carries its usage, and nothing from one that does not', () => {
    const tokens = attemptUsage(
      pipelineEvent({
        seq: 1,
        kind: 'todo.attempt_finished',
        detail: { usage: { input_tokens: 18_000, output_tokens: 1_400, cache_read_tokens: 240_000 } },
      })
    );
    expect(tokens?.output).toBe(1_400);
    expect(attemptUsageText(tokens!)).toBe('258k in · 1.4k out');
    expect(attemptUsage(pipelineEvent({ seq: 2, kind: 'todo.attempt_finished' }))).toBeNull();
    expect(
      attemptUsage(pipelineEvent({ seq: 3, kind: 'todo.attempt_finished', detail: { usage: 'lots' } }))
    ).toBeNull();
    expect(
      attemptUsage(pipelineEvent({ seq: 4, kind: 'todo.attempt_finished', detail: { usage: {} } }))
    ).toBeNull();
  });
});

describe('UsagePanel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a row per working slot with its tokens, and today beside them', async () => {
    mockPipelineApi();
    renderPage();
    const panel = await screen.findByTestId('activity-usage');
    const w1 = await screen.findByTestId('activity-usage-slot-w1');
    expect(w1).toHaveTextContent('20260919-121041-9d0b27');
    expect(w1).toHaveTextContent('opus-5');
    expect(w1).toHaveTextContent('12.4k');
    expect(w1).toHaveTextContent('$1.42');
    expect(w1.querySelector('a')).toHaveAttribute(
      'href',
      '/work/20260919-121041-9d0b27?family=jeryu'
    );
    // The exact number is one hover away from the compact one.
    expect(panel.querySelector('[title="12,400 tokens"]')).not.toBeNull();

    const totals = screen.getByTestId('activity-usage-totals');
    expect(totals).toHaveTextContent('1.2M');
    expect(totals).toHaveTextContent('74%');
    expect(totals).toHaveTextContent('$18.40');
    expect(screen.getByTestId('activity-usage-spark').getAttribute('aria-label')).toContain(
      'busiest 48,000'
    );
  });

  it('says so when a producer reports no usage, instead of counting zero', async () => {
    mockPipelineApi();
    renderPage();
    const silent = await screen.findByTestId('activity-usage-slot-w3');
    expect(silent).toHaveTextContent('no usage reported (todoq too old)');
    // Nothing is counted on the row: the sentence stands in for every number.
    expect(silent.querySelectorAll('.activity-usage__num')).toHaveLength(0);
  });

  it('asks for the shell family and lists only its slots', async () => {
    const calls = mockPipelineApi();
    renderPage('/activity?family=jain');
    await screen.findByTestId('activity-usage-slot-w3');
    expect(screen.queryByTestId('activity-usage-slot-w1')).toBeNull();
    await waitFor(() =>
      expect(
        calls.some((call) => call.pathname === '/api/v1/usage' && call.search.includes('family=jain'))
      ).toBe(true)
    );
  });

  it('counts a slot that is working but silent, from its heartbeat alone', async () => {
    mockPipelineApi((req) => {
      if (req.pathname === '/api/v1/usage') {
        return json({ generated_at: '2026-09-19T13:05:00Z', slots: [] });
      }
      if (req.pathname === '/api/v1/shift/workers') {
        return json({
          generated_at: '2026-09-19T13:05:00Z',
          workers: [worker({ slot: 'w7', todo_id: '20260919-1' })],
        });
      }
      return undefined;
    });
    renderPage();
    const row = await screen.findByTestId('activity-usage-slot-w7');
    expect(row).toHaveTextContent('no usage reported (todoq too old)');
  });

  it('refetches when the server says a slot reported, and not on another scope', async () => {
    const listeners: Array<(event: { scope: string; kind: string }) => void> = [];
    const store = useRealtimeStore.getState();
    vi.spyOn(useRealtimeStore, 'getState').mockReturnValue({
      ...store,
      addInvalidator: (listener) => {
        listeners.push(listener as (event: { scope: string; kind: string }) => void);
        return () => {};
      },
    });
    const calls = mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-usage-slot-w1');
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));
    const reads = (): number => calls.filter((call) => call.pathname === '/api/v1/usage').length;
    const before = reads();

    const fire = (event: { scope: string; kind: string }): void => {
      act(() => {
        for (const listener of listeners) listener(event);
      });
    };
    fire({ scope: 'repo.jeryu/jeryu-web', kind: 'usage.changed' });
    expect(reads()).toBe(before);
    fire({ scope: 'pipeline', kind: 'usage.changed' });
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });

  it('keeps the digits moving between two answers, at the reported rate', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockPipelineApi();
      renderPage();
      const w1 = await screen.findByTestId('activity-usage-slot-w1');
      const input = (): string => w1.querySelector('.activity-usage__num')?.getAttribute('title') ?? '';
      expect(input()).toBe('12,400 tokens');
      // 1,800 tokens/min, spread over the counts by what each one already is:
      // the compact digits hold still for a while, the exact count does not.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(9_000);
      });
      expect(input()).not.toBe('12,400 tokens');
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts an attempt\'s own tokens next to its cost on the event row', async () => {
    mockPipelineApi();
    renderPage();
    const row = await screen.findByTestId('activity-event-9');
    expect(row).toHaveTextContent('$0.33');
    expect(row).toHaveTextContent('258k in · 1.4k out');
    expect(row.querySelector('[title*="read from cache"]')?.getAttribute('title')).toContain(
      '240,000 read from cache'
    );
    // A row the producer sent no usage with says nothing about tokens.
    expect(screen.getByTestId('activity-event-8')).not.toHaveTextContent('out');
  });

  it('is left out on a server that does not have the route', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/usage' ? errorResponse(404, 'no usage here') : undefined
    );
    renderPage();
    await screen.findByTestId('activity-event-12');
    expect(screen.queryByTestId('activity-usage')).toBeNull();
  });

  it('does not tween the digits when the reader asked for less motion', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      mockPipelineApi();
      renderPage();
      const panel = await screen.findByTestId('activity-usage');
      expect(panel.className).toContain('activity-usage--still');
    } finally {
      window.matchMedia = original;
    }
  });
});
