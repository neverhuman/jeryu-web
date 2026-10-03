import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PullRoomPage } from './PullRoomPage';

// What waits on a person is marked on its own row (PullTimelineRepoStates,
// pullAttentionModel, e2e 29-pipeline); these URL tests mock every data hook.
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../hooks/usePipeline', () => ({ useAttention: () => ({ data: undefined }) }));

vi.mock('../hooks/useControlPlane', () => ({ CONTROL_PLANE_MAX_LIMIT: 500, useControlPlane: () => ({
  isLoading: false, isError: false,
  data: {
    pullRequests: ['owner/a', 'owner/b'].map((repo) => ({
      repo, number: 1, title: `Change in ${repo}`, author: 'alice', draft: false, state: 'open',
      headRef: 'feature', headSha: 'abc12345', baseRef: 'main', baseSha: 'def12345',
      mergeable: true, mergeableState: 'clean', changedFiles: [], stateEvidence: 'fresh',
      checks: { total: 1, queued: 0, running: 0, failing: 0, successful: 1, missing: false },
    })),
    summary: {
      openPrCount: 2,
      missingCheckPrCount: 0,
      failingCheckCount: 0,
      waitingCheckPrCount: 0,
      failingCheckPrCount: 0,
    },
    toolBuild: { clusterCount: 0, topClusters: [] },
  },
}) }));
vi.mock('../hooks/useRepositories', () => ({
  useRepositories: () => ({
    isLoading: false,
    isError: false,
    data: {
      repositories: [
        { id: { owner: 'owner', name: 'a' }, family: 'fam', open_pull_requests: 1 },
        { id: { owner: 'owner', name: 'b' }, family: null, open_pull_requests: 1 },
      ],
    },
  }),
}));
// The timeline asks each repo the snapshot names for its list; answer with one
// open pull request per repo asked for, so a row proves the repo was loaded.
vi.mock('../hooks/useRepoPullLists', () => ({
  useRepoPullLists: (repos: string[]) => ({
    loading: [],
    failed: [],
    pulls: repos.map((full) => {
      const [owner, name] = full.split('/');
      return {
        repo: { id: full, host: 'jeryu', owner, name },
        number: 1,
        title: `Change in ${full}`,
        author: 'alice',
        head_ref: 'feature',
        base_ref: 'main',
        head_sha: 'abc12345',
        base_sha: 'def12345',
        state: 'open',
        draft: false,
        mergeable: { level: 'mergeable', can_merge: true, reason: null },
        review: { required_approvals: 1, approvals: 1, changes_requested: 0 },
        checks: { total: 1, passing: 1, failing: 0, pending: 0, skipped: 0 },
        updated_at: '2026-09-19T00:00:00Z',
      };
    }),
  }),
}));

// The release ladder and the shift queue are their own pages' concern; here
// they answer nothing so the URL behaviour is what is under test.
vi.mock('../hooks/useRepoChannels', () => ({
  EMPTY_CHANNELS: { baselines: { kind: 'none', baselines: [] }, compares: new Map() },
  useRepoChannels: () => ({ byRepo: new Map(), isLoading: false }),
}));
vi.mock('../hooks/useShift', () => ({
  useShiftTodos: () => ({ data: { todos: [] }, isLoading: false, isError: false }),
}));

function setup(initialEntries: string[]) {
  const router = createMemoryRouter([{ path: '/pull-room', element: <PullRoomPage /> }], {
    initialEntries,
  });
  render(<StrictMode><RouterProvider router={router} /></StrictMode>);
  return router;
}

function expectRepo(repo: string) {
  expect(screen.getByLabelText('Repo')).toHaveValue(repo);
  // Timeline rows by default, board cards behind ?view=board (or its older name, queue).
  const board = screen.queryByTestId('pull-timeline') === null;
  for (const name of ['owner/a', 'owner/b']) {
    const shown = screen.queryByTestId(board ? `pull-card-${name}-1` : `pull-timeline-${name}-1`);
    if (repo === 'all' || name === repo) expect(shown).toBeInTheDocument();
    else expect(shown).not.toBeInTheDocument();
  }
}

