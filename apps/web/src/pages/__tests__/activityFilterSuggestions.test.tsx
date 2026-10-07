// activityFilterSuggestions.test.tsx — what More filters offers for Repo and
// Source: the repository names that exist, the reporters the feed knows, and
// what a bare repository name commits to the URL.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import { resolveRepoFilter } from '../activity/activityModel';
import { KNOWN_SOURCES } from '../activity/sourceModel';
import { mockPipelineApi } from './pipelinePageHelpers';
import { errorResponse, json, renderAt } from './shiftPageHelpers';

function repoSummary(owner: string, name: string): Record<string, unknown> {
  return {
    id: { id: `${owner}-${name}`, host: 'jeryu', owner, name },
    entity: { kind: 'repository', id: `${owner}-${name}` },
    description: null,
    visibility: 'public',
    default_branch: 'main',
    family: 'jeryu',
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
    updated_at: '2026-10-06T00:00:00Z',
    clone_http_url: null,
    clone_ssh_url: null,
    available_actions: [],
  };
}

function repoList(...repos: Array<[string, string]>): Response {
  return json({
    generated_at: '2026-10-06T00:00:00Z',
    total: repos.length,
    repositories: repos.map(([owner, name]) => repoSummary(owner, name)),
    facets: { hosts: ['jeryu'], owners: [], families: [], languages: [] },
  });
}

function options(name: string): string[] {
  const list = screen.queryByTestId(`activity-filter-options-${name}`);
  return list === null
    ? []
    : [...list.querySelectorAll('option')].map((option) => option.getAttribute('value') ?? '');
}

describe('resolveRepoFilter', () => {
  const repos = ['neverhuman/jeryu-web', 'neverhuman/jeryu-api', 'acme/jeryu-web'];

  it('takes a bare name to the one repository called that', () => {
    expect(resolveRepoFilter('jeryu-api', repos)).toBe('neverhuman/jeryu-api');
    expect(resolveRepoFilter('  JERYU-API  ', repos)).toBe('neverhuman/jeryu-api');
  });

  it('leaves a name two repositories share, and one no repository has', () => {
    expect(resolveRepoFilter('jeryu-web', repos)).toBe('jeryu-web');
    expect(resolveRepoFilter('runner', repos)).toBe('runner');
  });

  it('leaves an owner/name and an empty field alone', () => {
    expect(resolveRepoFilter('acme/jeryu-web', repos)).toBe('acme/jeryu-web');
    expect(resolveRepoFilter('', repos)).toBe('');
    expect(resolveRepoFilter('jeryu-api', [])).toBe('jeryu-api');
  });
});

describe('Activity filter suggestions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers the repositories that exist and the sources the feed knows', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/repos' ? repoList(['neverhuman', 'jeryu-web'], ['acme', 'tools']) : undefined
    );
    renderAt('/activity', '/activity', <ActivityPage />);
    await screen.findByTestId('activity-volume');
    await waitFor(() => expect(options('repo')).toEqual(['acme/tools', 'neverhuman/jeryu-web']));
    expect(screen.getByLabelText('Repo')).toHaveAttribute('list', 'activity-filter-repo-options');
    expect(options('source')).toEqual([...KNOWN_SOURCES]);
    expect(KNOWN_SOURCES).toContain('forge');
    // Source has a hint of its own now, so the field is not a blank guess.
    expect(screen.getByLabelText('Source')).toHaveAttribute('placeholder', 'forge or todoq');
  });

  it('commits a bare repository name as the full name the server matches', async () => {
    const calls = mockPipelineApi((req) =>
      req.pathname === '/api/v1/repos' ? repoList(['neverhuman', 'jeryu-web']) : undefined
    );
    renderAt('/activity', '/activity', <ActivityPage />);
    await screen.findByTestId('activity-volume');
    await waitFor(() => expect(options('repo')).toHaveLength(1));
    const field = screen.getByLabelText('Repo');
    fireEvent.change(field, { target: { value: 'jeryu-web' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.pathname === '/api/v1/events' &&
            new URLSearchParams(call.search).get('repo') === 'neverhuman/jeryu-web'
        )
      ).toBe(true)
    );
  });

  it('offers no repository names when the server cannot list them', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/repos' ? errorResponse(500, 'no repos') : undefined
    );
    renderAt('/activity', '/activity', <ActivityPage />);
    await screen.findByTestId('activity-volume');
    expect(options('repo')).toEqual([]);
    expect(screen.getByLabelText('Repo')).not.toHaveAttribute('list');
    // A typed owner/name still filters: the list is a convenience, not the gate.
    expect(options('source')).toEqual([...KNOWN_SOURCES]);
  });
});
