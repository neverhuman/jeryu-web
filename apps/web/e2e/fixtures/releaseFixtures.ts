// releaseFixtures.ts — browser-boundary mocks for the release endpoints a
// repository answers with: environments, pulls, its release tag (one batched
// read for every repository mocked on the page) and compare, plus
// the repo list. Shared by the Releases specs and the rendered UX QA lane so
// both render the same surface.

import type { Page } from '@playwright/test';

export const sha = (c: string) => c.repeat(40);
const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

export function pull(
  name: string,
  number: number,
  title: string,
  state: 'open' | 'merged',
  head: string,
  checks: { passing: number; failing: number; pending: number } = { passing: 2, failing: 0, pending: 0 }
) {
  return {
    repo: { id: `id-${name}`, host: 'jeryu', owner: 'jeryu', name },
    number,
    entity: { kind: 'pull_request', id: `${name}-${number}` },
    title,
    author: 'rel-bot',
    head_ref: `feat/${number}`,
    base_ref: 'main',
    head_sha: sha(head),
    base_sha: sha('0'),
    state,
    draft: false,
    mergeable: { can_merge: true, level: 'clean', reasons: [] },
    review: { required_approvals: 1, approvals: 0, changes_requested: 0, unresolved_threads: 0, user_review_state: null },
    checks: { total: checks.passing + checks.failing + checks.pending, skipped: 0, ...checks },
    agents: { active: 0, blocked: 0 },
    labels: [],
    updated_at: `2026-09-1${number % 10}T12:00:00Z`,
    passport_hash: null,
    available_actions: [],
  };
}

export function compareBody(base: string, commits: string[]) {
  return {
    base: sha(base),
    head: 'main',
    base_sha: sha(base),
    head_sha: sha(commits.at(-1) ?? base),
    ahead_by: commits.length,
    behind_by: 0,
    commits: commits.map((c, i) => ({
      sha: sha(c),
      summary: `commit ${c}`,
      author: 'dev',
      committed_at: `2026-09-18T0${i + 1}:00:00Z`,
    })),
    truncated: false,
  };
}

type Tag = { tag: string | null; sha: string | null; tagged_at: string | null };

/** The tags of every repository mocked on a page, answered by one batch route. */
const tagsByPage = new WeakMap<Page, Map<string, Tag>>();

async function mockReleaseTags(page: Page, name: string, tag: Tag | undefined): Promise<void> {
  let tags = tagsByPage.get(page);
  if (!tags) {
    const known = new Map<string, Tag>();
    tags = known;
    tagsByPage.set(page, known);
    await page.route('**/api/v1/release-tags?**', (route) => {
      const asked = (new URL(route.request().url()).searchParams.get('repos') ?? '').split(',');
      const releases = asked.map((repo) => {
        const found = known.get(repo.replace(/^jeryu\//, ''));
        const tagged = Boolean(found?.tag && found.sha);
        return {
          repo,
          full_name: found ? repo : null,
          branch: found ? 'main' : null,
          status: found ? (tagged ? 'tagged' : 'untagged') : 'not_found',
          tag: tagged ? (found?.tag ?? null) : null,
          sha: tagged ? (found?.sha ?? null) : null,
          tagged_at: tagged ? (found?.tagged_at ?? null) : null,
        };
      });
      return route.fulfill(json({ releases }));
    });
  }
  tags.set(name, tag ?? { tag: null, sha: null, tagged_at: null });
}

export async function mockRepo(
  page: Page,
  name: string,
  opts: {
    environments: unknown[];
    pulls: unknown[];
    tag?: { tag: string | null; sha: string | null; tagged_at: string | null };
    compare?: unknown;
  }
): Promise<void> {
  const id = `jeryu%2F${name}`;
  await page.route(`**/api/v3/repos/jeryu/${name}/environments`, (route) =>
    route.fulfill(json({ total_count: opts.environments.length, environments: opts.environments }))
  );
  await page.route(`**/api/v1/repos/${id}/pulls?state=all&limit=500&page=1`, (route) =>
    route.fulfill(json({ total: opts.pulls.length, items: opts.pulls }))
  );
  await mockReleaseTags(page, name, opts.tag);
  await page.route(`**/api/v1/repos/${id}/compare?**`, (route) =>
    opts.compare ? route.fulfill(json(opts.compare)) : route.fulfill({ status: 404, body: '{}' })
  );
}

export const production = {
  name: 'production',
  latest: null,
  previous: null,
  current: {
    deployment: {
      id: 1,
      sha: sha('a'),
      ref: 'main',
      task: 'deploy',
      environment: 'production',
      description: null,
      payload: { release: 'rel-a' },
      creator: { login: 'rel-bot' },
      created_at: '2026-09-17T09:00:00Z',
      production_environment: true,
      transient_environment: false,
    },
    status: null,
    succeeded: true,
  },
};
