import { repoFrontPath } from '../repoBrowserModel';
import type { LineageGraph } from '../../api/types/delivery';
/** Reserve the first rail for actual first-parent main history. All other
 * marks follow actual ancestry. A shared parent has one node, never a copy. */
export function graphLayout(graph: LineageGraph) {
  const bySha = new Map(graph.commits.map(commit => [commit.sha, commit]));
  const lane = new Map<string, number>();
  const walk = (sha: string, rail: number) => {
    const seen = new Set<string>();
    while (bySha.has(sha) && !lane.has(sha) && !seen.has(sha)) {
      seen.add(sha); lane.set(sha, rail); sha = bySha.get(sha)?.parents[0] ?? '';
    }
  };
  walk(graph.default_sha, 0);
  graph.branches.forEach((branch, index) => walk(branch.sha, index + 1));
  graph.commits.forEach(commit => { if (!lane.has(commit.sha)) walk(commit.sha, Math.max(1, lane.size % (graph.branches.length + 1))); });
  const rows = new Map(graph.commits.map((commit, index) => [commit.sha, index]));
  const edges = graph.commits.flatMap(commit => commit.parents.map(parent => ({ child: commit.sha, parent, from: rows.get(commit.sha) as number, to: rows.get(parent) ?? null, fromLane: lane.get(commit.sha) ?? 0, toLane: lane.get(parent) ?? lane.get(commit.sha) ?? 0 })));
  return { lane, edges, columns: Math.max(1, ...lane.values()) + 1 };
}
export function lineagePath(provider: string, owner: string, name: string, sha?: string): string {
  return `${repoFrontPath(provider, `${owner}/${name}`)}/lineage${sha ? `?commit=${encodeURIComponent(sha)}` : ''}`;
}
