// releaseFixtures.ts — browser-boundary mocks for the release endpoints a
// repository answers with: environments, pulls, release-tag and compare, plus
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
    author: 'alton2',
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
  await page.route(`**/api/v1/repos/${id}/pulls?state=all`, (route) =>
    route.fulfill(json({ total: opts.pulls.length, items: opts.pulls }))
  );
  await page.route(`**/api/v1/repos/${id}/release-tag**`, (route) =>
    route.fulfill(json({ branch: 'main', ...(opts.tag ?? { tag: null, sha: null, tagged_at: null }) }))
  );
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
      creator: { login: 'alton2' },
      created_at: '2026-09-17T09:00:00Z',
      production_environment: true,
      transient_environment: false,
    },
    status: null,
    succeeded: true,
  },
};
