// workPaths.ts — where Work lives. One page: add work, who is working, the queue.

export const WORK_PATH = '/work';
/** In-page anchors: the composer and the workers strip. */
export const WORK_ADD_ID = 'add';
export const WORK_WORKERS_ID = 'workers';
/** The workers panel's own filter: a comma-separated list of hosts. */
export const WORK_HOST_PARAM = 'host';

/**
 * The workers panel, opened, narrowed to a family and a set of hosts — where
 * "3 workers" on the release board points. An empty family or host list leaves
 * that filter out.
 */
export function workersHref(family: string, hosts: readonly string[] = []): string {
  const qs = new URLSearchParams();
  if (family) qs.set('family', family);
  if (hosts.length > 0) qs.set(WORK_HOST_PARAM, hosts.join(','));
  const query = qs.toString();
  return `${WORK_PATH}${query ? `?${query}` : ''}#${WORK_WORKERS_ID}`;
}

/** Work, filtered to a family, with the given todos opened and highlighted. */
export function queueHref(family: string, ids: string[] = []): string {
  const qs = new URLSearchParams();
  if (family) qs.set('family', family);
  if (ids.length > 0) qs.set('todo', ids.join(','));
  const query = qs.toString();
  return query ? `${WORK_PATH}?${query}` : WORK_PATH;
}

/** One todo's own page. Ids are unique across families; `family` only narrows the lookup. */
export function todoHref(id: string, family = ''): string {
  const path = `${WORK_PATH}/${encodeURIComponent(id)}`;
  return family ? `${path}?${new URLSearchParams({ family }).toString()}` : path;
}

/**
 * Work, filtered to one repository's todos. Todos name repos bare
 * (`jeryu-web`), so an `owner/name` is reduced to its name.
 */
export function repoWorkHref(repo: string): string {
  const name = repo.split('/').pop() ?? repo;
  return `${WORK_PATH}?${new URLSearchParams({ repo: name }).toString()}`;
}
