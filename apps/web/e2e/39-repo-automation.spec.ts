// 39-repo-automation.spec.ts — the repository's Automation tab and its Mirrors
// section: what runs on the repository, who reviews and merges it (and
// whether their grants exist), what last deployed it, and where it is copied
// to. Every repository, identity, host and target below is invented.

import { expect, test } from './fixtures/test';

import { mockBootstrap, mockRepoAutomation, mockRepoList } from './fixtures/mocks';

const REPO = {
  id: { host: 'acme', owner: 'acme', name: 'widget-www' },
  default_branch: 'main',
} as const;

const FULL_VIEW = {
  repo: 'acme/widget-www',
  defaultBranch: 'main',
  checks: [
    {
      name: 'jankurai/proof',
      required: true,
      state: 'reported',
      lastConclusion: 'success',
      lastRunAt: '2026-09-30T11:00:00Z',
      lastHeadSha: '1f0c9a4b2d7e6f5a8c3b1d0e9f8a7b6c5d4e3f21',
      detailsUrl: 'https://forge.invalid/checks/proof',
    },
    {
      name: 'widget-www/required',
      required: true,
      state: 'missing',
    },
    {
      name: 'jeryu/autonomy',
      required: false,
      state: 'reported',
      lastConclusion: 'failure',
      lastRunAt: '2026-09-30T10:00:00Z',
    },
  ],
  requiredContexts: ['jankurai/proof', 'widget-www/required'],
  actors: [
    {
      kind: 'reviewer',
      identity: 'pragent',
      role: 'reviews pull requests and approves the head it read',
      state: 'configured',
      grant: { required: 'write', present: true, held: 'write' },
    },
    {
      kind: 'merger',
      identity: 'jain-merge-bot',
      role: 'merges approved pull requests',
      state: 'configured',
      grant: {
        required: 'write',
        present: false,
        warning:
          'jain-merge-bot has no write grant on acme/widget-www; its merges answer 403',
      },
    },
    {
      kind: 'gate-runner',
      identity: 'buildhost2/slot0',
      role: 'runs the required gate on pull request heads',
      state: 'online',
      lastRun: {
        conclusion: 'success',
        at: '2026-09-30T10:45:00Z',
        sha: '1f0c9a4b2d7e6f5a8c3b1d0e9f8a7b6c5d4e3f21',
        pr: 31,
      },
    },
    {
      kind: 'deployer',
      identity: 'buildhost1/publish',
      role: 'deploys the forge branch to its target',
      state: 'online',
      lastRun: {
        conclusion: 'deployed',
        at: '2026-09-30T11:05:00Z',
        sha: '1f0c9a4b2d7e6f5a8c3b1d0e9f8a7b6c5d4e3f21',
        target: 'edge-pages',
      },
    },
  ],
  mirrors: [
    {
      target: 'https://example.invalid/acme-oss/widget-www',
      direction: 'push',
      refs: ['refs/heads/main', 'refs/tags/*'],
      state: 'behind',
      behind: true,
      forgeHead: '1f0c9a4b2d7e6f5a8c3b1d0e9f8a7b6c5d4e3f21',
      lastPushedSha: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a09',
      lastPushedAt: '2026-09-29T09:30:00Z',
      lastError: 'push rejected: no key on this host',
    },
  ],
  grants: [
    {
      login: 'dana',
      access: 'read',
      grantedBy: 'acme-admin',
      grantedAt: '2026-09-01T09:00:00Z',
    },
  ],
  grantsVisible: true,
  warnings: [
    'jain-merge-bot has no write grant on acme/widget-www; its merges answer 403',
  ],
};

test('the Automation tab names its checks, reviewer, merger, deployer, grants and mirror @action:repo.automation', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockRepoList(page, [REPO]);
  await mockRepoAutomation(page, FULL_VIEW);

  await page.goto('/repos/acme/acme/widget-www/automation');

  const automation = page.getByTestId('repo-automation');
  await expect(
    automation.getByRole('heading', { name: 'Automation' })
  ).toBeVisible({ timeout: 15_000 });

  // The forge's own checks, with what each last concluded, and the required
  // context nobody runs called out rather than left off the page.
  const checks = page.getByTestId('repo-automation-checks');
  await expect(checks.getByRole('listitem')).toHaveCount(3);
  await expect(checks).toContainText('jankurai/proof');
  await expect(checks).toContainText('success');
  await expect(checks).toContainText('1f0c9a4');
  await expect(checks).toContainText('widget-www/required');
  await expect(checks).toContainText('never reported');
  await expect(checks).toContainText('jeryu/autonomy');
  await expect(checks).toContainText('Not required');
  await expect(
    checks.getByRole('link', { name: 'Open the jankurai/proof run' })
  ).toHaveAttribute('href', 'https://forge.invalid/checks/proof');

  // Who reviews, who merges, who gates, who deploys — and what each last did.
  const actors = page.getByTestId('repo-automation-actors');
  await expect(actors).toContainText('pragent');
  await expect(actors).toContainText('write grant ✓');
  await expect(actors).toContainText('jain-merge-bot');
  await expect(actors).toContainText('buildhost2/slot0');
  await expect(actors).toContainText('success 1f0c9a4 #31');
  await expect(actors).toContainText('buildhost1/publish');
  await expect(actors).toContainText('deployed 1f0c9a4 to edge-pages');

  // The merge identity that cannot merge is stated where nobody can miss it.
  await expect(page.getByTestId('repo-automation-warnings')).toContainText(
    'jain-merge-bot has no write grant on acme/widget-www; its merges answer 403'
  );

  // Grants, for a caller who may read them.
  await expect(page.getByTestId('repo-automation-grants')).toContainText('dana');
  await expect(page.getByTestId('repo-automation-grants')).toContainText(
    'granted by acme-admin'
  );

  // The mirror: where it is, which refs travel, the sha it holds, why it is
  // not level with the forge.
  const mirrors = page.getByTestId('repo-mirrors');
  await expect(mirrors.getByRole('heading', { name: 'Mirrors' })).toBeVisible();
  await expect(mirrors).toContainText('example.invalid/acme-oss/widget-www');
  await expect(mirrors).toContainText('refs/heads/main, refs/tags/*');
  await expect(mirrors).toContainText('behind the forge');
  await expect(mirrors).toContainText('9a8b7c6');
  await expect(mirrors).toContainText('push rejected: no key on this host');
});

test('a repository with nothing registered and no mirror says so @action:repo.automation_empty', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockRepoList(page, [
    { id: { host: 'acme', owner: 'acme', name: 'quiet-lib' } },
  ]);
  await mockRepoAutomation(page, { repo: 'acme/quiet-lib' });

  await page.goto('/repos/acme/acme/quiet-lib/automation');

  const automation = page.getByTestId('repo-automation');
  await expect(automation).toContainText('Nothing is registered to act on', {
    timeout: 15_000,
  });
  await expect(automation).toContainText('acme/quiet-lib');
  // A reader who may not see the grants is told that, not shown an empty list
  // that reads as "nobody has access".
  await expect(
    page.getByTestId('repo-automation-grants-hidden')
  ).toContainText('Only a repository administrator can see who holds which access.');
  await expect(page.getByTestId('repo-mirrors')).toContainText(
    'This repository is not mirrored anywhere.'
  );
});
