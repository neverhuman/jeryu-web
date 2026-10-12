// useAgentPresence.ts — the agents at work on a repository, or in a family.
//
// The query throws whatever the server answered; a page reads
// `presenceUnsupported(error)` where it renders and, on an older server with
// no presence route, shows the agent runs alone. Nothing is retried once the
// route is known to be missing, and the list is polled while a page reads it:
// presence is live state, and a session that stops beating turns stale.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import {
  fetchFamilyAgentPresence,
  fetchRepoAgentPresence,
  presenceUnsupported,
  type AgentPresenceList,
} from '../api/agentPresence';

const POLL_MS = 30_000;

export function repoAgentPresenceQueryKey(repoId: string | null): readonly unknown[] {
  return ['repo', repoId, 'agent-presence'];
}

export function familyAgentPresenceQueryKey(family: string): readonly unknown[] {
  return ['family', family, 'agent-presence'];
}

function retryUnlessMissing(failures: number, error: Error): boolean {
  return !presenceUnsupported(error) && failures < 2;
}

/**
 * `fetch: false` reads only what is already cached (the repository tab bar
 * uses it, so its count costs no request on the other tabs).
 */
export function useRepoAgentPresence(
  repoId: string | null,
  options: { fetch?: boolean } = {}
): UseQueryResult<AgentPresenceList, Error> {
  const id = repoId ?? '';
  const wanted = options.fetch ?? true;
  return useQuery({
    queryKey: repoAgentPresenceQueryKey(repoId),
    queryFn: ({ signal }) => fetchRepoAgentPresence(id, signal),
    enabled: wanted && id !== '',
    staleTime: 10_000,
    refetchInterval: (query) =>
      wanted && !presenceUnsupported(query.state.error) ? POLL_MS : false,
    retry: retryUnlessMissing,
  });
}

export function useFamilyAgentPresence(
  family: string | null | undefined
): UseQueryResult<AgentPresenceList, Error> {
  const key = family ?? '';
  return useQuery({
    queryKey: familyAgentPresenceQueryKey(key),
    queryFn: ({ signal }) => fetchFamilyAgentPresence(key, signal),
    enabled: key !== '',
    staleTime: 15_000,
    refetchInterval: (query) => (presenceUnsupported(query.state.error) ? false : POLL_MS),
    retry: retryUnlessMissing,
  });
}
