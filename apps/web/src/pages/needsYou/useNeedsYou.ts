// useNeedsYou.ts — one reading of "what needs a human" for the pages that are
// not Needs you. Work's red chip and Activity's human filter used to each
// decide for themselves which rows wait on a person, so the three could
// disagree; both now take the count from here and link to `/needs-you`, which
// is the answer the operator was promised.

import { useMemo } from 'react';

import { useAttention } from '../../hooks/usePipeline';
import { useRepositories } from '../../hooks/useRepositories';
import { filterByFamily, needsYouHref, repoFamilyMap, urgentAttention } from './needsYouModel';

export interface NeedsYouSummary {
  /** Rows Needs you shows in red for this family; null until they are known. */
  count: number | null;
  /** Where to send the operator, on the same family. */
  href: string;
}

/** `family` is '' for every family. Shares the polled attention query. */
export function useNeedsYou(family = ''): NeedsYouSummary {
  const attention = useAttention();
  const repositories = useRepositories({});
  const families = useMemo(
    () => repoFamilyMap(repositories.data?.repositories ?? []),
    [repositories.data]
  );
  const count = useMemo(
    () =>
      attention.data
        ? filterByFamily(urgentAttention(attention.data), family, families).length
        : null,
    [attention.data, family, families]
  );
  return { count, href: needsYouHref(family) };
}
