// useForgeHost.ts — which forge the repositories a page links to live on.
//
// Most read models name a repository as `owner/name` and say nothing about its
// forge, yet every repository URL starts with one. The repository list does
// say (`facets.hosts`, and `id.host` on each row), so the host comes from
// there and a link built by `repoUrl` follows the data instead of a constant.
// Pages share one polled query, the same one `useNeedsYou` reads.

import { useMemo } from 'react';

import type { RepositoryListResponse } from '../api/types';

import { useRepositories } from './useRepositories';

/** The forge the app's own repositories are on, before the list has answered. */
export const DEFAULT_FORGE_HOST = 'jeryu';

/** The host for a repository named `owner/name`; falls back when unknown. */
export type ForgeHost = (fullName?: string) => string;

/** The host each repository is on, plus the one to assume for the rest. */
export function forgeHostFor(
  response: RepositoryListResponse | undefined,
  fallback = DEFAULT_FORGE_HOST
): ForgeHost {
  const byName = new Map<string, string>();
  for (const repo of response?.repositories ?? []) {
    if (repo.id.host) byName.set(`${repo.id.owner}/${repo.id.name}`, repo.id.host);
  }
  // A list the server trimmed (or a page that stubs it) may name no host at
  // all; the fallback is then the only honest answer.
  const listed = response?.facets?.hosts ?? [];
  const common = listed[0] ?? byName.values().next().value ?? fallback;
  return (fullName) => (fullName ? (byName.get(fullName) ?? common) : common);
}

/** The page's forge-host resolver. Safe before the list answers. */
export function useForgeHost(): ForgeHost {
  const repositories = useRepositories({});
  return useMemo(() => forgeHostFor(repositories.data), [repositories.data]);
}
