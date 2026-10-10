// repoFamilyRailModel.test.ts — the family rail's decisions, without a browser.

import { describe, expect, it } from 'vitest';

import {
  FAMILY_RAIL_FULL_WIDTH,
  FAMILY_RAIL_SELECT_WIDTH,
  familyMemberHref,
  familyRailTier,
  memberPullsLabel,
  neighbourMember,
  sortFamilyMembers,
} from '../repoFamilyRailModel';
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

describe('familyRailTier', () => {
  it('is the rail itself at 1280px and up', () => {
    expect(familyRailTier(FAMILY_RAIL_FULL_WIDTH)).toBe('rail');
    expect(familyRailTier(1920)).toBe('rail');
  });

  it('is a toggle between 720px and 1279px', () => {
    expect(familyRailTier(FAMILY_RAIL_SELECT_WIDTH)).toBe('toggle');
    expect(familyRailTier(FAMILY_RAIL_FULL_WIDTH - 1)).toBe('toggle');
  });

  it('is a select below 720px, where there is no room for a rail', () => {
    expect(familyRailTier(FAMILY_RAIL_SELECT_WIDTH - 1)).toBe('select');
    expect(familyRailTier(390)).toBe('select');
  });
});

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

describe('familyMemberHref', () => {
  it('keeps the tab the reader is on', () => {
    expect(familyMemberHref(repo('widget-cli'), 'pulls')).toBe(
      '/repos/acme/acme/widget-cli/pulls'
    );
    expect(familyMemberHref(repo('widget-cli'), 'settings')).toBe(
      '/repos/acme/acme/widget-cli/settings'
    );
  });

  it('drops a blob or a folder to the front page: they name the repository left', () => {
    expect(familyMemberHref(repo('widget-cli'), 'code')).toBe(
      '/repos/acme/acme/widget-cli'
    );
  });
});

describe('neighbourMember', () => {
  const members = [repo('a'), repo('b'), repo('c')];

  it('moves down and up the family, wrapping at both ends', () => {
    expect(neighbourMember(members, 'uuid-a', 1)?.id.name).toBe('b');
    expect(neighbourMember(members, 'uuid-c', 1)?.id.name).toBe('a');
    expect(neighbourMember(members, 'uuid-b', -1)?.id.name).toBe('a');
    expect(neighbourMember(members, 'uuid-a', -1)?.id.name).toBe('c');
  });

  it('has nowhere to move in a family of one', () => {
    expect(neighbourMember([repo('a')], 'uuid-a', 1)).toBeNull();
    expect(neighbourMember([], null, 1)).toBeNull();
  });

  it('starts at the first member when the family has not been read yet', () => {
    expect(neighbourMember(members, null, 1)?.id.name).toBe('a');
  });
});

describe('memberPullsLabel', () => {
  it('says what a member row count stands for', () => {
    expect(memberPullsLabel(0)).toBe('no open pull requests');
    expect(memberPullsLabel(1)).toBe('1 open pull request');
    expect(memberPullsLabel(4)).toBe('4 open pull requests');
  });
});
