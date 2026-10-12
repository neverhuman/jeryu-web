// usePeople.ts — who a family's todos can be handed to, for "assign to" pickers.
//
// `GET /api/v1/shift/families/:family/people` lists active people who can
// write to the family's code: never bots, never a login marked as automation
// on the Settings page, and never an account without a grant. Only someone
// who can work in the family may read it.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';

export interface Person {
  login: string;
  display_name: string;
}

export function usePeople(family: string, enabled = true): UseQueryResult<Person[], Error> {
  return useQuery({
    queryKey: ['people', family],
    enabled,
    staleTime: 60_000,
    queryFn: ({ signal }) => apiGet<Person[]>(endpoints.familyPeople(family), { signal }),
  });
}
