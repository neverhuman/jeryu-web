// DependenciesPage.tsx - the operator graph laid out by dependency depth.
//
// The graph is repositories, so the family scope narrows it: a node whose
// repository another family owns is left out, and the count of what was left
// out is said under the heading. `GET /control-plane/repo-graph` takes no
// family, so the narrowing is done here from the repo→family map the shell
// already has (see components/family/repoFamilyScope).

import { useMemo } from 'react';

import { PageHeader, queryFreshness } from '../components/pageHeader';
import { ErrorState, LoadingState } from '../components/state';
import { useDependencyGraph } from '../hooks/useDependencyGraph';
import { buildDependencyGraph } from './intelligenceGraphModel';
import {
  edgePinFreshness,
  OperatorGraphConsole,
  useGraphViewState,
} from './intelligence';
import { usePageTitle } from '../hooks/usePageTitle';
import { OtherFamilies } from '../components/family/OtherFamilies';
import { useRepoFamilyScope } from '../components/family/useRepoFamilyScope';

import './page.css';
import './IntelligencePage.css';

/** Where Dependencies lives; the Intelligence page links to it. */
export const DEPENDENCIES_PATH = '/intelligence/dependencies';

export function DependenciesPage(): JSX.Element {
  usePageTitle('Dependencies');
  const query = useDependencyGraph();
  // Filters, the search box and the picked node are in the URL: the graph a
  // person is looking at is a link, and Back undoes the node before it.
  const { filters, selectedNodeId, setFilters, selectNode } = useGraphViewState();
  // One family in scope keeps that family's repositories; a node the map
  // cannot place stays, so the graph does not empty out while the list loads.
  const scope = useRepoFamilyScope();
  const scoped = useMemo(() => {
    const response = query.data ?? null;
    if (!response || !scope.active) return { response, elsewhere: 0 };
    const kept = scope.rowsByRepo(response.nodes, (node) => node.label);
    const ids = new Set(kept.rows.map((node) => node.id));
    return {
      response: {
        ...response,
        nodes: kept.rows,
        edges: response.edges.filter(
          (edge) => ids.has(edge.source) && ids.has(edge.target)
        ),
      },
      elsewhere: kept.elsewhere,
    };
  }, [query.data, scope]);
  const graph = useMemo(
    () => buildDependencyGraph(scoped.response, filters, selectedNodeId),
    [filters, scoped.response, selectedNodeId]
  );

  const current = graph.edges.filter(
    (edge) => edgePinFreshness(edge) === 'current'
  ).length;

  return (
    <div className="page intelligence" data-testid="dependencies-page">
      <PageHeader
        title="Dependencies"
        className="intelligence__header"
        testId="dependencies-header"
        freshness={queryFreshness(query)}
        subtitle="Every repository by how deep it sits in the dependency chain, with each edge coloured by the pin behind it: where a re-pin wave has landed and where it has not."
      />

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
        <OtherFamilies count={scoped.elsewhere} noun="repositories" />
        {query.isLoading ? (
          <LoadingState variant="message" title="Loading the dependency graph." />
        ) : query.isError ? (
          <ErrorState
            title="Could not load the dependency graph."
            error={query.error}
            onRetry={() => void query.refetch()}
            testId="dependencies-unavailable"
          />
        ) : (
          <OperatorGraphConsole
            graph={graph}
            filters={filters}
            onFiltersChange={setFilters}
            onSelectNode={selectNode}
            mode="dependencies"
          />
        )}
      </section>
    </div>
  );
}
