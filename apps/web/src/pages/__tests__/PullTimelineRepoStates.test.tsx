import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('heads a section per repository and orders its states least far first', () => {
    const ladders = new Map<number, ReleaseLadder>([
      [3, ladder(null)],
      [4, ladder('canary', 'v8')],
      [5, ladder('production', 'v6')],
    ]);
    render(
      [
        pull(1, 'open', { checks: { failing: 1 } }),
        pull(2, 'open'),
        pull(3, 'merged'),
        pull(4, 'merged'),
        pull(5, 'merged'),
        pull(6, 'closed'),
      ],
      (pr) => ladders.get(pr.number) ?? ladder(null)
    );

    const section = screen.getByTestId('pull-repo-jeryu/jeryu-web');
    expect(section).toHaveTextContent('6 PRs · 2 open');
    expect(within(section).getByRole('link', { name: 'jeryu/jeryu-web' })).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-web/pulls'
    );
    expect(labelsIn(section)).toEqual([
      'Waiting on checks',
      'Mergeable',
      'Merged · not yet released',
      'In canary · v8',
      'In prod · v6',
      'Closed',
    ]);
  });

  it('shows only the newest pull request at a state until its expander is opened', async () => {
    const ladders = new Map<number, ReleaseLadder>([
      [10, ladder('dev', 'v9')],
      [11, ladder('dev', 'v9')],
      [12, ladder('dev', 'v9')],
    ]);
    render(
      [
        pull(10, 'merged', { updated: '2026-09-10T00:00:00Z' }),
        pull(11, 'merged', { updated: '2026-09-19T00:00:00Z' }),
        pull(12, 'merged', { updated: '2026-09-15T00:00:00Z' }),
      ],
      (pr) => ladders.get(pr.number) ?? ladder(null)
    );

    // The frontier row is visible; the two behind it are not.
    expect(screen.getByTestId('pull-timeline-jeryu/jeryu-web-11')).toBeVisible();
    expect(screen.getByTestId('pull-timeline-jeryu/jeryu-web-12')).not.toBeVisible();
    const older = screen.getByTestId('pull-older-jeryu/jeryu-web-dev');
    expect(older).toHaveTextContent('2 older at this state');

    await userEvent.click(within(older).getByText(/older at this state/));
    expect(screen.getByTestId('pull-timeline-jeryu/jeryu-web-12')).toBeVisible();
    expect(screen.getByTestId('pull-timeline-jeryu/jeryu-web-10')).toBeVisible();
  });

  it('gives a state no expander when nothing older sits at it', () => {
    render([pull(20, 'open')], () => ladder(null));
    expect(screen.getByTestId('pull-state-jeryu/jeryu-web-mergeable')).toBeInTheDocument();
    expect(screen.queryByTestId('pull-older-jeryu/jeryu-web-mergeable')).not.toBeInTheDocument();
  });

  it('separates repositories, newest activity first', () => {
    render(
      [
        pull(30, 'open', { repo: 'jeryu/jeryu-api', updated: '2026-09-11T00:00:00Z' }),
        pull(31, 'open', { repo: 'jeryu/jeryu-web', updated: '2026-09-19T00:00:00Z' }),
      ],
      () => ladder(null)
    );
    const sections = screen.getAllByTestId(/^pull-repo-/);
    expect(sections.map((s) => s.getAttribute('data-testid'))).toEqual([
      'pull-repo-jeryu/jeryu-web',
      'pull-repo-jeryu/jeryu-api',
    ]);
  });

  it('keeps the release ladder on each row and reads an unknown release as unknown', () => {
    render([pull(40, 'merged')], (pr) => (pr.number === 40 ? ladder('canary', 'v8') : ladder(null)));
    expect(pip('jeryu/jeryu-web-40', 'canary')).toBe('in');
    expect(pip('jeryu/jeryu-web-40', 'stable')).toBe('out');
    expect(screen.getByTestId('pull-stage-jeryu/jeryu-web-40-released')).toHaveTextContent(
      'canary · v8'
    );

    // A row with no ladder at all says so rather than claiming "unreleased".
    render([pull(41, 'merged')]);
    const stage = screen.getByTestId('pull-stage-jeryu/jeryu-web-41-released');
    expect(stage).toHaveAttribute('data-status', 'unknown');
    expect(stage).toHaveTextContent('release unknown');
  });

  it('names a superseded pull request on the row that carried it instead of listing it', () => {
    render(
      [pull(50, 'closed', { title: 'first go, superseded by #51' }), pull(51, 'merged')],
      () => ladder('dev', 'v9')
    );
    expect(screen.getByTestId('pull-timeline-jeryu/jeryu-web-51')).toHaveTextContent(
      'supersedes #50'
    );
    expect(screen.queryByTestId('pull-timeline-jeryu/jeryu-web-50')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pull-state-jeryu/jeryu-web-closed')).not.toBeInTheDocument();
  });

  it('shows shift work that has no pull request yet above the repositories', () => {
    const ghosts = pullGhostGroups(
      [
        todo('t1', { status: 'claimed', lease_until: '2026-09-20T03:00:00Z', lease_live: true }),
        todo('t2', { status: 'done' }),
      ],
      { now: new Date('2026-09-20T02:46:00Z'), openLimit: 1 }
    );
    renderAt(
      '/pull-room',
      '/pull-room',
      <PullRequestTimeline pulls={[pull(60, 'open')]} emptyMessage="none" showRepo ghosts={ghosts} />
    );

    expect(screen.getByTestId('pull-ghost-t1')).toHaveTextContent('no pull request yet');
    expect(screen.getByTestId('pull-ghost-t1')).toHaveTextContent('hands off in');
    expect(screen.getByTestId('pull-ghost-t2')).toHaveTextContent('PR pending');
    // The real pull request still renders in its repository's section below.
    expect(screen.getByTestId('pull-repo-jeryu/jeryu-web')).toBeInTheDocument();
  });

  it('leaves the repository heading off when the page is already one repository', () => {
    renderAt(
      '/repos/jeryu/jeryu/jeryu-web/pulls',
      '/repos/jeryu/:owner/:repo/pulls',
      <PullRequestTimeline pulls={[pull(70, 'open')]} emptyMessage="none" />
    );
    expect(screen.queryByRole('link', { name: 'jeryu/jeryu-web' })).not.toBeInTheDocument();
    expect(screen.getByTestId('pull-state-jeryu/jeryu-web-mergeable')).toBeInTheDocument();
    expect(screen.getByTestId('pull-timeline-70')).toBeInTheDocument();
  });
});

