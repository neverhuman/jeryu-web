// PullConversationTimeline.test.tsx — the pull request page's timeline as a
// component: who may read the pipeline, the exact read it makes, and that a
// log address from a reporter is only a link when it is http(s) or on this site.

import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PipelineEvent } from '../../api/types';
import { PullConversationTimeline } from '../PullConversationTimeline';
import type { PullCommit } from '../pullCommitsModel';
import { htmlShell, mockPipelineApi } from './pipelinePageHelpers';
import { json, renderAt } from './shiftPageHelpers';

let role: 'admin' | 'user' = 'admin';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'operator', role } }),
}));

const SHA = 'abc1234def5678';

function event(seq: number, kind: string, ts: string, fields: Partial<PipelineEvent> = {}): PipelineEvent {
  return {
    seq,
    ts,
    source: 'pr-gate',
    kind,
    reporter: 'gatebot',
    actor: 'build-1/slot0',
    family: null,
    repo: 'jeryu/jeryu-web',
    pr: 35,
    sha: SHA,
    todo_id: null,
    shift: null,
    outcome: null,
    needs_human: false,
    summary: kind,
    reason: null,
    cost_usd: null,
    seconds: null,
    log_tail: null,
    log_url: null,
    detail: null,
    ...fields,
  };
}

const COMMITS: PullCommit[] = [
  { sha: SHA, commit: { message: 'Add the thing', author: { name: 'dana', date: '2026-10-21T14:00:00Z' } } },
];

function renderTimeline(prNumber = '35'): void {
  renderAt(
    '/',
    '/',
    <PullConversationTimeline
      author="dana"
      description="What it does."
      headSha={SHA}
      commits={COMMITS}
      reviews={[]}
      threads={[]}
      repoFullName="jeryu/jeryu-web"
      prNumber={prNumber}
      threadHref={() => null}
      findingHref={() => '#'}
    />
  );
}

function eventsReply(events: PipelineEvent[]) {
  return mockPipelineApi((req) =>
    req.pathname === '/api/v1/events' ? json({ events, latest_seq: events.length }) : undefined
  );
}

describe('PullConversationTimeline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    role = 'admin';
  });

  it('reads the pipeline of this repo and pull request for an admin and draws its runs', async () => {
    const calls = eventsReply([
      event(1, 'gate.started', '2026-10-21T15:00:00Z'),
      event(2, 'gate.finished', '2026-10-21T15:05:00Z', { outcome: 'failure', log_tail: 'gate: FAILED' }),
    ]);
    renderTimeline();
    const timeline = await screen.findByTestId('pr-timeline');
    await waitFor(() => expect(within(timeline).getAllByTestId('pr-timeline-run')).toHaveLength(1));
    expect(calls[0].search).toBe('?repo=jeryu%2Fjeryu-web&pr=35&limit=200');
    expect(within(timeline).getByText('gate: FAILED')).toBeInTheDocument();
  });

  it('links a log only when its address is http(s) or a path on this site', async () => {
    eventsReply([
      event(1, 'gate.started', '2026-10-21T15:00:00Z'),
      event(2, 'gate.finished', '2026-10-21T15:05:00Z', {
        outcome: 'failure',
        log_url: 'https://ci.example.test/logs/2',
      }),
      event(3, 'queue.building', '2026-10-21T16:00:00Z', { log_url: 'javascript:alert(1)' }),
      event(4, 'queue.building', '2026-10-21T17:00:00Z', { log_url: 'data:text/html,<b>x</b>' }),
      event(5, 'queue.building', '2026-10-21T18:00:00Z', { log_url: '//elsewhere.example.test/log' }),
      event(6, 'queue.building', '2026-10-21T19:00:00Z', { log_url: '/api/v1/logs/6' }),
    ]);
    renderTimeline();
    const timeline = await screen.findByTestId('pr-timeline');
    await waitFor(() => expect(within(timeline).getAllByTestId('pr-timeline-event')).toHaveLength(4));
    const links = within(timeline).getAllByRole('link', { name: 'Log' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://ci.example.test/logs/2',
      '/api/v1/logs/6',
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute('rel', 'noreferrer');
      expect(link).toHaveAttribute('target', '_blank');
    }
  });

  it('makes no pipeline read for a non-admin, and the story is the pushes alone', async () => {
    role = 'user';
    const calls = mockPipelineApi();
    renderTimeline();
    const timeline = await screen.findByTestId('pr-timeline');
    expect(within(timeline).getByTestId('pr-timeline-commit')).toBeInTheDocument();
    expect(within(timeline).queryByTestId('pr-timeline-run')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('makes no pipeline read without a pull request number', async () => {
    const calls = mockPipelineApi();
    renderTimeline('');
    await screen.findByTestId('pr-timeline');
    expect(calls).toHaveLength(0);
  });

  it('draws no runs on a server without the feed', async () => {
    const calls = mockPipelineApi((req) => (req.pathname === '/api/v1/events' ? htmlShell() : undefined));
    renderTimeline();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const timeline = screen.getByTestId('pr-timeline');
    expect(within(timeline).queryByTestId('pr-timeline-run')).toBeNull();
    expect(within(timeline).getByTestId('pr-timeline-opened')).toBeInTheDocument();
  });

  it('carries the threads anchor on the timeline when no thread is left open', async () => {
    mockPipelineApi();
    renderTimeline();
    expect(await screen.findByTestId('pr-timeline')).toHaveAttribute('id', 'pr-threads');
  });
});
