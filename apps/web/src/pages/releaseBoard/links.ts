// links.ts — the URLs that tie the release board to the Runners page.
//
// A family's board lives at `/releases/family/<family>` and each lane on it
// has the anchor `#lane-<laneId>`, so "where is this runner's release" is one
// link. The other way, a stage target that names its runners links to
// `/runners?runners=<id,id>`, which highlights those rows. `/releases?family=`
// is the older spelling of the board's address and redirects to the path.
// Everything here is pure, so it is unit-tested without a router.

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
