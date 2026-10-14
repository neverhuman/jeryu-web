// useScorecard.ts — React Query hook for `GET /api/v1/scorecard`.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { ScorecardQuery, ScorecardReport } from '../api/types';
import { OPERATOR_REFRESH } from './refreshPolicy';

export const SCORECARD_KEY = ['scorecard'] as const;

export function useScorecard(query: ScorecardQuery): UseQueryResult<ScorecardReport, Error> {
  return useQuery({
    queryKey: [...SCORECARD_KEY, query.window ?? '', query.family ?? '', query.repo ?? ''],
    queryFn: ({ signal }) => apiGet<ScorecardReport>(endpoints.scorecard(query), { signal }),
    ...OPERATOR_REFRESH,
    staleTime: 60_000,
    retry: false,
  });
}
