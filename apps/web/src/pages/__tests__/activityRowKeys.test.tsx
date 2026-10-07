// activityRowKeys.test.tsx — the keyboard's way down the Activity list: j/k
// and the arrows moving a visible focus, Enter and `o` opening the row it
// rests on, `/` going to More filters, and all of them standing aside while
// the reader is typing in a field. Also the one tab stop a row costs: Tab
// reaches the list once, and the skip link past it reaches "Load older".

import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import { insideRowTabIndex, stepSeq } from '../activity/rowKeysModel';
import { mockPipelineApi } from './pipelinePageHelpers';
import { eventPage } from './pipelineTestData';
import { json, renderAt } from './shiftPageHelpers';

function renderPage(path = '/activity'): void {
  renderAt(path, '/activity', <ActivityPage />);
}

const row = (seq: number): HTMLElement => screen.getByTestId(`activity-event-${seq}`);

describe('stepSeq', () => {
  it('walks the list in its own order', () => {
    expect(stepSeq([12, 11, 10], 12, 1)).toBe(11);
    expect(stepSeq([12, 11, 10], 11, -1)).toBe(12);
  });

  it('starts at the end the reader is heading from', () => {
    expect(stepSeq([12, 11, 10], null, 1)).toBe(12);
    expect(stepSeq([12, 11, 10], null, -1)).toBe(10);
  });

  it('stops at the ends rather than wrapping', () => {
    expect(stepSeq([12, 11, 10], 10, 1)).toBe(10);
    expect(stepSeq([12, 11, 10], 12, -1)).toBe(12);
    expect(stepSeq([], 12, 1)).toBeNull();
  });

  it('comes back onto the list when the row it left is gone', () => {
    expect(stepSeq([12, 11], 99, 1)).toBe(12);
  });
});

describe('insideRowTabIndex', () => {
  it('offers the row the keyboard rests on, and nothing else', () => {
    expect(insideRowTabIndex(true, false)).toBeUndefined();
    expect(insideRowTabIndex(false, true)).toBeUndefined();
    expect(insideRowTabIndex(false, false)).toBe(-1);
  });

  it('takes nothing away from a row outside a walked list', () => {
    expect(insideRowTabIndex(undefined, false)).toBeUndefined();
  });
});

describe('Activity keyboard rows', () => {
  afterEach(() => vi.restoreAllMocks());

  it('moves a visible focus with j/k, and with the arrows once the list has it', async () => {
    mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-12');

    // Before any key, Tab reaches the list at its newest row.
    expect(row(12)).toHaveAttribute('tabindex', '0');
    expect(row(12)).not.toHaveClass('is-focused');
    expect(row(11)).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(window, { key: 'j' });
    expect(row(12)).toHaveClass('is-focused');
    expect(row(12)).toHaveFocus();
    expect(row(12)).toHaveAttribute('tabindex', '0');
    // Only the focused row is the tab stop: the list is reached once.
    expect(row(11)).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(window, { key: 'j' });
    expect(row(11)).toHaveClass('is-focused');
    expect(row(12)).not.toHaveClass('is-focused');

    fireEvent.keyDown(row(11), { key: 'ArrowDown' });
    expect(row(10)).toHaveClass('is-focused');
    fireEvent.keyDown(row(10), { key: 'ArrowUp' });
    expect(row(11)).toHaveClass('is-focused');

    // The arrows are the page's scrolling until the list itself has focus.
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(row(11)).toHaveClass('is-focused');

    fireEvent.keyDown(window, { key: 'k' });
    expect(row(12)).toHaveClass('is-focused');
  });

  it('expands the focused row on Enter and on o, and collapses it again', async () => {
    mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-10');

    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'j' });
    const gate = row(10);
    expect(within(gate).getByRole('button', { name: /^Log for event 10$/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );

    fireEvent.keyDown(gate, { key: 'Enter' });
    expect(within(row(10)).getByText('gate.log')).toBeInTheDocument();
    fireEvent.keyDown(row(10), { key: 'Enter' });
    expect(within(row(10)).queryByText('gate.log')).toBeNull();

    // `o` opens the focused row from anywhere on the page; Enter inside a row
    // stays the button's, so it is the only one that asks where focus is.
    fireEvent.keyDown(window, { key: 'o' });
    expect(within(row(10)).getByText('gate.log')).toBeInTheDocument();
    fireEvent.keyDown(within(row(10)).getByRole('button', { name: /^Hide for event 10$/ }), {
      key: 'Enter',
    });
    expect(within(row(10)).getByText('gate.log')).toBeInTheDocument();
  });

  it('opens More filters on / and puts the caret in its first field', async () => {
    mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-12');
    const summary = screen.getByText('More filters');
    expect(summary.closest('details')).not.toHaveAttribute('open');

    fireEvent.keyDown(window, { key: '/' });
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(screen.getByLabelText('Repo')).toHaveFocus();
  });

  it('leaves the keys alone while the reader is typing in a field', async () => {
    mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-12');
    fireEvent.keyDown(window, { key: '/' });
    const field = screen.getByLabelText('Repo');

    fireEvent.keyDown(field, { key: 'j' });
    fireEvent.keyDown(field, { key: 'o' });
    expect(row(12)).not.toHaveClass('is-focused');
    expect(screen.queryByText('release.staged')).toBeNull();
  });
});

describe('Activity list tab stops', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the controls on a row the keyboard has not walked to out of Tab', async () => {
    mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-12');

    // Before any key the newest row is where Tab lands, so its own controls
    // are ordinary stops behind it; every other row offers none.
    for (const control of focusable(row(12))) expect(control).not.toHaveAttribute('tabindex', '-1');
    for (const control of focusable(row(11))) expect(control).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'j' });
    expect(row(11)).toHaveClass('is-focused');
    for (const control of focusable(row(11))) expect(control).not.toHaveAttribute('tabindex', '-1');
    for (const control of focusable(row(12))) expect(control).toHaveAttribute('tabindex', '-1');
  });

  it('skips the list to Load older', async () => {
    mockPipelineApi((req) => {
      if (req.pathname !== '/api/v1/events') return undefined;
      const qs = new URLSearchParams(req.search);
      if (qs.get('after_seq')) return json({ events: [], latest_seq: 200 });
      return json({ events: eventPage(200, 8), latest_seq: 200, has_more: true });
    });
    renderPage();
    await screen.findByTestId('activity-event-200');

    fireEvent.click(screen.getByTestId('activity-skip-older'));
    expect(screen.getByRole('button', { name: 'Load older' })).toHaveFocus();
  });

  it('offers no skip link when there is no older page', async () => {
    mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-12');
    expect(screen.queryByTestId('activity-skip-older')).toBeNull();
  });
});

/** Every control on a row's own line, detail aside. */
function focusable(element: HTMLElement): HTMLElement[] {
  const line = element.querySelector('.activity-row__line');
  return [...(line?.querySelectorAll<HTMLElement>('a, button') ?? [])];
}
