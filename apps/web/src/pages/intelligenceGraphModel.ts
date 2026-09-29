import type {
  ControlPlaneSnapshot,
  EcosystemResponse,
  EvidenceState,
  GraphCluster,
  GraphEdge,
  GraphNode,
  RepoGraphResponse,
  ToolBuildCluster,
} from '../api/types';

import { toolBuildSeverity } from './intelligence/graphHelpers';

export type GraphShape = 'circle' | 'rect' | 'diamond' | 'hex';

/** Which view of the operator graph a console is showing. */
export type GraphMode = 'clusters' | 'dependencies';

export interface GraphFilters {
  kinds: string[];
  states: EvidenceState[];
  query: string;
}

export interface OperatorGraphNode extends GraphNode {
  shape: GraphShape;
  colorClass: string;
  x: number;
  y: number;
  /** Dependency mode only: how many `depends_on` hops reach this node. */
  depth?: number;
}

export interface SelectedNodeDetails {
  node: OperatorGraphNode;
  inbound: GraphEdge[];
  outbound: GraphEdge[];
  clusters: GraphCluster[];
  evidenceCount: number;
}

/** A named column of the laid-out graph, headed above the nodes it holds. */
export interface GraphColumn {
  label: string;
  x: number;
}

/**
 * The drawing box the layout needs. It grows with the graph instead of being
 * fixed, so nodes are never stacked on top of each other to fit.
 */
export interface GraphLayout {
  width: number;
  height: number;
  columns: GraphColumn[];
}

export interface OperatorGraph {
  nodes: OperatorGraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  layout: GraphLayout;
  selected: SelectedNodeDetails | null;
  kindOptions: string[];
  stateOptions: EvidenceState[];
}

export const GRAPH_STATE_ORDER: EvidenceState[] = [
  'fresh',
  'missing',
  'queued',
  'failed',
  'unknown',
];

const KIND_ORDER = [
  'repo',
  'pull_request',
  'check_run',
  'runner_capacity',
  'remote_mirror',
  'codegraph_freshness',
  'tool_build',
  'ecosystem_tool',
];

export function nodeShape(kind: string): GraphShape {
  if (kind === 'repo') return 'circle';
  if (kind === 'runner_capacity' || kind === 'remote_mirror') return 'diamond';
  if (kind === 'tool_build' || kind === 'codegraph_freshness') return 'hex';
  return 'rect';
}

export function nodeColorClass(state: EvidenceState): string {
  return `is-${state}`;
}

export function buildOperatorGraph(
  snapshot: ControlPlaneSnapshot,
  ecosystem: EcosystemResponse | null,
  toolClusters: ToolBuildCluster[],
  filters: GraphFilters,
  selectedId: string | null
): OperatorGraph {
  const baseNodes = [
    ...snapshot.repoGraph.nodes,
    ...ecosystemNodes(ecosystem),
    ...toolClusterNodes(toolClusters),
  ];
  const nodesById = new Map(baseNodes.map((node) => [node.id, node]));
  const baseEdges = [
    ...snapshot.repoGraph.edges,
    ...ecosystemEdges(ecosystem),
    ...toolClusterEdges(toolClusters, nodesById),
  ];
  const clusters = [
    ...snapshot.repoGraph.clusters,
    ...toolClusterGraphClusters(toolClusters),
  ];
  const filteredRaw = baseNodes.filter((node) => matchesFilters(node, filters));
  const visibleIds = new Set(filteredRaw.map((node) => node.id));
  const edges = baseEdges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)
  );
  const { nodes, layout } = layoutByKind(filteredRaw);
  const selectedNode =
    nodes.find((node) => node.id === selectedId) ?? nodes[0] ?? null;
  return {
    nodes,
    edges,
    clusters,
    layout,
    selected: selectedNode
      ? {
          node: selectedNode,
          inbound: baseEdges.filter((edge) => edge.target === selectedNode.id),
          outbound: baseEdges.filter((edge) => edge.source === selectedNode.id),
          clusters: clusters.filter((cluster) =>
            cluster.nodeIds.includes(selectedNode.id)
          ),
          evidenceCount: evidenceCount(selectedNode, clusters),
        }
      : null,
    kindOptions: sortedKinds(baseNodes),
    stateOptions: GRAPH_STATE_ORDER,
  };
}

