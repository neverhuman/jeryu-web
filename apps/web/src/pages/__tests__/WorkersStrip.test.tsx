// WorkersStrip.test.tsx — the one-line workers summary on the Work page: what it
// says collapsed, that it opens to the whole panel in place, and that the choice
// is remembered.

import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkersStrip } from '../shift/WorkersStrip';
import { mockShiftApi, renderAt } from './shiftPageHelpers';
import { TODOS } from './shiftTestData';

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

function renderStrip(path = '/work'): void {
  renderAt(path, '/work', <WorkersStrip todos={TODOS} />);
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

  it('is one line: slots, who works on what (linked into the queue), a sparkline', async () => {
    mockShiftApi();
    renderStrip();
    const summary = await screen.findByTestId('work-workers-summary');
    expect(summary).toHaveTextContent('1 of 1 slot healthy · 1 working · 0 paused (jeryu w1 on Claimed thing)');
    expect(within(summary).getByRole('link', { name: 'Claimed thing' })).toHaveAttribute(
      'href',
      '/work?family=jeryu&todo=20260919-0900-q1q'
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
});
