// 42-mobile-shell.spec.ts — the shell on a phone-sized viewport.
//
// 390x844 is the narrowest viewport jeryu-web supports. Two things must hold
// on every page there:
//
//   1. The document never scrolls sideways. A table is as wide as its columns
//      need; each one sits in a `.table-scroll` box and scrolls inside it.
//   2. The navigation is reachable. There is no room for a sidebar beside the
//      content, so the header's menu button slides the same nav in over the
//      page — at full width, where "Needs you" reads in full and keeps its
//      red count.

import { expect, test, type Page } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import {
  mockBlob,
  mockBootstrap,
  mockPullRequestCommits,
  mockPullRequestDetail,
  mockReadme,
  mockRefs,
  mockRepoList,
  mockRepoLookup,
  mockTree,
} from './fixtures/mocks';
import { mockPipelineApi } from './fixtures/pipelineMocks';
import { mockShiftApi } from './fixtures/shiftMocks';

test.describe.configure({ retries: 1 });

const PHONE = { width: 390, height: 844 } as const;
const REPO = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;
const PR_NUMBER = '42';
const PR_SHA = '1234567890abcdef1234567890abcdef12345678';

/** Several repositories, so the Repositories table is wider than the phone. */
function repoRows(): Parameters<typeof mockRepoList>[1] {
  return ['jeryu-deploy', 'jeryu-core', 'jeryu-ci-runner', 'jeryu-intelligence'].map(
    (name, i) => ({
      id: { host: 'jeryu', owner: 'acme', name },
      default_branch: 'main',
      description: `A split family member with a description long enough to push the table wide (${name}).`,
      visibility: 'internal' as const,
      family: 'acme-split',
      open_pull_requests: i + 1,
      failing_checks: i,
      running_jobs: i,
      active_agents: i,
      jankurai_score: 90 + i,
      jankurai_decision: 'pass',
      topics: ['rust', 'web'],
    })
  );
}

/** How far the document can be scrolled sideways; 0 or less is the only pass. */
async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(root.scrollWidth - window.innerWidth, document.body.scrollWidth - window.innerWidth);
  });
}

async function mockEveryPage(page: Page): Promise<void> {
  await mockBootstrap(page, { auth: { role: 'admin' } });
  await mockPipelineApi(page);
  await mockShiftApi(page);
  await mockRepoList(page, repoRows());
  await mockRepoLookup(page, { id: REPO, default_branch: 'main' });
  await mockRefs(page);
  await mockReadme(page, { html: '<h1>Portal</h1><p>The front page of the repository.</p>' });
  await mockTree(page, [{ path: 'README.md', kind: 'file' }, { path: 'src', kind: 'dir' }]);
  await mockBlob(page, {
    path: 'README.md',
    text: '# Portal\n\nA line of prose, and a very long unbroken token: ' + 'x'.repeat(200),
    mime: 'text/markdown',
  });
  await mockPullRequestCommits(page, [
    { sha: PR_SHA, message: 'Add the split family browser', date: '2026-05-26T00:00:00Z' },
  ]);
  await mockPullRequestDetail(page, {
    repoId: `${REPO.host}:${REPO.owner}/${REPO.name}`,
    number: PR_NUMBER,
    title: 'Add the split family browser',
    state: 'open',
    head_sha: PR_SHA,
    approvals: 0,
    required_approvals: 1,
    passport: 'pass',
    can_merge: true,
  });
}

const PAGES: Array<{ name: string; path: string }> = [
  { name: 'Needs you', path: '/needs-you' },
  { name: 'Repositories', path: '/repos' },
  { name: 'Activity', path: '/activity' },
  { name: 'Work', path: '/work' },
  { name: 'a repository code page', path: `/repos/${REPO.host}/${REPO.owner}/${REPO.name}` },
  {
    name: 'a pull request page',
    path: `/repos/${REPO.host}/${REPO.owner}/${REPO.name}/pulls/${PR_NUMBER}`,
  },
];

test.describe('Mobile shell', () => {
  test('no page scrolls sideways at 390px @action:shell.no_sideways_scroll', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await mockEveryPage(page);
    const shell = new AppShellPage(page);

    for (const target of PAGES) {
      await page.goto(target.path);
      await shell.assertShellLoaded(15_000);
      // Wait for the widest thing on the page to have arrived before measuring.
      await expect(page.locator('.app-shell__main')).toBeVisible();
      await expect
        .poll(() => sidewaysOverflow(page), {
          message: `${target.name} (${target.path}) scrolls sideways at ${PHONE.width}px`,
          timeout: 10_000,
        })
        .toBeLessThanOrEqual(0);
    }
  });

  test('the header menu opens the navigation drawer, labels and badges in full @action:shell.nav_drawer', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await mockEveryPage(page);
    const shell = new AppShellPage(page);

    await page.goto('/needs-you');
    await shell.assertShellLoaded(15_000);

    // The sidebar is not beside the content here: it would clip every label.
    await expect(page.locator('.app-shell__leftnav')).toBeHidden();
    await expect(page.getByTestId('nav-drawer')).toHaveCount(0);

    await page.getByTestId('nav-drawer-button').click();
    const drawer = page.getByTestId('nav-drawer');
    await expect(drawer).toBeVisible();

    // The whole label, not 'Nee you', and the red count beside it.
    const needsYou = drawer.getByRole('link', { name: /^Needs you/ });
    await expect(needsYou).toBeVisible();
    await expect(needsYou).toContainText('Needs you');
    await expect(drawer.getByTestId('needs-you-badge')).toHaveText('3');

    // Nothing is clipped: each label fits the box it is drawn in.
    const clipped = await drawer.evaluate((root) =>
      Array.from(root.querySelectorAll('.left-nav__item')).filter(
        (el) => el.scrollWidth > el.clientWidth + 1
      ).length
    );
    expect(clipped, 'a nav label is cut off inside the drawer').toBe(0);

    // Opening the drawer does not widen the page either.
    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);

    // Escape closes it; so does arriving somewhere.
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);

    await page.getByTestId('nav-drawer-button').click();
    await page.getByTestId('nav-drawer').getByRole('link', { name: 'Repositories' }).click();
    await expect(page).toHaveURL(/\/repos$/);
    await expect(page.getByTestId('nav-drawer')).toHaveCount(0);
  });
});
