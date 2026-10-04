// graphHelpers.ts - pure geometry/label helpers for the operator graph views.

import type { GraphEdge, InsightSeverity } from '../../api/types';
import type { OperatorGraphNode } from '../intelligenceGraphModel';
import { formatCount } from '../../format/number';

/**
 * How far a `depends_on` edge is from the version its consumer could pin.
 * `current` is where a re-pin wave has already landed; `behind` is where it
 * has not; `diverged` is a pin that is not on the dependency's main.
 */
export type PinFreshness = 'current' | 'behind' | 'diverged' | 'unknown';

export const PIN_FRESHNESS_ORDER: PinFreshness[] = [
  'current',
  'behind',
  'diverged',
  'unknown',
];

export function nodeRadius(node: OperatorGraphNode): number {
  return Math.min(12, Math.max(5, 5 + node.weight));
}

/** A node label sized to fit one graph column without meeting the next one. */
export function compactLabel(label: string): string {
  const tail = label.split('/').at(-1) ?? label;
  return tail.length > 22 ? `${tail.slice(0, 21)}…` : tail;
}

/** Node-id prefixes the graph mints itself; an operator reads past them. */
const NODE_ID_PREFIXES = [
  'repo',
  'pr',
  'check',
  'mirror',
  'runner',
  'tool',
  'tool-build',
  'codegraph',
];

/**
 * A node id as an operator can tell two of them apart: the minted prefix
 * dropped, and, when it is still too long, the *tail* kept — `get_manifest`
 * distinguishes where `tool:jeryu.get_…` does not.
 */
export function endpointLabel(id: string): string {
  const colon = id.indexOf(':');
  const rest =
    colon > 0 && NODE_ID_PREFIXES.includes(id.slice(0, colon))
      ? id.slice(colon + 1)
      : id;
  return rest.length > 24 ? `…${rest.slice(-23)}` : rest;
}

/** An edge kind as words: `tool_dependency` reads as "tool dependency". */
export function edgeKindLabel(kind: string): string {
  return kind.replace(/_/g, ' ');
}

/** A score with thousands separators, so 22017846 is legible at a glance. */
export function formatScore(score: number): string {
  return formatCount(Math.round(score));
}

/**
 * Tool-build severity as a band within the set on screen, not an absolute
 * threshold: scores are arbitrary magnitudes, so an absolute cut makes every
 * cluster the same severity, which says nothing. The worst cluster is `high`,
 * and the rest fall away from it.
 */
export function toolBuildSeverity(
  score: number,
  topScore: number
): InsightSeverity {
  if (topScore <= 0) return 'low';
  const share = score / topScore;
  if (share >= 0.66) return 'high';
  if (share >= 0.33) return 'medium';
  return 'low';
}

export function diamondPoints(x: number, y: number, r: number): string {
  return `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`;
}

export function hexPoints(x: number, y: number, r: number): string {
  const dx = r * 0.86;
  const half = r / 2;
  return [
    `${x - dx},${y - half}`,
    `${x},${y - r}`,
    `${x + dx},${y - half}`,
    `${x + dx},${y + half}`,
    `${x},${y + r}`,
    `${x - dx},${y + half}`,
  ].join(' ');
}

export function toggle<T extends string>(items: T[], value: T): T[] {
  return items.includes(value)
    ? items.filter((item) => item !== value)
    : [...items, value];
}

/**
 * The server states the pin comparison (`pinState`); when it only counts the
 * commits a pin does not reach (`behind`), the count decides. Anything else is
 * `unknown` - a colour is never invented for a pin nobody compared.
 */
export function edgePinFreshness(edge: GraphEdge): PinFreshness {
  const metadata = edge.metadata ?? {};
  const state = metadata.pinState ?? '';
  if (state === 'current') return 'current';
  if (state === 'behind' || state === 'behind_not_green') return 'behind';
  if (state === 'diverged') return 'diverged';
  if (state === '') {
    const behind = Number(metadata.behind);
    if (metadata.behind !== undefined && Number.isFinite(behind)) {
      return behind > 0 ? 'behind' : 'current';
    }
  }
  return 'unknown';
}

export function pinFreshnessClass(freshness: PinFreshness): string {
  return `is-pin-${freshness}`;
}

/** One plain phrase for an edge: what its pin is doing. */
export function pinFreshnessLabel(edge: GraphEdge): string {
  const freshness = edgePinFreshness(edge);
  const behind = Number(edge.metadata?.behind);
  if (freshness === 'behind' && Number.isFinite(behind) && behind > 0) {
    return `${behind} commit${behind === 1 ? '' : 's'} behind`;
  }
  if (freshness === 'diverged') return 'pin is not on main';
  if (freshness === 'unknown') return 'pin not compared';
  return 'pin is current';
}