/** The edge kind the dependency mode reads (`jeryu.repo_graph/v2`). */
export const DEPENDS_ON_KIND = 'depends_on';

/**
 * The dependency view of the same graph: only `depends_on` edges, and the
 * repos they connect, laid out left to right by how deep in the dependency
 * chain each repo sits. A repo nothing depends on is depth 0.
 */
export function buildDependencyGraph(
  response: RepoGraphResponse | null,
  filters: GraphFilters,
  selectedId: string | null
): OperatorGraph {
  const dependsOn = (response?.edges ?? []).filter(
    (edge) => edge.kind === DEPENDS_ON_KIND
  );
  const connected = new Set(
    dependsOn.flatMap((edge) => [edge.source, edge.target])
  );
  const baseNodes = (response?.nodes ?? []).filter((node) =>
    connected.has(node.id)
  );
  const depths = dependencyDepths(baseNodes, dependsOn);
  const filteredRaw = baseNodes.filter((node) => matchesFilters(node, filters));
  const visibleIds = new Set(filteredRaw.map((node) => node.id));
  const edges = dependsOn.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)
  );
  const { nodes, layout } = layoutByDepth(filteredRaw, depths);
  const selectedNode =
    nodes.find((node) => node.id === selectedId) ?? nodes[0] ?? null;
  return {
    nodes,
    edges,
    clusters: [],
    layout,
    selected: selectedNode
      ? {
          node: selectedNode,
          inbound: dependsOn.filter((edge) => edge.target === selectedNode.id),
          outbound: dependsOn.filter((edge) => edge.source === selectedNode.id),
          clusters: [],
          evidenceCount: evidenceCount(selectedNode, []),
        }
      : null,
    kindOptions: sortedKinds(baseNodes),
    stateOptions: GRAPH_STATE_ORDER,
  };
}

/**
 * Longest `depends_on` chain reaching each node. Repos that depend on each
 * other, directly or through a longer loop, sit at one depth together: a loop
 * has no deeper end, so following it round must not push either repo further
 * out. Everything else is one hop deeper than the deepest repo depending on it.
 */
