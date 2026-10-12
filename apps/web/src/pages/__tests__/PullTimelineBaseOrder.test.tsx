import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PullRequestSummary } from '../../api/types';
import { PullRequestTimeline } from '../PullRequestTimeline';
import { renderAt } from './shiftPageHelpers';

const sha = (c: string) => c.repeat(40);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the timeline ordered by base', () => {
  it('keeps the pipeline order until asked, and asks for no history', async () => {
    const fetch = mockHistory('abcd');
    render('/pull-room', [pull(1, 'a'), pull(2, 'c')]);
    expect(screen.getByTestId('pull-order-state')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('pull-graph-acme/widgets')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('hangs each open pull request off the commit it was opened against', async () => {
    mockHistory('abcd');
    render('/pull-room?order=base', [pull(1, 'a'), pull(2, 'c'), pull(3, 'a')]);

    const rail = await screen.findByTestId('pull-graph-acme/widgets-main');
    const current = await within(rail).findByTestId('pull-base-acme/widgets-main-aaaaaaa');
    expect(current).toHaveTextContent('aaaaaaa commit a · current');
    expect(current).toHaveAttribute('data-position', 'current');
    const behind = within(rail).getByTestId('pull-base-acme/widgets-main-ccccccc');
    expect(behind).toHaveTextContent('ccccccc commit c · 2 behind');
    expect(rail).toHaveTextContent('1 more commit on main');

    // Rows follow their base node, top to bottom, newest first under one base.
    const order = [...rail.querySelectorAll(':scope > ol > li')].map(
      (item) => item.getAttribute('data-testid') ?? item.className
    );
    expect(order).toEqual([
      'pull-base-acme/widgets-main-aaaaaaa',
      'pull-timeline-acme/widgets-3',
      'pull-timeline-acme/widgets-1',
      'pull-graph__gap',
      'pull-base-acme/widgets-main-ccccccc',
      'pull-timeline-acme/widgets-2',
    ]);
  });

  it('switches with the toggle and writes the order to the address', async () => {
    mockHistory('ab');
    render('/pull-room', [pull(1, 'b')]);
    await userEvent.click(screen.getByTestId('pull-order-base'));
    expect(screen.getByTestId('pull-order-base')).toHaveAttribute('aria-pressed', 'true');
    expect(
      await screen.findByTestId('pull-base-acme/widgets-main-bbbbbbb')
    ).toHaveTextContent('1 behind');
    await userEvent.click(screen.getByTestId('pull-order-state'));
    expect(screen.queryByTestId('pull-graph-acme/widgets')).toBeNull();
  });

  it('draws the bases unplaced when the history does not answer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'no' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    );
    render('/pull-room?order=base', [pull(1, 'a')]);
    const node = await screen.findByTestId('pull-base-acme/widgets-main-aaaaaaa');
    expect(node).toHaveAttribute('data-position', 'unknown');
    expect(screen.getByTestId('pull-timeline-acme/widgets-1')).toBeInTheDocument();
  });
});

function render(path: string, pulls: PullRequestSummary[]): void {
  renderAt(
    path,
    '/pull-room',
    <PullRequestTimeline pulls={pulls} emptyMessage="none" showRepo />
  );
}

/** main's history, one commit per letter, newest first. */
function mockHistory(letters: string) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    if (url.pathname !== '/api/v1/repos/repo-1/commits' || url.searchParams.get('ref') !== 'main') {
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    }
    const commits = [...letters].map((letter) => ({
      sha: sha(letter),
      summary: `commit ${letter}`,
      author: 'operator',
      committed_at: '2026-10-12T00:00:00Z',
    }));
    return new Response(
      JSON.stringify({
        ref: 'main',
        sha: sha(letters[0] ?? 'a'),
        commits,
        page: { limit: 100, page: 1, total: commits.length, has_more: false },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  });
}

function pull(number: number, base: string): PullRequestSummary {
  return {
    repo: { id: 'repo-1', host: 'jeryu', owner: 'acme', name: 'widgets' },
    number,
    entity: { kind: 'pull_request', id: String(number) },
    title: `change ${number}`,
    author: 'operator',
    head_ref: `feat/${number}`,
    base_ref: 'main',
    head_sha: sha('9'),
    base_sha: sha(base),
    state: 'open',
    draft: false,
    mergeable: {
      level: 'mergeable',
      can_merge: true,
      reason: null,
      exact_head_sha: sha('9'),
      required_gate: null,
    },
    review: {
      required_approvals: 1,
      approvals: 1,
      changes_requested: 0,
      unresolved_threads: 0,
      user_review_state: null,
    },
    checks: { total: 1, passing: 1, failing: 0, pending: 0, skipped: 0 },
    agents: { active_sessions: 0, proposed_patches: 0, evidence_packets: 0, blockers: 0 },
    labels: [],
    updated_at: `2026-10-12T00:00:0${number}Z`,
    passport_hash: null,
    available_actions: [],
  };
}
