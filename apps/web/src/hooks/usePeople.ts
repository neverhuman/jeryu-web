// usePeople.ts — the forge's active people, for "assign to" pickers.
//
// `GET /api/v1/people` lists accounts that are people: never bots, and never
// a login an administrator marked as automation on the Settings page.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';

export interface Person {
  login: string;
  display_name: string;
}

export function usePeople(enabled = true): UseQueryResult<Person[], Error> {
  return useQuery({
    queryKey: ['people'],
    enabled,
    staleTime: 60_000,
    queryFn: ({ signal }) => apiGet<Person[]>(endpoints.people(), { signal }),
  });
}
