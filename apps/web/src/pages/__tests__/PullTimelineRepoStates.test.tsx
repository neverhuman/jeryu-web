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
  it('heads a section per repository and lists it as one run, furthest from done first', () => {
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
    expect(section).toHaveTextContent('2 in flight · 1 awaiting release · 2 released · 1 closed');
    expect(within(section).getByRole('link', { name: 'jeryu/jeryu-web' })).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-web/pulls'
    );
    // No state headings: each row says where it is.
    expect(section.querySelector('.pull-state__label')).toBeNull();
    expect(statusesIn(section)).toEqual([
      'Waiting on checks',
      'Mergeable',
      'Merged · not yet released',
      'In canary · v8',
      'In prod · v6',
      'Closed',
    ]);
  });

  it('shows the newest row at a state only a release moves, with how many wait behind it', async () => {
    const ladders = new Map<number, ReleaseLadder>([
      [10, ladder(null)],
      [11, ladder(null)],
      [12, ladder(null)],
      [13, ladder('production', 'v6')],
      [14, ladder('production', 'v6')],
    ]);
    render(
      [
        pull(10, 'merged', { updated: '2026-09-10T00:00:00Z' }),
        pull(11, 'merged', { updated: '2026-09-19T00:00:00Z' }),
        pull(12, 'merged', { updated: '2026-09-15T00:00:00Z' }),
        pull(13, 'merged', { updated: '2026-09-05T00:00:00Z' }),
        pull(14, 'merged', { updated: '2026-09-06T00:00:00Z' }),
      ],
      (pr) => ladders.get(pr.number) ?? ladder(null)
    );
    // #11 stands for the three waiting; #14 is what prod runs.
    expect(screen.getByTestId('pull-timeline-jeryu/jeryu-web-11')).toBeVisible();
    expect(screen.getByTestId('pull-waiting-jeryu/jeryu-web-11')).toHaveTextContent('+ 2 more waiting');
    expect(screen.getByTestId('pull-timeline-jeryu/jeryu-web-14')).toBeVisible();
    for (const number of [12, 10, 13]) {
      expect(screen.getByTestId(`pull-timeline-jeryu/jeryu-web-${number}`)).not.toBeVisible();
    }
    const history = screen.getByTestId('pull-older-jeryu/jeryu-web');
    expect(history).toHaveTextContent('History (3)');
    await userEvent.click(within(history).getByText('History (3)'));
    expect(screen.getByTestId('pull-timeline-jeryu/jeryu-web-13')).toBeVisible();
  });

  it('says prod once: only the newest row an environment runs carries its pill', () => {
    render(
      [
        pull(20, 'merged', { updated: '2026-09-19T00:00:00Z' }),
        pull(21, 'merged', { updated: '2026-09-10T00:00:00Z' }),
      ],
      () => ladder('production', 'v6')
    );
    expect(screen.getAllByTestId(/^pull-ladder-.*-production$/)).toHaveLength(1);
    expect(pip('jeryu/jeryu-web-20', 'production')).toBe('in');
    // The pill is the environment alone, not the whole ladder.
    expect(screen.queryByTestId('pull-ladder-jeryu/jeryu-web-20-dev')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pull-ladder-jeryu/jeryu-web-21')).not.toBeInTheDocument();
  });

  it('says a merged row has passed open and mergeable, and names failing checks as of the merge', () => {
    render([pull(30, 'merged', { checks: { failing: 2 } })], () => ladder(null));
    expect(screen.getByTestId('pull-stage-jeryu/jeryu-web-30-opened')).not.toHaveTextContent('open');
    expect(screen.getByTestId('pull-stage-jeryu/jeryu-web-30-mergeable')).not.toHaveTextContent('merged');
    expect(screen.getByTestId('pull-stage-jeryu/jeryu-web-30-checks')).toHaveTextContent('2 failing, not required');
    expect(screen.getByTestId('pull-stage-jeryu/jeryu-web-30-released')).toHaveTextContent('next release');
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

  it('names where a merged row is, and reads an unknown release as unknown', () => {
    render([pull(40, 'merged')], (pr) => (pr.number === 40 ? ladder('canary', 'v8') : ladder(null)));
    expect(pip('jeryu/jeryu-web-40', 'canary')).toBe('in');
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
  });

  it('shows shift work on a branch as one row per branch, and leaves queued todos to Work', async () => {
    const ghosts = pullGhostGroups(
      [
        todo('t1', {
          status: 'claimed',
          lease_until: '2026-09-20T03:00:00Z',
          lease_live: true,
          claim_by: 'alton@xbabe0/w1',
        }),
        todo('t2', { status: 'done' }),
        todo('t3', { status: 'claimed', repos: ['jeryu-api'] }),
        todo('t4', { status: 'open' }),
      ],
      { now: new Date('2026-09-20T02:46:00Z'), openLimit: 1 }
    );
    renderAt(
      '/pull-room',
      '/pull-room',
      <PullRequestTimeline
        pulls={[pull(60, 'open')]}
        emptyMessage="none"
        showRepo
        ghosts={ghosts}
        repoKeyFor={(repo) => (repo.includes('/') ? repo : `jeryu/${repo}`)}
      />
    );

    const branch = screen.getByTestId('pull-branch-jeryu/jeryu-web-dayshift/2026-09-20');
    expect(screen.getByTestId('pull-repo-jeryu/jeryu-web')).toContainElement(branch);
    expect(branch).toHaveTextContent('dayshift/2026-09-20 · 2 todos');
    expect(branch).toHaveTextContent('1 working · alton@xbabe0/w1');
    // The branch sits on the same track as the PR below it, ahead of it.
    const rows = screen.getAllByTestId(/^pull-(branch|timeline)-jeryu\/jeryu-web/);
    expect(rows[0]).toBe(branch);

    // Its todos fold under it.
    expect(within(branch).getByTestId('pull-ghost-t2')).not.toBeVisible();
    await userEvent.click(within(branch).getByText(/2 todos/));
    expect(within(branch).getByTestId('pull-ghost-t1')).toHaveTextContent('hands off in');
    expect(within(branch).getByTestId('pull-ghost-t2')).toHaveTextContent('PR pending');

    // A repository with no pull requests still gets a section for its branch.
    expect(screen.getByTestId('pull-repo-jeryu/jeryu-api')).toHaveTextContent('todo t3');
    // Queued work is only counted, once, not listed.
    expect(screen.queryByTestId('pull-ghost-t4')).not.toBeInTheDocument();
    expect(screen.getByTestId('pull-shift-queue')).toHaveTextContent('3 in flight · 1 queued');
  });

  it('keeps shift work that names no repository visible above the sections', () => {
    const ghosts = pullGhostGroups([todo('t9', { status: 'claimed', repos: [] })], {
      now: new Date('2026-09-20T02:46:00Z'),
    });
    renderAt(
      '/pull-room',
      '/pull-room',
      <PullRequestTimeline
        pulls={[pull(61, 'open')]}
        emptyMessage="none"
        showRepo
        ghosts={ghosts}
        repoKeyFor={() => null}
      />
    );
    const unassigned = screen.getByTestId('pull-ghosts-unassigned');
    expect(unassigned).toHaveTextContent('Shift work not tied to a repository');
    expect(within(unassigned).getByTestId('pull-ghost-t9')).toBeInTheDocument();
  });

  it('leaves the repository heading off when the page is already one repository', () => {
    renderAt(
      '/repos/jeryu/jeryu/jeryu-web/pulls',
      '/repos/jeryu/:owner/:repo/pulls',
      <PullRequestTimeline pulls={[pull(70, 'open')]} emptyMessage="none" />
    );
    expect(screen.queryByRole('link', { name: 'jeryu/jeryu-web' })).not.toBeInTheDocument();
    expect(screen.getByTestId('pull-status-70')).toHaveTextContent('Mergeable');
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

/** Every row's status line in a section, in DOM order. */
function statusesIn(section: HTMLElement): string[] {
  return [...section.querySelectorAll('.pull-timeline__status')].map((node) =>
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
    shift: 'dayshift/2026-09-20',
    change_set: null,
    commits: {},
    merged: false,
    note: '',
    triaged: true,
    worked_by: [],
    ...extra,
  } as ShiftTodo;
}
