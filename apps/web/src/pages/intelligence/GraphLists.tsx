// GraphLists.tsx - edge list and cluster chips for the operator graph.

import type { GraphEdge } from '../../api/types';
import type { OperatorGraph } from '../intelligenceGraphModel';

import { edgeKindLabel, endpointLabel, pinFreshnessLabel } from './graphHelpers';
import { SeverityPill, StatePill } from './StateIndicators';

/** How many edges the list shows before it says how many it left out. */
const EDGE_LIMIT = 12;

export function EdgeList({
  edges,
  showPins = false,
}: {
  edges: GraphEdge[];
  /** Say what each pin is doing instead of the edge's evidence state. */
  showPins?: boolean;
}): JSX.Element {
  return (
    <section className="intelligence__edge-list">
      <h3>Edges</h3>
      {edges.length === 0 ? (
        <p>No visible edges.</p>
      ) : (
        <ol>
          {edges.slice(0, EDGE_LIMIT).map((edge) => (
            <li key={`${edge.source}-${edge.target}-${edge.kind}`}>
              <span>{edgeKindLabel(edge.kind)}</span>
              <code title={edge.source}>{endpointLabel(edge.source)}</code>
              <span>→</span>
              <code title={edge.target}>{endpointLabel(edge.target)}</code>
              {showPins ? (
                <span className="intelligence__pin-note">
                  {pinFreshnessLabel(edge)}
                </span>
              ) : (
                <StatePill state={edge.state} />
              )}
            </li>
          ))}
        </ol>
      )}
      {edges.length > EDGE_LIMIT ? (
        <p>
          Showing {EDGE_LIMIT} of {edges.length} edges. Narrow the graph with the
          filters above to see the rest.
        </p>
      ) : null}
    </section>
  );
}

export function ClusterChips({ graph }: { graph: OperatorGraph }): JSX.Element {
  return (
    <section className="intelligence__cluster-chips">
      <h3>Clusters</h3>
      {graph.clusters.length === 0 ? (
        <p>No graph clusters.</p>
      ) : (
        <div>
          {graph.clusters.slice(0, 16).map((cluster) => (
            <span
              key={cluster.id}
              className="intelligence__cluster-chip"
              title={cluster.insights.join(' ')}
            >
              {cluster.label}
              <SeverityPill severity={cluster.severity} />
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
