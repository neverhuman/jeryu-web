import type { BuildPlacement, CandidateBuild } from '../../api/types/delivery';
/** Production boundaries come from deployment history, never tag spelling or
 * adjacent build numbers. During a rollout more than one target may differ. */
export function candidateWindow(builds: readonly CandidateBuild[], placements: readonly BuildPlacement[], deliverable: string, older: boolean) {
  const sorted = [...new Map(builds.map(build => [build.id, build])).values()].sort((a, b) => Date.parse(b.built_at) - Date.parse(a.built_at) || a.id.localeCompare(b.id));
  const production = placements.filter(p => p.production && p.deliverable === deliverable);
  const current = new Set(production.flatMap(p => p.current ? [p.current] : []));
  const previous = new Set(production.flatMap(p => p.previous ? [p.previous] : []));
  const anchors = new Set([...current, ...previous]);
  const boundaryLoaded = production.length > 0 && production.every(p => !!p.current && !!p.previous) && [...anchors].every(id => sorted.some(build => build.id === id));
  const last = Math.max(-1, ...sorted.map((build, index) => anchors.has(build.id) ? index : -1));
  const rows = !older && boundaryLoaded ? sorted.slice(0, last + 1) : sorted;
  return { rows, current, previous, boundaryLoaded, hidden: sorted.length - rows.length };
}
export function runningTargets(build: CandidateBuild, placements: readonly BuildPlacement[]) {
  return placements.filter(p => p.deliverable === build.deliverable && p.current === build.id);
}