export function dependencyDepths(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Map<string, number> {
  const known = new Set(nodes.map((node) => node.id));
  const inside = edges.filter(
    (edge) => known.has(edge.source) && known.has(edge.target)
  );
  const loop = mutualDependencies(nodes, inside);
  const incoming = new Map(nodes.map((node) => [loop.get(node.id) ?? '', 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of inside) {
    const source = loop.get(edge.source) ?? '';
    const target = loop.get(edge.target) ?? '';
    if (source === target) continue;
    outgoing.set(source, [...(outgoing.get(source) ?? []), target]);
    incoming.set(target, (incoming.get(target) ?? 0) + 1);
  }
  const loopDepths = new Map(Array.from(incoming.keys(), (id) => [id, 0]));
  const ready = Array.from(incoming.entries())
    .filter(([, count]) => count === 0)
    .map(([id]) => id);
  while (ready.length > 0) {
    const id = ready.pop() as string;
    for (const next of outgoing.get(id) ?? []) {
      const depth = (loopDepths.get(id) ?? 0) + 1;
      if ((loopDepths.get(next) ?? 0) < depth) loopDepths.set(next, depth);
      const left = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, left);
      if (left === 0) ready.push(next);
    }
  }
  return new Map(
    nodes.map((node) => [
      node.id,
      loopDepths.get(loop.get(node.id) ?? '') ?? 0,
    ])
  );
}

/**
 * Names, for each node, the group of nodes it depends on and is depended on by
 * in turn — its strongly connected component. A node in no loop is its own
 * group. Tarjan's algorithm, run iteratively so a deep chain cannot overflow
 * the call stack.
 */
function mutualDependencies(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Map<string, string> {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const group = new Map<string, string>();
  let counter = 0;

  for (const root of nodes) {
    if (index.has(root.id)) continue;
    const work: { id: string; next: number }[] = [{ id: root.id, next: 0 }];
    index.set(root.id, counter);
    low.set(root.id, counter);
    counter += 1;
    stack.push(root.id);
    onStack.add(root.id);
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const neighbours = outgoing.get(frame.id) ?? [];
      if (frame.next < neighbours.length) {
        const next = neighbours[frame.next];
        frame.next += 1;
        if (!index.has(next)) {
          index.set(next, counter);
          low.set(next, counter);
          counter += 1;
          stack.push(next);
          onStack.add(next);
          work.push({ id: next, next: 0 });
        } else if (onStack.has(next)) {
          low.set(frame.id, Math.min(low.get(frame.id) ?? 0, index.get(next) ?? 0));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) {
        low.set(
          parent.id,
          Math.min(low.get(parent.id) ?? 0, low.get(frame.id) ?? 0)
        );
      }
      if (low.get(frame.id) === index.get(frame.id)) {
        for (;;) {
          const member = stack.pop() as string;
          onStack.delete(member);
          group.set(member, frame.id);
          if (member === frame.id) break;
        }
      }
    }
  }
  return group;
}

/**
 * Column pitch and row height of a laid-out graph. A row is tall enough for a
 * node and its label, so no two labels can land on top of each other, and a
 * column is wide enough to hold a truncated label between its neighbours.
 */
const COLUMN_PITCH = 196;
const ROW_HEIGHT = 34;
const HEAD_ROOM = 74;

interface LaidOutGraph {
  nodes: OperatorGraphNode[];
  layout: GraphLayout;
}

/**
 * Places nodes in one column per group, in the order the groups are given,
 * and one row per node within its column. Nothing wraps: the box reports the
 * height its rows need, and the caller draws that box.
 */
function layoutColumns(
  nodes: GraphNode[],
  groups: string[],
  groupOf: (node: GraphNode) => string,
  extra: (node: GraphNode) => Partial<OperatorGraphNode> = () => ({})
): LaidOutGraph {
  const rows = new Map<string, number>();
  const placed = nodes.map((node) => {
    const group = groupOf(node);
    const column = Math.max(0, groups.indexOf(group));
    const row = rows.get(group) ?? 0;
    rows.set(group, row + 1);
    return {
      ...node,
      shape: nodeShape(node.kind),
      colorClass: nodeColorClass(node.state),
      ...extra(node),
      x: 46 + column * COLUMN_PITCH,
      y: HEAD_ROOM + row * ROW_HEIGHT,
    };
  });
  const deepest = Math.max(1, ...Array.from(rows.values(), (count) => count));
  return {
    nodes: placed,
    layout: {
      width: 32 + Math.max(1, groups.length) * COLUMN_PITCH,
      height: HEAD_ROOM + deepest * ROW_HEIGHT + 18,
      columns: groups.map((label, index) => ({
        label,
        x: 46 + index * COLUMN_PITCH,
      })),
    },
  };
}

function layoutByDepth(
  nodes: GraphNode[],
  depths: Map<string, number>
): LaidOutGraph {
  const depthOf = (node: GraphNode): string =>
    `depth ${depths.get(node.id) ?? 0}`;
  const groups = Array.from(new Set(nodes.map(depthOf))).sort(
    (a, b) => Number(a.slice(6)) - Number(b.slice(6))
  );
  return layoutColumns(nodes, groups, depthOf, (node) => ({
    depth: depths.get(node.id) ?? 0,
  }));
}

function matchesFilters(node: GraphNode, filters: GraphFilters): boolean {
  if (filters.kinds.length > 0 && !filters.kinds.includes(node.kind)) {
    return false;
  }
  if (filters.states.length > 0 && !filters.states.includes(node.state)) {
    return false;
  }
  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  return [node.id, node.label, node.kind, ...Object.values(node.metadata)]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

export function emptyGraph(snapshot: ControlPlaneSnapshot): boolean {
  return snapshot.repoGraph.nodes.length === 0;
}

/**
 * One column per kind of node actually on screen — an absent kind leaves no
 * empty column, so the kinds that are there spread across the whole box
 * instead of piling into two crowded ones.
 */
function layoutByKind(nodes: GraphNode[]): LaidOutGraph {
  return layoutColumns(nodes, sortedKinds(nodes), (node) => node.kind);
}

function kindLane(kind: string): number {
  const index = KIND_ORDER.indexOf(kind);
  return index >= 0 ? index : KIND_ORDER.length - 1;
}

function sortedKinds(nodes: GraphNode[]): string[] {
  return Array.from(new Set(nodes.map((node) => node.kind))).sort(
    (a, b) => kindLane(a) - kindLane(b) || a.localeCompare(b)
  );
}

function ecosystemNodes(ecosystem: EcosystemResponse | null): GraphNode[] {
  if (!ecosystem) return [];
  return ecosystem.tools.slice(0, 20).map((tool) => ({
    id: `tool:${tool.name}`,
    label: tool.name,
    kind: 'ecosystem_tool',
    state: ecosystem.live && !ecosystem.degradedReason ? 'fresh' : 'unknown',
    weight: tool.conformance === 'mutating' ? 2 : 1,
    metadata: {
      className: tool.className,
      conformance: tool.conformance,
      repo: tool.repo ?? '',
      queue: tool.queue ?? '',
    },
  }));
}

function ecosystemEdges(ecosystem: EcosystemResponse | null): GraphEdge[] {
  if (!ecosystem) return [];
  const available = new Set(ecosystem.tools.map((tool) => tool.name));
  return ecosystem.tools.flatMap((tool) =>
    tool.dependsOn
      .filter((dep) => available.has(dep))
      .map((dep) => ({
        source: `tool:${dep}`,
        target: `tool:${tool.name}`,
        kind: 'tool_dependency',
        state: ecosystem.live ? 'fresh' : 'unknown',
        weight: 1,
      }))
  );
}

function toolClusterNodes(clusters: ToolBuildCluster[]): GraphNode[] {
  return clusters
    .filter((cluster) => !cluster.ignored)
    .slice(0, 12)
    .map((cluster) => ({
      id: `tool-build:${cluster.cluster_id}`,
      label: toolClusterLabel(cluster),
      kind: 'tool_build',
      state: 'fresh',
      weight: Math.max(1, Math.min(8, cluster.occurrence_count)),
      metadata: {
        repo: cluster.repo_id,
        score: String(cluster.score),
        language: cluster.language,
        occurrences: String(cluster.occurrence_count),
        files: String(cluster.file_count),
      },
    }));
}

function toolClusterEdges(
  clusters: ToolBuildCluster[],
  nodesById: Map<string, GraphNode>
): GraphEdge[] {
  return clusters.flatMap((cluster) => {
    const repoId = `repo:${cluster.repo_id}`;
    if (!nodesById.has(repoId)) return [];
    return [
      {
        source: repoId,
        target: `tool-build:${cluster.cluster_id}`,
        kind: 'tool_build_opportunity',
        state: 'fresh' as EvidenceState,
        weight: Math.max(1, Math.min(5, cluster.occurrence_count)),
      },
    ];
  });
}

/**
 * What a tool-build cluster is, in the words an operator can act on: where the
 * repetition is, how much of it there is and in what language. The cluster id
 * is a fingerprint hash; it stays available as the node id, not as the name.
 */
export function toolClusterLabel(cluster: ToolBuildCluster): string {
  const copies = `${cluster.occurrence_count} cop${
    cluster.occurrence_count === 1 ? 'y' : 'ies'
  }`;
  return `${cluster.repo_id} · ${copies} · ${cluster.language}`;
}

function toolClusterGraphClusters(clusters: ToolBuildCluster[]): GraphCluster[] {
  const visible = clusters.filter((cluster) => !cluster.ignored).slice(0, 12);
  const topScore = Math.max(0, ...visible.map((cluster) => cluster.score));
  return visible.map((cluster) => ({
    id: `cluster:${cluster.cluster_id}`,
    label: `Tool-build · ${toolClusterLabel(cluster)}`,
    kind: 'tool_build',
    state: 'fresh',
    severity: toolBuildSeverity(cluster.score, topScore),
    nodeIds: [`tool-build:${cluster.cluster_id}`],
    insights: [cluster.insight],
  }));
}

function evidenceCount(node: GraphNode, clusters: GraphCluster[]): number {
  const metadataCount = Object.values(node.metadata).filter(Boolean).length;
  const clusterCount = clusters.filter((cluster) =>
    cluster.nodeIds.includes(node.id)
  ).length;
  return metadataCount + clusterCount;
}
