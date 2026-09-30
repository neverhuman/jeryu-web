// useControlPlane.ts - React Query wrapper around the JMCP snapshot.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { ControlPlaneSnapshot } from '../api/types';

export const CONTROL_PLANE_QUERY_KEY: readonly ['control-plane', 'status'] = [
  'control-plane',
  'status',
];

/** The largest page the server hands out, for a view that must see it all. */
export const CONTROL_PLANE_MAX_LIMIT = 500;

export function useControlPlane(options?: {
  /** Poll while mounted (Pull Room); off by default. */
  refetchInterval?: number;
  /** Rows per collection; the server's default is 100. */
  limit?: number;
}): UseQueryResult<ControlPlaneSnapshot, Error> {
  const limit = options?.limit;
  return useQuery({
    queryKey: limit === undefined ? CONTROL_PLANE_QUERY_KEY : [...CONTROL_PLANE_QUERY_KEY, limit],
    queryFn: ({ signal }) =>
      apiGet<ControlPlaneSnapshot>(endpoints.controlPlaneStatus(limit), { signal }),
    staleTime: 15_000,
    refetchInterval: options?.refetchInterval ?? false,
    refetchOnWindowFocus: true,
  });
}
