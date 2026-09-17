import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PullRoomPage } from './PullRoomPage';

vi.mock('../hooks/useControlPlane', () => ({ useControlPlane: () => ({
  isLoading: false, isError: false,
  data: {
    pullRequests: ['owner/a', 'owner/b'].map((repo) => ({
      repo, number: 1, title: `Change in ${repo}`, draft: false, state: 'open',
      headRef: 'feature', headSha: 'abc12345', baseRef: 'main', baseSha: 'def12345',
      mergeable: true, mergeableState: 'clean', changedFiles: [], stateEvidence: 'fresh',
      checks: { total: 1, queued: 0, running: 0, failing: 0, successful: 1, missing: false },
    })),
    summary: { openPrCount: 2, missingCheckPrCount: 0, failingCheckCount: 0 },
    toolBuild: { clusterCount: 0, topClusters: [] },
  },
}) }));
vi.mock('../hooks/useToolingEvidence', () => ({
  useToolBuildClusters: () => ({ data: { clusters: [] } }),
  useEcosystem: () => ({ data: { tools: [] } }),
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
  for (const name of ['owner/a', 'owner/b']) {
    const card = screen.queryByTestId(`pull-card-${name}-1`);
    if (repo === 'all' || name === repo) expect(card).toBeInTheDocument();
    else expect(card).not.toBeInTheDocument();
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
});
