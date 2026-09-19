// 28-unreleased.spec.ts — Unreleased page: one row per pull request, grouped
// by repository, classified against each repository's newest release.
//
// The family view lists members from `/api/v1/repos?family=`, then per repo
// reads `/api/v3/repos/{o}/{r}/environments`, `/api/v1/repos/{id}/pulls?state=all`,
// `/api/v1/repos/{id}/release-tag` (only without a production deployment) and
// `/api/v1/repos/{id}/compare?base=<release sha>&head=main`. Three members
// cover the three release sources: a deployment, a tag, and neither.

import { expect, test, type Page } from '@playwright/test';

import { mockBootstrap, mockRepoList } from './fixtures/mocks';

const sha = (c: string) => c.repeat(40);
const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

function pull(
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

function compareBody(base: string, commits: string[]) {
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

async function mockRepo(
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

const production = {
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

test('family view groups PRs by repo and classifies them per release source @action:unreleased.family', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockRepoList(page, [
    { id: { host: 'jeryu', owner: 'jeryu', name: 'jeryu-deploy' }, family: 'jeryu' },
    { id: { host: 'jeryu', owner: 'jeryu', name: 'jeryu-cli' }, family: 'jeryu' },
    { id: { host: 'jeryu', owner: 'jeryu', name: 'jeryu-docs' }, family: 'jeryu' },
    { id: { host: 'jeryu', owner: 'jeryu', name: 'elsewhere' }, family: 'other' },
  ]);
  await mockRepo(page, 'jeryu-deploy', {
    environments: [production],
    pulls: [
      pull('jeryu-deploy', 30, 'feat: about to land', 'open', 'f'),
      pull('jeryu-deploy', 29, 'fix: broken build', 'open', 'e', { passing: 1, failing: 1, pending: 0 }),
      pull('jeryu-deploy', 28, 'feat: merged not live', 'merged', 'c'),
      pull('jeryu-deploy', 27, 'feat: already live', 'merged', 'a'),
    ],
    compare: compareBody('a', ['b', 'c']),
  });
  await mockRepo(page, 'jeryu-cli', {
    environments: [],
    pulls: [
      pull('jeryu-cli', 12, 'feat: after the tag', 'merged', 'k'),
      pull('jeryu-cli', 11, 'feat: in the tag', 'merged', 'j'),
    ],
    tag: { tag: 'v5.0.0-split.4', sha: sha('j'), tagged_at: '2026-09-10T00:00:00Z' },
    compare: compareBody('j', ['k']),
  });
  await mockRepo(page, 'jeryu-docs', {
    environments: [],
    pulls: [pull('jeryu-docs', 4, 'docs: never released', 'merged', 'd')],
  });

  await page.goto('/unreleased?family=jeryu');
  await expect(page.getByTestId('unreleased-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('unreleased-repo-jeryu/elsewhere')).toHaveCount(0);

  // Deployment-based: production runs rel-a.
  await expect(page.getByTestId('unreleased-summary-jeryu/jeryu-deploy')).toHaveText(
    'main is 2 commits / 1 PR ahead of rel-a — releasable'
  );
  const deploy = page.getByTestId('unreleased-table-jeryu/jeryu-deploy');
  await expect(deploy.locator('tbody tr')).toHaveCount(3);
  await expect(deploy.locator('tbody tr').nth(0)).toContainText('#30 feat: about to land');
  await expect(deploy.locator('tbody tr').nth(0)).toContainText('about to land');
  await expect(deploy.locator('tbody tr').nth(1)).toContainText('Merged · unreleased');
  await expect(deploy.locator('tbody tr').nth(1)).toContainText('ccccccc');
  await expect(deploy.locator('tbody tr').nth(2)).toContainText('checks failing');
  await expect(page.getByTestId('unreleased-pr-jeryu/jeryu-deploy-27')).toHaveCount(0);

  // Tag-based: v5.0.0-split.4 carries #11 but not #12.
  await expect(page.getByTestId('unreleased-summary-jeryu/jeryu-cli')).toHaveText(
    'main is 1 commit / 1 PR ahead of v5.0.0-split.4 — releasable'
  );
  await expect(page.getByTestId('unreleased-pr-jeryu/jeryu-cli-12')).toContainText('Merged · unreleased');
  await expect(page.getByTestId('unreleased-pr-jeryu/jeryu-cli-11')).toHaveCount(0);

  // Neither: say so instead of calling everything unreleased.
  await expect(page.getByTestId('unreleased-summary-jeryu/jeryu-docs')).toContainText(
    'No release recorded'
  );
  await expect(page.getByTestId('unreleased-pr-jeryu/jeryu-docs-4')).toContainText(
    'no release recorded'
  );

  // The toggle adds released PRs with the release that carries them.
  await page.getByTestId('unreleased-show-released').click();
  await expect(page).toHaveURL(/released=1/);
  await expect(page.getByTestId('unreleased-show-released')).toBeChecked();
  await expect(page.getByTestId('unreleased-pr-jeryu/jeryu-deploy-27')).toContainText(
    'Released in rel-a · 2026-09-17'
  );
  await expect(page.getByTestId('unreleased-pr-jeryu/jeryu-cli-11')).toContainText(
    'Released in v5.0.0-split.4 · 2026-09-10'
  );
});

test('the nav links to the unreleased page for one repository @action:unreleased.repo', async ({ page }) => {
  await mockBootstrap(page);
  await mockRepo(page, 'jeryu-deploy', {
    environments: [production],
    pulls: [pull('jeryu-deploy', 27, 'feat: already live', 'merged', 'a')],
    compare: compareBody('a', []),
  });

  await page.goto('/releases');
  await page.getByRole('link', { name: 'Unreleased', exact: true }).click();
  await expect(page).toHaveURL(/\/unreleased$/);
  await expect(page.getByTestId('unreleased-summary-jeryu/jeryu-deploy')).toHaveText(
    'main matches rel-a — nothing to release'
  );
  await expect(page.getByTestId('unreleased-empty-jeryu/jeryu-deploy')).toBeVisible();
});
