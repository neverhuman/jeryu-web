// useNeedsYou.ts — one reading of "what needs a human" for the pages that are
// not Needs you. Work's red chip and Activity's human filter used to each
// decide for themselves which rows wait on a person, so the three could
// disagree; both now take the count from here and link to `/needs-you`, which
// is the answer the operator was promised.

import { useMemo } from 'react';

import { useAttention } from '../../hooks/usePipeline';
import { useRepositories } from '../../hooks/useRepositories';
import {
  attentionTodoIds,
  filterByFamily,
  needsYouHref,
  repoFamilyMap,
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
  const count = useMemo(
    () =>
      attention.data
        ? filterByFamily(
            area ? urgentInArea(attention.data, area) : urgentAttention(attention.data),
            family,
            families
          ).length
        : null,
    [attention.data, area, family, families]
  );
  return { count, href: needsYouHref(family) };
}

/**
 * The todos a person is the next step for, by id, for rows that are not
 * attention rows themselves (the In flight ghosts). Shares the polled query.
 */
export function useAttentionTodoIds(): ReadonlySet<string> {
  const attention = useAttention();
  return useMemo(() => attentionTodoIds(attention.data), [attention.data]);
}
