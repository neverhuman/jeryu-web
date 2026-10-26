// repoFamilyRailModel.test.ts — the order of a family's members, without a browser.

import { describe, expect, it } from 'vitest';

import { sortFamilyMembers } from '../repoFamilyRailModel';
import type { RepositorySummary } from '../../../api/types';

function repo(name: string, overrides: Partial<RepositorySummary> = {}): RepositorySummary {
  return {
    id: { id: `uuid-${name}`, host: 'acme', owner: 'acme', name },
    entity: { kind: 'repository', id: `uuid-${name}` },
    description: null,
    visibility: 'internal',
    default_branch: 'main',
    family: 'acme',
    archived: false,
    repo_role: null,
    topics: [],
    language: null,
    health: 'healthy',
    open_pull_requests: 0,
    failing_checks: 0,
    running_jobs: 0,
    active_agents: 0,
    blocked_agents: 0,
    updated_at: '2026-10-01T00:00:00Z',
    clone_http_url: null,
    clone_ssh_url: null,
    available_actions: [],
    ...overrides,
  };
}

describe('sortFamilyMembers', () => {
  it('leads with the repository the family publishes from, then sorts by name', () => {
    const members = sortFamilyMembers([
      repo('widget-web'),
      repo('widget-cli'),
      repo('widget-portal', { repo_role: 'public_portal' }),
    ]);
    expect(members.map((member) => member.id.name)).toEqual([
      'widget-portal',
      'widget-cli',
      'widget-web',
    ]);
  });

  it('sorts a family with no portal by name alone, leaving its input alone', () => {
    const input = [repo('b'), repo('a')];
    expect(sortFamilyMembers(input).map((m) => m.id.name)).toEqual(['a', 'b']);
    expect(input.map((m) => m.id.name)).toEqual(['b', 'a']);
  });
});
