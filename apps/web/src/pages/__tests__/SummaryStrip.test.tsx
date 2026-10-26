// SummaryStrip.test.tsx — the always-on 24-hour strip above the Activity
// feed: where its numbers come from, how they move when they change, what
// Blocked does, and what the strip does for a reader who asked for no motion.

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import { activityCounters } from '../activity/activityModel';
import { histogramTotals } from '../activity/histogramModel';
import { COUNT_UP_MS, easeOutCubic, useCountUp } from '../../hooks/useCountUp';
import { mockPipelineApi } from './pipelinePageHelpers';
import { EVENTS, HISTOGRAM } from './pipelineTestData';
import { json, renderAt } from './shiftPageHelpers';

function renderPage(path = '/activity'): void {
  renderAt(path, '/activity', <ActivityPage />);
}

/** The histogram route, answered with window totals the server counted. */
function withTotals(totals: Record<string, unknown>) {
  return (req: { pathname: string }): Response | undefined =>
    req.pathname === '/api/v1/events/histogram' ? json({ ...HISTOGRAM, totals }) : undefined;
}

const TOTALS = {
  todos_finished: 42,
  blocked: 3,
  prs_merged: 17,
  deploys: 5,
  spent_usd: 12.345,
};

function reduceMotion(): () => void {
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
  return () => {
    window.matchMedia = original;
  };
}

function tile(counters: HTMLElement, label: string): HTMLElement {
  const node = within(counters).getByText(label).parentElement;
  if (!node) throw new Error(`no tile for ${label}`);
  return node;
}

describe('activityCounters', () => {
  it('reads the server totals, keeping cents and dropping what is not a number', () => {
    expect(histogramTotals(undefined)).toBeNull();
    expect(histogramTotals({ buckets: [] })).toBeNull();
    expect(histogramTotals({ buckets: [], totals: TOTALS })).toEqual({
      todosFinished: 42,
      blocked: 3,
      prsMerged: 17,
      deploys: 5,
      spentUsd: 12.35,
    });
    // A field the server left out is zero, not a reason to count rows instead.
    expect(histogramTotals({ buckets: [], totals: { blocked: 2, spent_usd: null } })).toEqual({
      todosFinished: 0,
      blocked: 2,
      prsMerged: 0,
      deploys: 0,
      spentUsd: 0,
    });
  });

  it('prefers the server totals, and says how many rows it counted when there are none', () => {
    const now = new Date('2026-09-19T14:00:00Z');
    const served = activityCounters({ todosFinished: 9, blocked: 0, prsMerged: 1, deploys: 2, spentUsd: 3 }, EVENTS, now);
    // No count of loaded rows: the numbers are the whole window.
    expect(served).toEqual({ todosFinished: 9, blocked: 0, prsMerged: 1, deploys: 2, spentUsd: 3, events: null });

    const counted = activityCounters(null, EVENTS, now);
    expect(counted.events).toBeGreaterThan(0);
    expect(counted.todosFinished).toBe(1);
  });
});

describe('useCountUp', () => {
  it('eases out, and is clamped at both ends', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
    // Most of the distance is covered in the first half.
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.8);
    expect(COUNT_UP_MS).toBe(600);
  });

  it('starts at the first value, travels to the next, and jumps when motion is off', async () => {
    function Probe({ value, still }: { value: number; still: boolean }): JSX.Element {
      return <span data-testid="probe">{useCountUp(value, still)}</span>;
    }
    const { rerender } = render(<Probe value={5} still={false} />);
    // A first render is not an animation: the number is simply there.
    expect(screen.getByTestId('probe')).toHaveTextContent('5');

    rerender(<Probe value={25} still={false} />);
    await waitFor(() => expect(screen.getByTestId('probe')).not.toHaveTextContent('5'));
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('25'), { timeout: 2_000 });

    // Asked for no motion, the value updates with no frames in between.
    rerender(<Probe value={60} still />);
    expect(screen.getByTestId('probe')).toHaveTextContent('60');
  });
});

