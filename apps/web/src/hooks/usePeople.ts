// usePeople.ts — who one todo can be handed to, for "assign to" pickers.
//
// `GET /api/v1/shift/todos/:family/:id/people` lists active people who can
// write to the todo's code: never bots, never a login marked as automation on
// the Settings page, and never an account without a grant. Only someone who
// can work on the todo may read it.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';

export interface Person {
  login: string;
  display_name: string;
}

export function usePeople(
  family: string,
  id: string,
  enabled = true
): UseQueryResult<Person[], Error> {
  return useQuery({
    queryKey: ['people', family, id],
    enabled,
    staleTime: 60_000,
    queryFn: ({ signal }) => apiGet<Person[]>(endpoints.shiftTodoPeople(family, id), { signal }),
  });
}
