// workPaths.ts — where Work lives. One page: add work, who is working, the queue.

export const WORK_PATH = '/work';
/** In-page anchors: the composer and the workers strip. */
export const WORK_ADD_ID = 'add';
export const WORK_WORKERS_ID = 'workers';

/** Work, filtered to a family, with the given todos opened and highlighted. */
export function queueHref(family: string, ids: string[] = []): string {
  const qs = new URLSearchParams();
  if (family) qs.set('family', family);
  if (ids.length > 0) qs.set('todo', ids.join(','));
  const query = qs.toString();
  return query ? `${WORK_PATH}?${query}` : WORK_PATH;
}
