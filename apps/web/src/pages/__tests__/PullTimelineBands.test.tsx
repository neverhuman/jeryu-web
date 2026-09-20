import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PullRequestSummary, ShiftTodo } from '../../api/types';
import { PullRequestTimeline } from '../PullRequestTimeline';
import { pullGhostGroups } from '../pullGhostsModel';
import {
  CHANNEL_ORDER,
  type ChannelPip,
  type Membership,
  type ReleaseLadder,
} from '../releaseChannelsModel';
import { renderAt } from './shiftPageHelpers';

const sha = (c: string) => c.repeat(40);

describe('the Pull requests timeline', () => {
  it('shows the release stage as a ladder and fills it as far as the change got', () => {
    const ladders = new Map<number, ReleaseLadder>([
      [1, ladder('canary')],
      [2, ladder(null)],
    ]);
    render([pull(1, 'merged'), pull(2, 'merged')], (pr) => ladders.get(pr.number) ?? ladder(null));

    // Row 1 is in dev and canary, and decidedly not in stable or production.
    expect(pip('jeryu/jeryu-web-1', 'dev')).toBe('in');
    expect(pip('jeryu/jeryu-web-1', 'canary')).toBe('in');
    expect(pip('jeryu/jeryu-web-1', 'stable')).toBe('out');
    expect(pip('jeryu/jeryu-web-1', 'production')).toBe('out');
    expect(
      screen.getByTestId('pull-stage-jeryu/jeryu-web-1-released')
    ).toHaveAttribute('data-status', 'active');
    expect(
      screen.getByTestId('pull-stage-jeryu/jeryu-web-2-released')
    ).toHaveAttribute('data-status', 'pending');
  });

  it('reads a release it could not place as unknown, not as unreleased', () => {
    render([pull(1, 'merged')]);
    const stage = screen.getByTestId('pull-stage-jeryu/jeryu-web-1-released');
    expect(stage).toHaveAttribute('data-status', 'unknown');
    expect(stage).toHaveTextContent('release unknown');
  });

  it('puts settled history behind one collapsed band and keeps the manifest open', () => {
    const ladders = new Map<number, ReleaseLadder>([
      [1, ladder(null)],
      [2, ladder('production', 'v6')],
    ]);
    render([pull(1, 'merged'), pull(2, 'merged')], (pr) => ladders.get(pr.number) ?? ladder(null));

    const pending = screen.getByTestId('pull-band-pending');
    expect(pending).toHaveAttribute('open');
    expect(pending).toHaveTextContent('Merged · not yet released');
    const settled = screen.getByTestId('pull-band-production');
    expect(settled).not.toHaveAttribute('open');
    expect(settled).toHaveTextContent('In prod');
    expect(settled).toHaveTextContent('v6');
  });

  it('names a superseded pull request on the row that carried it instead of listing it', () => {
    render(
      [pull(1, 'closed', { title: 'first go, superseded by #2' }), pull(2, 'merged')],
      () => ladder('dev')
    );
    expect(screen.getByTestId('pull-timeline-jeryu/jeryu-web-2')).toHaveTextContent(
      'supersedes #1'
    );
    expect(screen.queryByTestId('pull-timeline-jeryu/jeryu-web-1')).not.toBeInTheDocument();
  });

  it('shows shift work that has no pull request yet above the open rows', () => {
    const ghosts = pullGhostGroups(
      [
        todo('t1', { status: 'claimed', lease_until: '2026-09-20T03:00:00Z', lease_live: true }),
        todo('t2', { status: 'done' }),
        todo('t3', { status: 'open' }),
      ],
      { now: new Date('2026-09-20T02:46:00Z'), openLimit: 1 }
    );
    renderAt(
      '/pull-room',
      '/pull-room',
      <PullRequestTimeline pulls={[pull(9, 'open')]} emptyMessage="none" showRepo ghosts={ghosts} />
    );

    expect(screen.getByTestId('pull-ghost-t1')).toHaveTextContent('no pull request yet');
    expect(screen.getByTestId('pull-ghost-t1')).toHaveTextContent('hands off in');
    expect(screen.getByTestId('pull-ghost-t2')).toHaveTextContent('PR pending');
    // The real PR still renders: a ghost is other work, not this one.
    expect(screen.getByTestId('pull-timeline-jeryu/jeryu-web-9')).toBeInTheDocument();
  });
});

function render(
  pulls: PullRequestSummary[],
  ladderFor?: (pr: PullRequestSummary) => ReleaseLadder
): void {
  renderAt(
    '/pull-room',
    '/pull-room',
    <PullRequestTimeline
      pulls={pulls}
      emptyMessage="none"
      showRepo
      ladderFor={ladderFor}
    />
  );
}

/** The membership a row's pip is rendered with. */
function pip(rowId: string, channel: string): string | null {
  return screen.getByTestId(`pull-ladder-${rowId}-${channel}`).getAttribute('data-membership');
}

function ladder(furthest: string | null, release = 'v1'): ReleaseLadder {
  const reached = furthest === null ? -1 : CHANNEL_ORDER.indexOf(furthest as never);
  const pips: ChannelPip[] = CHANNEL_ORDER.map((channel, index) => {
    const membership: Membership = index <= reached ? 'in' : 'out';
    return {
      id: channel,
      label: channel,
      membership,
      release: membership === 'in' ? release : null,
      at: null,
    };
  });
  return {
    kind: 'channels',
    pips,
    furthest: furthest === null ? null : (furthest as never),
    release: furthest === null ? null : release,
    uncertain: false,
  };
}

function pull(
  number: number,
  state: PullRequestSummary['state'],
  extra: { title?: string } = {}
): PullRequestSummary {
  return {
    repo: { id: 'r1', host: 'jeryu', owner: 'jeryu', name: 'jeryu-web' },
    number,
    entity: { kind: 'pull_request', id: String(number) },
    title: extra.title ?? `change ${number}`,
    author: 'alton',
    head_ref: `feat/${number}`,
    base_ref: 'main',
    head_sha: sha(String(number)),
    base_sha: sha('0'),
    state,
    draft: false,
    mergeable: {
      level: 'mergeable',
      can_merge: true,
      reason: null,
      exact_head_sha: sha('1'),
      required_gate: null,
    },
    review: {
      required_approvals: 1,
      approvals: 1,
      changes_requested: 0,
      unresolved_threads: 0,
      user_review_state: null,
    },
    checks: { total: 2, passing: 2, failing: 0, pending: 0, skipped: 0 },
    agents: { active_sessions: 0, proposed_patches: 0, evidence_packets: 0, blockers: 0 },
    labels: [],
    updated_at: '2026-09-18T00:00:00Z',
    passport_hash: null,
    available_actions: [],
  } as PullRequestSummary;
}

function todo(id: string, extra: Partial<ShiftTodo>): ShiftTodo {
  return {
    id,
    family: 'jeryu',
    title: `todo ${id}`,
    body: '',
    repos: ['jeryu-web'],
    mode: 'now',
    priority: 2,
    blocked_by: [],
    status: 'open',
    attempts: 0,
    requested_by: 'alton@xbabe0',
    filed_at: '2026-09-20T02:00:00Z',
    claim_by: null,
    lease_until: null,
    lease_live: false,
    shift: 'bulletshift/2026-09-20',
    change_set: null,
    commits: {},
    merged: false,
    note: '',
    triaged: true,
    worked_by: [],
    ...extra,
  } as ShiftTodo;
}
