// The family-wide attention summary used by Work and Activity. These links
// open Blocked; the personal Needs you view and badges filter by viewer.

import { useMemo } from 'react';

import { useAttention } from '../../hooks/usePipeline';
import { useRepositories } from '../../hooks/useRepositories';
import {
  attentionTodoIds,
  blockedHref,
  filterByFamily,
  repoFamilyMap,
  summaryFamilyCounts,
  urgentAttention,
  urgentInArea,
  type AttentionArea,
} from './needsYouModel';

export interface NeedsYouSummary {
  /** Rows Needs you shows in red for this family; null until they are known. */
  count: number | null;
  /** Where to send the operator, on the same family. */
  href: string;
}

/**
 * `family` is '' for every family. `area` keeps only the rows whose cause lives
 * on the calling page, so a page says what on *it* waits rather than repeating
 * the whole pipeline's count. Shares the polled attention query.
 */
export function useNeedsYou(family = '', area?: AttentionArea): NeedsYouSummary {
  const attention = useAttention();
  const repositories = useRepositories({});
  const families = useMemo(
    () => repoFamilyMap(repositories.data?.repositories ?? []),
    [repositories.data]
  );
  const count = useMemo(() => {
    if (!attention.data) return null;
    // The whole pipeline's count is the server's, row for row with Needs you;
    // a page's own area is counted from the items in hand.
    if (!area) {
      const summary = summaryFamilyCounts(attention.data);
      if (summary) {
        return family
          ? (summary.find((entry) => entry.family === family)?.count ?? 0)
          : summary.reduce((sum, entry) => sum + entry.count, 0);
      }
    }
    return filterByFamily(
      area ? urgentInArea(attention.data, area) : urgentAttention(attention.data),
      family,
      families
    ).length;
  }, [attention.data, area, family, families]);
  return { count, href: blockedHref(family) };
}

/**
 * The todos a person is the next step for, by id, for rows that are not
 * attention rows themselves (the In flight ghosts). Shares the polled query.
 */
export function useAttentionTodoIds(): ReadonlySet<string> {
  const attention = useAttention();
  return useMemo(() => attentionTodoIds(attention.data), [attention.data]);
}
