// useGraphViewState.ts — the operator graph console's view state in the URL,
// shared by Intelligence and Dependencies so both link the same way.
//
// Per the push/replace rule (README §6): the kind and state toggles and the
// search box are filters, so they replace; picking a node is a view switch —
// the inspector then shows that node — so it pushes and Back goes back to the
// node before it.

import { useMemo } from 'react';

import type { EvidenceState } from '../../api/types';
import { useViewState } from '../../hooks/useViewState';
import type { GraphFilters } from '../intelligenceGraphModel';

export interface GraphViewState {
  filters: GraphFilters;
  /** The node the inspector is on, or `null` for the graph's own first node. */
  selectedNodeId: string | null;
  setFilters: (filters: GraphFilters) => void;
  selectNode: (id: string) => void;
}

export function useGraphViewState(): GraphViewState {
  const view = useViewState();
  const filters = useMemo<GraphFilters>(
    () => ({
      kinds: view.readList('kind'),
      states: view.readList('state') as EvidenceState[],
      query: view.read('q'),
    }),
    [view]
  );
  return {
    filters,
    selectedNodeId: view.read('node') || null,
    setFilters: (next) =>
      view.write({ kind: next.kinds, state: next.states, q: next.query }, 'replace'),
    selectNode: (id) => view.write({ node: id }, 'push'),
  };
}
