// graphHelpers.ts - pure geometry/label helpers for the operator graph views.

import type { GraphEdge } from '../../api/types';
import type { OperatorGraphNode } from '../intelligenceGraphModel';

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

export function compactLabel(label: string): string {
  const tail = label.split('/').at(-1) ?? label;
  return tail.length > 18 ? `${tail.slice(0, 15)}...` : tail;
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
