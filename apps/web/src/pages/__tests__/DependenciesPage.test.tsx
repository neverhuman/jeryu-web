// DependenciesPage.test.tsx - render smoke for the dependency graph view.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { DEPENDENCIES_PATH, DependenciesPage } from '../DependenciesPage';
import { DEPENDENCY_GRAPH_QUERY_KEY } from '../../hooks/useDependencyGraph';
import type { RepoGraphResponse } from '../../api/types';

/** The page on a router that can be read back and re-entered from a URL. */
function openDependencies(
  graph: RepoGraphResponse,
  path: string
): ReturnType<typeof createMemoryRouter> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(DEPENDENCY_GRAPH_QUERY_KEY, graph);
  const router = createMemoryRouter(
    [{ path: DEPENDENCIES_PATH, element: <DependenciesPage /> }],
    { initialEntries: [path] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
}

function renderDependencies(graph: RepoGraphResponse): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(DEPENDENCY_GRAPH_QUERY_KEY, graph);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DependenciesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DependenciesPage', () => {
  it('shows the graph in dependency mode, coloured by pin staleness', () => {
    renderDependencies(sampleGraph());

    expect(screen.getByTestId('dependencies-page')).toBeInTheDocument();
    expect(screen.getByTestId('operator-graph-console')).toHaveAttribute(
      'data-mode',
      'dependencies'
    );
    expect(screen.getByTestId('dependencies-current-pins')).toHaveTextContent(
      '1 current pins'
    );
    expect(screen.getByLabelText('Pin staleness legend')).toBeInTheDocument();
    expect(screen.getByText('4 commits behind')).toBeInTheDocument();
    // Depth replaces the cluster count: this view has no clusters.
    expect(screen.getByTestId('node-inspector')).toHaveTextContent('Depth');
    expect(screen.queryByText('Clusters')).toBeNull();
  });

  // The URL contract (README §6): the graph filters and the picked node are
  // in the query string, so the graph on screen round-trips through a link.
  it('round-trips the graph filters and the picked node through the URL', async () => {
    const user = userEvent.setup();
    const router = openDependencies(sampleGraph(), DEPENDENCIES_PATH);

    await user.type(screen.getByLabelText('Search graph'), 'core');
    await user.click(screen.getByTestId('graph-node-repo:jeryu/core'));
    const search = router.state.location.search;
    expect(Object.fromEntries(new URLSearchParams(search))).toEqual({
      q: 'core',
      node: 'repo:jeryu/core',
    });
    // Typing replaced and picking a node pushed, so Back un-picks the node
    // and leaves the search box as it was.
    await act(async () => { await router.navigate(-1); });
    const back = new URLSearchParams(router.state.location.search);
    expect(back.get('node')).toBeNull();
    expect(back.get('q')).toBe('core');

    cleanup();
    openDependencies(sampleGraph(), `${DEPENDENCIES_PATH}${search}`);
    expect(screen.getByLabelText('Search graph')).toHaveValue('core');
    expect(screen.getByTestId('node-inspector')).toHaveTextContent('jeryu/core');
    expect(screen.getByTestId('graph-node-repo:jeryu/core')).toBeInTheDocument();
  });

  it('keeps a kind toggle in the URL', async () => {
    const user = userEvent.setup();
    const router = openDependencies(sampleGraph(), DEPENDENCIES_PATH);
    await user.click(screen.getByRole('checkbox', { name: 'repo' }));
    expect(new URLSearchParams(router.state.location.search).get('kind')).toBe('repo');

    cleanup();
    openDependencies(sampleGraph(), `${DEPENDENCIES_PATH}?kind=repo`);
    expect(screen.getByRole('checkbox', { name: 'repo' })).toBeChecked();
  });
});

function sampleGraph(): RepoGraphResponse {
  return {
    schemaVersion: 'jeryu.repo_graph/v2',
    generatedAt: '2026-09-19T00:00:00Z',
    nodes: ['jeryu/web', 'jeryu/deploy', 'jeryu/core'].map((name) => ({
      id: `repo:${name}`,
      label: name,
      kind: 'repo',
      state: 'fresh' as const,
      weight: 2,
      metadata: {},
    })),
    edges: [
      {
        source: 'repo:jeryu/web',
        target: 'repo:jeryu/deploy',
        kind: 'depends_on',
        state: 'fresh',
        weight: 1,
        metadata: { pinState: 'current', behind: '0' },
      },
      {
        source: 'repo:jeryu/deploy',
        target: 'repo:jeryu/core',
        kind: 'depends_on',
        state: 'fresh',
        weight: 1,
        metadata: { pinState: 'behind', behind: '4' },
      },
    ],
    clusters: [],
    insights: [],
  };
}