describe('SummaryStrip', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the strip under the chart on the normal page, from the whole-window totals', async () => {
    mockPipelineApi(withTotals(TOTALS));
    renderPage();
    const counters = await screen.findByTestId('activity-counters');
    await waitFor(() => expect(tile(counters, 'Todos finished')).toHaveTextContent('42'));
    expect(tile(counters, 'Pull requests merged')).toHaveTextContent('17');
    expect(tile(counters, 'Deploys')).toHaveTextContent('5');
    expect(tile(counters, 'Spent')).toHaveTextContent('$12.35');
    // The numbers are the server's, so the page no longer hedges about them.
    expect(counters).not.toHaveTextContent('loaded here');
    expect(counters).toHaveClass('activity__counters--compact');

    // Under the chart, above the filters.
    const page = screen.getByTestId('activity-page');
    const order = [...page.querySelectorAll('[data-testid], section')];
    expect(order.indexOf(screen.getByTestId('activity-volume'))).toBeLessThan(order.indexOf(counters));
    expect(order.indexOf(counters)).toBeLessThan(
      order.indexOf(screen.getByRole('region', { name: 'Activity filters' }))
    );
  });

  it('keeps Blocked red and sends it to Needs you, and leaves it plain at zero', async () => {
    mockPipelineApi(withTotals(TOTALS));
    renderPage();
    const counters = await screen.findByTestId('activity-counters');
    const blocked = await waitFor(() => {
      const link = within(counters).getByRole('link', { name: /Blocked/ });
      expect(link).toHaveTextContent('3');
      return link;
    });
    expect(blocked).toHaveClass('activity__counter--human');
    expect(blocked).toHaveAttribute('href', '/needs-you?view=all');

    cleanup();
    vi.restoreAllMocks();
    mockPipelineApi(withTotals({ ...TOTALS, blocked: 0 }));
    renderPage();
    const quiet = await screen.findByTestId('activity-counters');
    await waitFor(() => expect(tile(quiet, 'Blocked')).toHaveTextContent('0'));
    expect(tile(quiet, 'Blocked')).not.toHaveClass('activity__counter--human');
    expect(within(quiet).queryByRole('link', { name: /Blocked/ })).toBeNull();
  });

  it('wall mode reads the same totals, in wall type and with no caveat', async () => {
    mockPipelineApi(withTotals(TOTALS));
    renderPage('/activity?wall=1');
    const counters = await screen.findByRole('region', { name: 'Last 24 hours' });
    await waitFor(() => expect(tile(counters, 'Todos finished')).toHaveTextContent('42'));
    expect(counters).not.toHaveClass('activity__counters--compact');
    expect(counters).not.toHaveTextContent('loaded here');
  });

  it('counts the loaded events, and says so, on a server that sends no totals', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-19T14:00:00Z') });
    try {
      mockPipelineApi();
      renderPage();
      const counters = await screen.findByTestId('activity-counters');
      await waitFor(() => expect(counters).toHaveTextContent('loaded here'));
      expect(tile(counters, 'Todos finished')).toHaveTextContent('1');
      expect(tile(counters, 'Spent')).toHaveTextContent('$0.54');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays out of the way when there is nothing at all to count', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events'
        ? json({ events: [], latest_seq: 0 })
        : req.pathname === '/api/v1/events/histogram'
          ? json({ buckets: [] })
          : undefined
    );
    renderPage();
    expect(await screen.findByText('No pipeline events yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-counters')).toBeNull();
  });

  it('updates without tweening when the reader asked for less motion', async () => {
    const restore = reduceMotion();
    try {
      mockPipelineApi(withTotals(TOTALS));
      renderPage();
      const counters = await screen.findByTestId('activity-counters');
      expect(counters).toHaveClass('activity__counters--still');
      // No frames to wait for: the value is final as soon as it is rendered.
      await waitFor(() => expect(tile(counters, 'Todos finished')).toHaveTextContent('42'));
      await act(async () => {});
      expect(tile(counters, 'Todos finished')).toHaveTextContent('42');
    } finally {
      restore();
    }
  });
});
