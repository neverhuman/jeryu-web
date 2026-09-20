// releaseChannelMocks.ts — the environments, tags and compares behind the Pull
// requests timeline's release ladder, and the shift queue behind its ghost rows.
//
// A repository with no fixture answers "no environment and no tag", which is
// exactly how a repository that records no release behaves.

import type { Page } from '@playwright/test';

export interface ChannelFixture {
  /** `owner/name`. */
  repo: string;
  /** Live deployment per environment: the sha it runs and its release name. */
  channels?: Record<string, { sha: string; release?: string }>;
  /** Newest tag on the branch, for a repository with no deployment. */
  tag?: { tag: string; sha: string };
  /** Shas each environment LACKS, keyed by environment: what compare returns. */
  missing?: Record<string, string[]>;
  /** Environments whose compare comes back capped. */
  capped?: string[];
}

export async function mockReleaseChannels(page: Page, fixtures: ChannelFixture[]): Promise<void> {
  const byRepo = new Map(fixtures.map((fixture) => [fixture.repo, fixture]));

  await page.route('**/api/v3/repos/*/*/environments', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const repo = `${decodeURIComponent(parts[4] ?? '')}/${decodeURIComponent(parts[5] ?? '')}`;
    const channels = byRepo.get(repo)?.channels ?? {};
    const environments = Object.entries(channels).map(([name, live]) => ({
      name,
      latest: null,
      previous: null,
      current: {
        deployment: {
          id: 1,
          sha: live.sha,
          ref: 'main',
          task: 'deploy',
          environment: name,
          description: null,
          payload: live.release ? { release: live.release } : {},
          creator: { login: 'jeryu' },
          created_at: '2026-06-04T00:00:00Z',
          production_environment: name === 'production',
          transient_environment: false,
        },
        status: {
          id: 1,
          state: 'success',
          description: null,
          environment_url: null,
          log_url: null,
          creator: { login: 'jeryu' },
          created_at: '2026-06-04T00:00:00Z',
        },
        succeeded: true,
      },
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total_count: environments.length, environments }),
    });
  });

  await page.route('**/api/v1/repos/*/release-tag**', async (route) => {
    const repo = decodeURIComponent(new URL(route.request().url()).pathname.split('/')[4] ?? '');
    const tag = byRepo.get(repo)?.tag;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        branch: 'main',
        tag: tag?.tag ?? null,
        sha: tag?.sha ?? null,
        tagged_at: tag ? '2026-06-01T00:00:00Z' : null,
      }),
    });
  });

  await page.route('**/api/v1/repos/*/compare**', async (route) => {
    const url = new URL(route.request().url());
    const repo = decodeURIComponent(url.pathname.split('/')[4] ?? '');
    const base = url.searchParams.get('base') ?? '';
    const fixture = byRepo.get(repo);
    // Which environment this compare is for: the one running `base`.
    const environment =
      Object.entries(fixture?.channels ?? {}).find(([, live]) => live.sha === base)?.[0] ??
      (fixture?.tag?.sha === base ? 'tag' : '');
    const missing = fixture?.missing?.[environment] ?? [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        base,
        head: 'main',
        base_sha: base,
        head_sha: 'head-main',
        ahead_by: missing.length,
        behind_by: 0,
        commits: missing.map((sha) => ({
          sha,
          summary: `commit ${sha}`,
          author: 'alice',
          committed_at: '2026-06-05T00:00:00Z',
        })),
        truncated: (fixture?.capped ?? []).includes(environment),
      }),
    });
  });
}

/** One shift todo, with only the fields the ghost rows read filled in. */
export function shiftTodo(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    family: 'core',
    title: `todo ${id}`,
    body: '',
    repos: ['jeryu'],
    mode: 'now',
    priority: 2,
    blocked_by: [],
    status: 'open',
    attempts: 0,
    requested_by: 'alice',
    filed_at: '2026-06-05T00:00:00Z',
    claim_by: null,
    lease_until: null,
    lease_live: false,
    shift: 'bulletshift/2026-06-05',
    change_set: null,
    commits: {},
    merged: false,
    note: '',
    triaged: true,
    worked_by: [],
    ...over,
  };
}

/** The shift queue behind the timeline's ghost rows. */
export async function mockShiftTodos(page: Page, todos: unknown[]): Promise<void> {
  await page.route('**/api/v1/shift/todos**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ generated_at: '2026-06-05T00:00:00Z', todos }),
    });
  });
}
