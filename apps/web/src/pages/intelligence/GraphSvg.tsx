// GraphSvg.tsx - SVG rendering of the operator graph and its node marks.

import type { GraphEdge } from '../../api/types';
import {
  GRAPH_STATE_ORDER,
  type OperatorGraph,
  type OperatorGraphNode,
} from '../intelligenceGraphModel';

import {
  compactLabel,
  diamondPoints,
  edgePinFreshness,
  hexPoints,
  nodeRadius,
  pinFreshnessClass,
  PIN_FRESHNESS_ORDER,
} from './graphHelpers';

/** How edges are coloured: by evidence state, or by the pin behind them. */
export type EdgeTone = 'state' | 'pin';

function edgeClass(edge: GraphEdge, tone: EdgeTone): string {
  return tone === 'pin'
    ? pinFreshnessClass(edgePinFreshness(edge))
    : `is-${edge.state}`;
}

export function GraphSvg({
  graph,
  onSelectNode,
  edgeTone = 'state',
}: {
  graph: OperatorGraph;
  onSelectNode: (id: string) => void;
  edgeTone?: EdgeTone;
}): JSX.Element {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  if (graph.nodes.length === 0) {
    return (
      <div className="intelligence__graph-empty" data-testid="repo-graph-preview">
        No graph nodes available.
      </div>
    );
  }
  return (
    <div className="intelligence__graph-preview" data-testid="repo-graph-preview">
      <svg
        viewBox={`0 0 ${graph.layout.width} ${graph.layout.height}`}
        role="img"
        aria-label="Operator graph"
      >
        <rect
          x="16"
          y="16"
          width={graph.layout.width - 32}
          height={graph.layout.height - 32}
          rx="8"
          className="intelligence__graph-ring"
        />
        {graph.layout.columns.map((column) => (
          <text
            key={column.label}
            x={column.x - 14}
            y="44"
            className="intelligence__graph-column"
          >
            {column.label}
          </text>
        ))}
        {graph.edges.map((edge) => {
          const source = nodesById.get(edge.source);
          const target = nodesById.get(edge.target);
          if (!source || !target) return;
          return (
            <line
              key={`${edge.source}-${edge.target}-${edge.kind}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              className={`intelligence__graph-edge ${edgeClass(edge, edgeTone)}`}
              strokeWidth={Math.min(5, Math.max(1, edge.weight))}
            />
          );
        })}
        {graph.nodes.map((node) => (
          <GraphNodeMark
            key={node.id}
            node={node}
            selected={graph.selected?.node.id === node.id}
            onSelect={onSelectNode}
          />
        ))}
      </svg>
      {edgeTone === 'pin' ? (
        <div className="intelligence__legend" aria-label="Pin staleness legend">
          {PIN_FRESHNESS_ORDER.map((freshness) => (
            <span
              key={freshness}
              className={`intelligence__legend-item ${pinFreshnessClass(freshness)}`}
            >
              {freshness}
            </span>
          ))}
        </div>
      ) : (
        <div className="intelligence__legend" aria-label="Graph state legend">
          {GRAPH_STATE_ORDER.map((state) => (
            <span key={state} className={`intelligence__legend-item is-${state}`}>
              {state}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function GraphNodeMark({
  node,
  selected,
  onSelect,
}: {
  node: OperatorGraphNode;
  selected: boolean;
  onSelect: (id: string) => void;
}): JSX.Element {
  const common = `intelligence__graph-node ${node.colorClass} ${selected ? 'is-selected' : ''}`;
  const label = compactLabel(node.label);
  // Every mark keeps its full name in a tooltip: the drawn label is truncated
  // to its column's width so two labels can never sit on top of each other.
  return (
    <g
      role="button"
      tabIndex={0}
      onClick={() => onSelect(node.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect(node.id);
      }}
      data-testid={`graph-node-${node.id}`}
    >
      <title>{`${node.kind}: ${node.label}`}</title>
      {node.shape === 'circle' ? (
        <circle cx={node.x} cy={node.y} r={nodeRadius(node)} className={common} />
      ) : node.shape === 'diamond' ? (
        <polygon points={diamondPoints(node.x, node.y, nodeRadius(node))} className={common} />
      ) : node.shape === 'hex' ? (
        <polygon points={hexPoints(node.x, node.y, nodeRadius(node) + 3)} className={common} />
      ) : (
        <rect
          x={node.x - nodeRadius(node)}
          y={node.y - nodeRadius(node)}
          width={nodeRadius(node) * 2}
          height={nodeRadius(node) * 2}
          rx="3"
          className={common}
        />
      )}
      <text x={node.x + 14} y={node.y + 4} className="intelligence__graph-label">
        {label}
      </text>
    </g>
  );
}
