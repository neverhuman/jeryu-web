// useServerVersion.ts — what the running server is (`GET /api/v1/version`).
//
// The navigation asks on every page, and a deployed build never changes under
// a loaded tab, so the answer is cached for an hour and never retried: a
// server without the route answers 404 once and the footer simply stays away.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { ServerVersion } from '../api/types/version';

export const SERVER_VERSION_KEY: readonly string[] = ['server-version'];

export function useServerVersion(): UseQueryResult<ServerVersion, Error> {
  return useQuery({
    queryKey: SERVER_VERSION_KEY,
    queryFn: ({ signal }) => apiGet<ServerVersion>(endpoints.version(), { signal }),
    staleTime: 60 * 60_000,
    retry: false,
  });
}
