// useYield.ts — React Query hook for `GET /api/v1/yield` (admin-only).
//
// One read per (family, window, cut). A new window or cut keeps the previous
// answer on screen until the next one lands, so the page keeps its height and
// the reader keeps their place; YieldPage dims it, says it is updating, and
// labels it with the window it was read for while `isPlaceholderData` is true,
// so an old window's numbers never pass for the new one's. A different family
// never borrows another family's numbers: it loads afresh. A server that predates the route
// answers 404 or the SPA shell; `isPipelineUnavailable` recognises both and the
// page says "not available on this server version". Nothing retries. The
// report's `adhoc` and `headline` parts are checked field by field on the way in
// (older servers leave them out, and so does the result then). Flow reads the
// same answer for its headline block: a refused or older-server read simply
// leaves the block off that page.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { YieldQuery, YieldReport } from '../api/types';
import { parseYieldAdhoc } from '../api/yieldAdhoc';
import { parseYieldHeadline } from '../api/yieldHeadline';
import { OPERATOR_REFRESH } from './refreshPolicy';

export const YIELD_KEY = ['yield'];

export function useYield(query: YieldQuery): UseQueryResult<YieldReport, Error> {
  const family = query.family ?? '';
  return useQuery({
    queryKey: [...YIELD_KEY, family, query.since ?? '', query.until ?? '', query.by ?? ''],
    queryFn: async ({ signal }) => withChecked(await apiGet<YieldReport>(endpoints.yieldReport(query), { signal })),
    placeholderData: (previous, previousQuery) =>
      previousQuery && previousQuery.queryKey[YIELD_KEY.length] === family ? previous : undefined,
    ...OPERATOR_REFRESH,
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * The report with its `adhoc` and `headline` parts checked; each dropped when
 * the server sent none.
 */
export function withChecked(report: YieldReport): YieldReport {
  const { adhoc: rawAdhoc, headline: rawHeadline, ...rest } = report;
  const adhoc = parseYieldAdhoc(rawAdhoc);
  const headline = parseYieldHeadline(rawHeadline);
  return { ...rest, ...(adhoc ? { adhoc } : {}), ...(headline ? { headline } : {}) };
}
