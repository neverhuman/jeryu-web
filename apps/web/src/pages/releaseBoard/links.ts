// links.ts — the URLs that tie the release board to the Runners and Work pages.
//
// A family's board lives at `/releases/family/<family>` and each lane on it
// has the anchor `#lane-<laneId>`, so "where is this runner's release" is one
// link. The other way, a stage target that names its runners links to
// `/runners?runners=<id,id>`, which highlights those rows. `/releases?family=`
// is the older spelling of the board's address and redirects to the path.
// A target run by an external worker pool has no runner id: its slots report
// to the shift heartbeat as a family and a host, so it links the other way, to
// the workers panel on `/work?family=&host=#workers`.
// Everything here is pure, so it is unit-tested without a router.

import type { BoardTargetSlot } from '../../api/types/releaseBoard';
import { workersHref } from '../shift/workPaths';

export const RELEASES_PATH = '/releases';

/** The query parameter /runners reads to highlight rows. */
export const RUNNERS_PARAM = 'runners';

/** The per-repository view's marker: `?view=repositories` keeps `?family=` in the query. */
const REPOSITORY_VIEW = 'repositories';

/** `/releases/family/<family>`: the canonical address of one family's board. */
export function releaseFamilyPath(family: string): string {
  return `${RELEASES_PATH}/family/${encodeURIComponent(family)}`;
}

/** The DOM id of a lane on the board. */
export function laneAnchorId(laneId: string): string {
  return `lane-${laneId}`;
}

/** One lane of one family's board. */
export function releaseLaneHref(family: string, laneId: string): string {
  return `${releaseFamilyPath(family)}#${laneAnchorId(laneId)}`;
}

/** The lane a `#lane-<id>` hash names, or null for any other hash. */
export function laneFromHash(hash: string): string | null {
  const match = /^#lane-(.+)$/.exec(hash);
  if (!match?.[1]) return null;
  return decodeURIComponent(match[1]);
}

/** `/runners?runners=a,b`: the Runners page with these rows highlighted. */
export function runnersHref(runnerIds: readonly string[]): string {
  return `/runners?${RUNNERS_PARAM}=${encodeURIComponent(runnerIds.join(','))}`;
}

/** "1 runner", "3 runners". */
export function runnerCountLabel(count: number): string {
  return count === 1 ? '1 runner' : `${count} runners`;
}

/**
 * `/work?family=acme&host=node-a,node-b#workers`: the workers panel showing
 * the slots that run a target. The family is only part of the address when
 * every slot reports under the same one — across families the hosts are the
 * narrowest honest filter.
 */
export function slotsHref(slots: readonly BoardTargetSlot[]): string {
  const families = [...new Set(slots.map((slot) => slot.family).filter(Boolean))];
  const hosts = [...new Set(slots.map((slot) => slot.host).filter(Boolean))];
  return workersHref(families.length === 1 ? (families[0] ?? '') : '', hosts);
}

/** "1 worker", "3 workers": one per `{family, host}` the target names. */
export function slotCountLabel(count: number): string {
  return count === 1 ? '1 worker' : `${count} workers`;
}

/** `acme · node-a`, one slot per line: the link's hover text. */
export function slotsTitle(slots: readonly BoardTargetSlot[]): string {
  return slots.map((slot) => `${slot.family} · ${slot.host}`).join('\n');
}

/**
 * Where an old-style board address should go: `/releases?family=x` (the board
 * view, not `?view=repositories` or `?repo=`) becomes `/releases/family/x`
 * with every other parameter and the hash kept. Null when the address is
 * already canonical or is the per-repository view.
 */
export function canonicalBoardRedirect(
  search: string,
  hash: string
): { pathname: string; search: string; hash: string } | null {
  const params = new URLSearchParams(search);
  const family = params.get('family');
  if (!family) return null;
  if (params.has('repo') || params.get('view') === REPOSITORY_VIEW) return null;
  params.delete('family');
  const rest = params.toString();
  return {
    pathname: releaseFamilyPath(family),
    search: rest ? `?${rest}` : '',
    hash,
  };
}
