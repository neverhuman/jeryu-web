// DependenciesPage.test.tsx - render smoke for the dependency graph view.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { DependenciesPage } from '../DependenciesPage';
import { DEPENDENCY_GRAPH_QUERY_KEY } from '../../hooks/useDependencyGraph';
import type { RepoGraphResponse } from '../../api/types';

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
