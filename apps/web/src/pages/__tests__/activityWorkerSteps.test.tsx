// activityWorkerSteps.test.tsx — the slots' own step beats on the Activity
// feed: out of All so the outcomes are readable, one toggle away, and what the
// Workers chip is for.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import { mockPipelineApi } from './pipelinePageHelpers';
import { pipelineEvent } from './pipelineTestData';
import { json, renderAt } from './shiftPageHelpers';

function beat(seq: number, from: string, to: string) {
  return pipelineEvent({
    seq,
    kind: 'worker.stage',
    source: 'todoq',
    family: 'jeryu',
    todo_id: '20260919-0800-aaa',
    actor: 'alton@xbabe0/w1',
    summary: `w1 jeryu: ${from} -> ${to} on 20260919-0800-aaa`,
  });
}

const EVENTS = [
  beat(26, 'gate', 'land'),
  beat(25, 'agent', 'gate'),
  pipelineEvent({ seq: 24, kind: 'gate.finished', outcome: 'success', summary: 'required passed' }),
  beat(23, 'prepare', 'agent'),
  pipelineEvent({ seq: 22, kind: 'worker.error', outcome: 'failure', summary: 'w1 could not prepare' }),
  pipelineEvent({ seq: 21, kind: 'pr.merged', outcome: 'merged', summary: 'merged #35' }),
];

function renderPage(path = '/activity'): void {
  mockPipelineApi((req) =>
    req.pathname === '/api/v1/events' ? json({ events: EVENTS, latest_seq: 26 }) : undefined
  );
  renderAt(path, '/activity', <ActivityPage />);
}

function toggle(): HTMLElement {
  return screen.getByTestId('activity-worker-steps');
}

describe('Activity worker steps', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the step beats out of All and offers them on a toggle', async () => {
    renderPage();
    // The gate, the merge and the slot's error are the rows; the beats are not.
    await screen.findByTestId('activity-event-24');
    expect(screen.getByTestId('activity-event-21')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-22')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-stages-26')).toBeNull();
    for (const seq of [23, 25, 26]) {
      expect(screen.queryByTestId(`activity-event-${seq}`)).toBeNull();
    }
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    expect(toggle()).toHaveAttribute('title', '3 worker steps left out of this page');
    expect(toggle()).toHaveAccessibleName('Worker steps');
  });

  it('shows them when the toggle is pressed, and hides them again', async () => {
    renderPage();
    await screen.findByTestId('activity-event-24');
    fireEvent.click(toggle());
    // Two of the beats are consecutive, so they fold into their run's row.
    await screen.findByTestId('activity-stages-26');
    expect(screen.getByTestId('activity-event-23')).toBeInTheDocument();
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-pressed', 'true'));
    // Pressed, the toggle offers the other direction and counts nothing.
    expect(toggle()).toHaveAttribute('title', 'Hide the stage beats the working slots report');

    fireEvent.click(toggle());
    await waitFor(() => expect(screen.queryByTestId('activity-stages-26')).toBeNull());
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows them under the Workers chip, which needs no toggle', async () => {
    renderPage();
    await screen.findByTestId('activity-event-24');
    fireEvent.click(screen.getByRole('button', { name: 'Workers' }));
    await screen.findByTestId('activity-stages-26');
    // The chip asked for the beats by name, so there is nothing left to toggle,
    // and the gate and the merge are the rows it narrowed away.
    expect(screen.queryByTestId('activity-worker-steps')).toBeNull();
    expect(screen.getByTestId('activity-event-22')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-event-24')).toBeNull();
    expect(screen.queryByTestId('activity-event-21')).toBeNull();
  });

  it('says a page of nothing but steps is not an empty feed', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events'
        ? json({ events: [beat(26, 'gate', 'land')], latest_seq: 26 })
        : undefined
    );
    renderAt('/activity', '/activity', <ActivityPage />);
    await waitFor(() =>
      expect(
        screen.getByText('Everything on this page is a worker step. Turn on Worker steps to see it.')
      ).toBeInTheDocument()
    );
    fireEvent.click(toggle());
    await screen.findByTestId('activity-event-26');
  });
});
