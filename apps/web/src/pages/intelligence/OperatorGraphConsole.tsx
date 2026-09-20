// OperatorGraphConsole.tsx - interactive dependency graph console with filters.

import type { EvidenceState } from '../../api/types';
import {
  GRAPH_STATE_ORDER,
  type GraphFilters,
  type GraphMode,
  type OperatorGraph,
} from '../intelligenceGraphModel';

import { ClusterChips, EdgeList } from './GraphLists';
import { GraphSvg } from './GraphSvg';
import { NodeInspector } from './NodeInspector';
import { toggle } from './graphHelpers';

export function OperatorGraphConsole({
  graph,
  filters,
  onFiltersChange,
  onSelectNode,
  mode = 'clusters',
}: {
  graph: OperatorGraph;
  filters: GraphFilters;
  onFiltersChange: (filters: GraphFilters) => void;
  onSelectNode: (id: string) => void;
  /**
   * `clusters`: every kind of node, grouped by kind, edges coloured by
   * evidence state. `dependencies`: repos by dependency depth, edges coloured
   * by how stale the pin behind them is.
   */
  mode?: GraphMode;
}): JSX.Element {
  const dependencies = mode === 'dependencies';
  return (
    <div
      className="intelligence__operator"
      data-testid="operator-graph-console"
      data-mode={mode}
    >
      <div className="intelligence__graph-controls">
        <GraphToggles
          title="Kinds"
          options={graph.kindOptions}
          selected={filters.kinds}
          onToggle={(value) =>
            onFiltersChange({ ...filters, kinds: toggle(filters.kinds, value) })
          }
        />
        <GraphToggles
          title="States"
          options={GRAPH_STATE_ORDER}
          selected={filters.states}
          onToggle={(value) =>
            onFiltersChange({
              ...filters,
              states: toggle(filters.states, value as EvidenceState),
            })
          }
        />
        <label className="intelligence__graph-search">
          Search
          <input
            type="search"
            value={filters.query}
            onChange={(event) =>
              onFiltersChange({ ...filters, query: event.target.value })
            }
            aria-label="Search graph"
          />
        </label>
      </div>
      <div className="intelligence__graph-console">
        <GraphSvg
          graph={graph}
          onSelectNode={onSelectNode}
          edgeTone={dependencies ? 'pin' : 'state'}
        />
        <NodeInspector graph={graph} />
      </div>
      <div className="intelligence__graph-bottom">
        <EdgeList edges={graph.edges} showPins={dependencies} />
        {dependencies ? null : <ClusterChips graph={graph} />}
      </div>
    </div>
  );
}

function GraphToggles({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}): JSX.Element {
  return (
    <fieldset className="intelligence__toggle-set">
      <legend>{title}</legend>
      <div>
        {options.map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => onToggle(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