function render(
  pulls: PullRequestSummary[],
  ladderFor?: (pr: PullRequestSummary) => ReleaseLadder
): void {
  renderAt(
    '/pull-room',
    '/pull-room',
    <PullRequestTimeline pulls={pulls} emptyMessage="none" showRepo ladderFor={ladderFor} />
  );
}

/** Every state heading of a section, in DOM order. */
function labelsIn(section: HTMLElement): string[] {
  return [...section.querySelectorAll('.pull-state__label')].map((node) =>
    (node.textContent ?? '').trim()
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
  extra: {
    repo?: string;
    title?: string;
    updated?: string;
    checks?: Partial<PullRequestSummary['checks']>;
  } = {}
): PullRequestSummary {
  const [owner = 'jeryu', name = 'jeryu-web'] = (extra.repo ?? 'jeryu/jeryu-web').split('/');
  return {
    repo: { id: `${owner}/${name}`, host: 'jeryu', owner, name },
    number,
    entity: { kind: 'pull_request', id: String(number) },
    title: extra.title ?? `change ${number}`,
    author: 'alton',
    head_ref: `feat/${number}`,
    base_ref: 'main',
    head_sha: sha(String(number % 10)),
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
    checks: { total: 2, passing: 2, failing: 0, pending: 0, skipped: 0, ...extra.checks },
    agents: { active_sessions: 0, proposed_patches: 0, evidence_packets: 0, blockers: 0 },
    labels: [],
    updated_at: extra.updated ?? '2026-09-18T00:00:00Z',
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
