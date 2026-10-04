// useForgeHost.test.ts — the forge a link names comes from the repository list.

import { describe, expect, it } from 'vitest';

import type { RepositoryListResponse } from '../../api/types';
import { DEFAULT_FORGE_HOST, forgeHostFor } from '../useForgeHost';

function response(
  rows: { host: string; owner: string; name: string }[],
  hosts = Array.from(new Set(rows.map((r) => r.host)))
): RepositoryListResponse {
  return {
    generated_at: '2026-10-04T00:00:00Z',
    total: BigInt(rows.length),
    repositories: rows.map((id) => ({ id }) as RepositoryListResponse['repositories'][number]),
    facets: { hosts, owners: [], families: [], languages: [] },
  };
}

describe('forgeHostFor', () => {
  it('answers the host each repository is on', () => {
    const host = forgeHostFor(
      response([
        { host: 'forge.example', owner: 'acme', name: 'widgets' },
        { host: 'mirror.example', owner: 'globex', name: 'tools' },
      ])
    );
    expect(host('acme/widgets')).toBe('forge.example');
    expect(host('globex/tools')).toBe('mirror.example');
  });

  it('assumes the forge the list leads with for a repository it does not name', () => {
    const host = forgeHostFor(response([{ host: 'forge.example', owner: 'acme', name: 'widgets' }]));
    expect(host('initech/unlisted')).toBe('forge.example');
    expect(host()).toBe('forge.example');
  });

  it('falls back before the list has answered', () => {
    expect(forgeHostFor(undefined)('acme/widgets')).toBe(DEFAULT_FORGE_HOST);
  });
});
