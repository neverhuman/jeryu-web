// DependenciesPage.tsx - the operator graph laid out by dependency depth.

import { useMemo, useState } from 'react';

import { useDependencyGraph } from '../hooks/useDependencyGraph';
import {
  buildDependencyGraph,
  type GraphFilters,
} from './intelligenceGraphModel';
import { edgePinFreshness, OperatorGraphConsole } from './intelligence';
import { usePageTitle } from '../hooks/usePageTitle';

import './page.css';
import './IntelligencePage.css';

/** Where Dependencies lives; the Intelligence page links to it. */
export const DEPENDENCIES_PATH = '/intelligence/dependencies';

export function DependenciesPage(): JSX.Element {
  usePageTitle('Dependencies');
  const query = useDependencyGraph();
  const [filters, setFilters] = useState<GraphFilters>({
    kinds: [],
    states: [],
    query: '',
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const graph = useMemo(
    () => buildDependencyGraph(query.data ?? null, filters, selectedNodeId),
    [filters, query.data, selectedNodeId]
  );

  const current = graph.edges.filter(
    (edge) => edgePinFreshness(edge) === 'current'
  ).length;

  return (
    <div className="page intelligence" data-testid="dependencies-page">
      <header className="page__header intelligence__header">
        <div className="intelligence__title-line">
          <h1 className="page__title">Dependencies</h1>
        </div>
        <p className="page__roadmap-note intelligence__header-note">
          Every repository by how deep it sits in the dependency chain, with
          each edge coloured by the pin behind it: where a re-pin wave has
          landed and where it has not.
        </p>
      </header>

      <section className="page__section" aria-labelledby="dependencies-graph">
        <div className="intelligence__section-head">
          <h2 className="page__section-title" id="dependencies-graph">
            Dependency graph
          </h2>
          <span className="page__pill">{graph.nodes.length} repos</span>
          <span className="page__pill">{graph.edges.length} dependencies</span>
          <span className="page__pill" data-testid="dependencies-current-pins">
            {current} current pins
          </span>
        </div>
        {query.isLoading ? (
          <p className="page__roadmap-note">Loading the dependency graph.</p>
        ) : query.isError ? (
          <p className="page__roadmap-note" data-testid="dependencies-unavailable">
            {query.error.message}
          </p>
        ) : (
          <OperatorGraphConsole
            graph={graph}
            filters={filters}
            onFiltersChange={setFilters}
            onSelectNode={setSelectedNodeId}
            mode="dependencies"
          />
        )}
      </section>
    </div>
  );
}