describe('Pull Room URL navigation', () => {
  it('updates the selector and results on shared-link navigation and history traversal', async () => {
    const user = userEvent.setup();
    const router = setup(['/pull-room?repo=owner%2Fa']);
    expectRepo('owner/a');
    await user.selectOptions(screen.getByLabelText('State'), 'open');
    await user.type(screen.getByLabelText('Search pull requests'), 'Change');

    await act(async () => { await router.navigate('/pull-room?repo=owner%2Fb'); });
    expectRepo('owner/b');
    expect(screen.getByLabelText('State')).toHaveValue('open');
    expect(screen.getByLabelText('Search pull requests')).toHaveValue('Change');
    await act(async () => { await router.navigate('/pull-room'); });
    expectRepo('all');
    await act(async () => { await router.navigate(-1); });
    expectRepo('owner/b');
    await act(async () => { await router.navigate(-1); });
    expectRepo('owner/a');
    await act(async () => { await router.navigate(1); });
    expectRepo('owner/b');
  });

  it('keeps other query parameters and replaces the current history entry when selecting a repo', async () => {
    const user = userEvent.setup();
    const router = setup(['/pull-room?repo=owner%2Fb', '/pull-room?repo=owner%2Fa&view=queue']);
    await user.selectOptions(screen.getByLabelText('Repo'), 'owner/b');
    expectRepo('owner/b');
    expect(new URLSearchParams(router.state.location.search).get('repo')).toBe('owner/b');
    expect(new URLSearchParams(router.state.location.search).get('view')).toBe('queue');
    await user.selectOptions(screen.getByLabelText('Repo'), 'all');
    expectRepo('all');
    expect(router.state.location.search).toBe('?view=queue');
    await act(async () => { await router.navigate(-1); });
    expectRepo('owner/b');
    expect(router.state.location.search).toBe('?repo=owner%2Fb');
  });

  it('shows the timeline by default, with the repo leading each row, and the board one click away', async () => {
    const user = userEvent.setup();
    const router = setup(['/pull-room']);
    const row = screen.getByTestId('pull-timeline-owner/a-1');
    // The repository leads its section now, so the row itself is just `#n`.
    expect(row).toHaveTextContent('#1');
    expect(screen.getByTestId('pull-repo-owner/a')).toHaveTextContent('owner/a');
    expect(row).toHaveTextContent('Change in owner/a');
    expect(screen.getByTestId('pull-room-sentence')).toHaveTextContent(
      '2 open · 0 waiting on checks · 0 stopped by a failing check'
    );
    expect(screen.queryByTestId('pull-card-owner/a-1')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Board' }));
    expect(router.state.location.search).toBe('?view=board');
    expect(screen.getByTestId('pull-card-owner/a-1')).toBeInTheDocument();
    expect(screen.queryByTestId('pull-timeline')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(router.state.location.search).toBe('');
  });

  it('filters by family from a pill, keeps the choice in the URL, and clears it', async () => {
    const user = userEvent.setup();
    const router = setup(['/pull-room']);
    const pills = screen.getByTestId('pull-room-families');
    expect(pills).toHaveTextContent('All 2');
    expect(pills).toHaveTextContent('fam 1');
    // A repo the forge gives no family falls under "other", listed last.
    expect(pills).toHaveTextContent('other 1');

    await user.click(screen.getByRole('button', { name: /^fam/ }));
    expect(router.state.location.search).toBe('?family=fam');
    expect(screen.getByRole('button', { name: /^fam/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('pull-timeline-owner/a-1')).toBeInTheDocument();
    expect(screen.queryByTestId('pull-timeline-owner/b-1')).not.toBeInTheDocument();

    // The back button undoes a pill: a pill is a navigation, not a replace.
    await act(async () => { await router.navigate(-1); });
    expect(screen.getByTestId('pull-timeline-owner/b-1')).toBeInTheDocument();

    await act(async () => { await router.navigate('/pull-room?family=other'); });
    expect(screen.getByTestId('pull-timeline-owner/b-1')).toBeInTheDocument();
    expect(screen.queryByTestId('pull-timeline-owner/a-1')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^All/ }));
    expect(router.state.location.search).toBe('');
  });

  it('says so when a family has nothing open, with the way back', async () => {
    const user = userEvent.setup();
    const router = setup(['/pull-room?family=nobody']);
    expect(screen.getByTestId('pull-room-empty')).toHaveTextContent('No open pull requests.');
    await user.click(screen.getByRole('button', { name: 'Show every family' }));
    expect(router.state.location.search).toBe('');
    expect(screen.getByTestId('pull-timeline-owner/a-1')).toBeInTheDocument();
  });
});
