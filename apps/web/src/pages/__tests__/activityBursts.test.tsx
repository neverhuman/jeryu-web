// activityBursts.test.tsx — a burst of identical reports on the Activity feed:
// one reviewer filing the same verdict, for the same reason, on every pull
// request of a family. Twelve rows that differed only in a number are one row
// that says it once and opens to the reports themselves.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import { mockPipelineApi } from './pipelinePageHelpers';
import { pipelineEvent } from './pipelineTestData';
import { json, renderAt } from './shiftPageHelpers';

const REASON = 'The required gate has not run on this head.';

function verdict(seq: number, repo: string, minute: number) {
  return pipelineEvent({
    seq,
    ts: `2026-10-06T14:${String(minute).padStart(2, '0')}:00Z`,
    kind: 'pr.review',
    actor: 'review-bot',
    family: 'acme',
    repo: `acme/shop-${repo}`,
    pr: 4,
    outcome: 'request_changes',
    reason: REASON,
    needs_human: true,
    summary: `review-bot reviewed acme/shop-${repo}#4`,
  });
}

const EVENTS = [
  pipelineEvent({
    seq: 40,
    ts: '2026-10-06T14:30:00Z',
    kind: 'pr.merged',
    outcome: 'merged',
    summary: 'merged acme/shop-web#3',
  }),
  verdict(33, 'web', 19),
  verdict(32, 'core', 11),
  verdict(31, 'api', 3),
];

function renderPage(): void {
  mockPipelineApi((req) =>
    req.pathname === '/api/v1/events' ? json({ events: EVENTS, latest_seq: 40 }) : undefined
  );
  renderAt('/activity', '/activity', <ActivityPage />);
}

describe('Activity bursts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draws one row for the burst, and leaves the rows around it alone', async () => {
    renderPage();
    const row = await screen.findByTestId('activity-burst-33');
    expect(within(row).getByText('review-bot requested changes on 3 shop pull requests')).toBeInTheDocument();
    // The one reason they all gave, said once, and the count of what folded.
    expect(within(row).getByText(REASON)).toBeInTheDocument();
    expect(within(row).getByText('×3')).toBeInTheDocument();
    // A row that wants a person still says so.
    expect(row).toHaveClass('activity-row--human');
    // The merge above it is its own row, and the folded reports are not rows.
    expect(screen.getByTestId('activity-event-40')).toBeInTheDocument();
    for (const seq of [31, 32, 33]) {
      expect(screen.queryByTestId(`activity-event-${seq}`)).toBeNull();
    }
    // The day counts every report, not the one line they are drawn as.
    expect(screen.getByTestId('activity-counts-2026-10-06')).toHaveTextContent('4 events · 3 failed');
  });

  it('opens to the reports themselves, and closes again', async () => {
    renderPage();
    const row = await screen.findByTestId('activity-burst-33');
    const toggle = screen.getByTestId('activity-burst-toggle-33');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
    for (const seq of [31, 32, 33]) {
      expect(within(row).getByTestId(`activity-event-${seq}`)).toBeInTheDocument();
    }

    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByTestId('activity-event-31')).toBeNull());
  });
});
