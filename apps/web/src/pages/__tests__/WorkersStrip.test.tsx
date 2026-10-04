// WorkersStrip.test.tsx — the one-line workers summary on the Work page: what it
// says collapsed (a spent shift budget included), that it opens to the whole
// panel in place, and that the choice is remembered.

import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkersStrip } from '../shift/WorkersStrip';
import { ATTENTION, BUDGET_SPENT } from './pipelineTestData';
import { json, mockShiftApi, renderAt } from './shiftPageHelpers';
import { TODOS, WORKERS } from './shiftTestData';

// Node's global localStorage is undefined without a backing file and shadows
// jsdom's: the strip goes through the storage adapter, so the test brings its own.
function makeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function renderStrip(path = '/work', family = ''): void {
  renderAt(path, '/work', <WorkersStrip todos={TODOS} family={family} />);
}

/** Needs you, with one family's shift budget spent. */
function withBudgetSpent(req: { pathname: string }): Response | undefined {
  return req.pathname === '/api/v1/attention'
    ? json({ ...ATTENTION, items: [...ATTENTION.items, BUDGET_SPENT] })
    : undefined;
}

describe('WorkersStrip', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-19T09:05:00Z'));
    Object.defineProperty(window, 'localStorage', { configurable: true, value: makeStorage() });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is one line: slots, who works on what (linked to the todo), a sparkline', async () => {
    mockShiftApi();
    renderStrip();
    const summary = await screen.findByTestId('work-workers-summary');
    expect(summary).toHaveTextContent('1 of 1 slot healthy · 1 working · 0 paused (jeryu w1 on Claimed thing)');
    expect(within(summary).getByRole('link', { name: 'Claimed thing' })).toHaveAttribute(
      'href',
      '/work/20260919-0900-q1q'
    );
    expect(
      await screen.findByRole('img', { name: 'Busy worker slots over the last 24 hours' })
    ).toBeInTheDocument();
    // Collapsed by default: the table, timeline and chart are not rendered.
    expect(screen.getByRole('button', { name: 'Workers' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('shift-workers-panel')).toBeNull();
  });

  it('opens to the whole panel in place and remembers the choice', async () => {
    mockShiftApi();
    renderStrip();
    fireEvent.click(await screen.findByRole('button', { name: 'Workers' }));
    expect(screen.getByRole('button', { name: 'Workers' })).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByTestId('shift-worker-xbabe0-w1')).toBeInTheDocument();
    expect(window.localStorage.getItem('jeryu.work.workersOpen.v1')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Workers' }));
    expect(screen.queryByTestId('shift-workers-panel')).toBeNull();
    expect(window.localStorage.getItem('jeryu.work.workersOpen.v1')).toBe('0');
  });

  it('starts open when remembered, or when the link says #workers', async () => {
    mockShiftApi();
    renderStrip('/work#workers');
    expect(await screen.findByTestId('shift-workers-panel')).toBeInTheDocument();
  });

  it('puts the night window state next to the worker count', async () => {
    const schedule = {
      always: 0,
      day: { hours: '07:00-22:00', slots: 1 },
      night: { hours: '22:00-07:00', slots: 4 },
      tz: 'America/Los_Angeles',
    };
    mockShiftApi((req) =>
      req.pathname === '/api/v1/shift/workers'
        ? json({ ...WORKERS, workers: WORKERS.workers.map((w) => ({ ...w, schedule })) })
        : undefined
    );
    renderStrip();
    // 09:05 UTC is 02:05 in Los Angeles: inside the window.
    expect(await screen.findByTestId('work-night-window')).toHaveTextContent(
      'night window open (22:00–07:00 America/Los_Angeles)'
    );
  });

  it('says when a shift budget is spent with todos waiting on it', async () => {
    mockShiftApi(withBudgetSpent);
    renderStrip();
    expect(await screen.findByTestId('work-budget-spent-acme')).toHaveTextContent(
      'acme: spent $42.00 of $40.00 this shift · 3 todos waiting on budget'
    );
  });

  it('drops the family name when the page is filtered to one family', async () => {
    mockShiftApi(withBudgetSpent);
    renderStrip('/work?family=acme', 'acme');
    expect(await screen.findByTestId('work-budget-spent-acme')).toHaveTextContent(
      '· spent $42.00 of $40.00 this shift · 3 todos waiting on budget'
    );
  });

  it('says nothing about budgets when none is spent', async () => {
    mockShiftApi();
    renderStrip();
    await screen.findByTestId('work-workers-summary');
    expect(screen.queryByTestId('work-budget-spent-acme')).toBeNull();
  });
});
