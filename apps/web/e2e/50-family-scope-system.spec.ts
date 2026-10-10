// 50-family-scope-system.spec.ts — the family scope on the System pages.
//
// Two kinds of page, one scope. Runners narrows: a runner a family's release
// board lane names is that family's, a runner no lane names serves every
// family, and the rows left out are counted under the section. Intelligence
// does not narrow — nothing on it maps to a repository — so the header chip
// says so instead of letting its numbers read as one family's, and the family
// stays carried, so the page after it is scoped again.
//
// Invented families only (acme, globex, initech): jeryu is public.

import { expect, test, type Page } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import { mockBootstrap, mockControlPlaneRunners, mockRepoList } from './fixtures/mocks';
import { mockControlPlane, mockToolingEvidence } from './fixtures/intelligenceMocks';
import { mockBoards } from './fixtures/releaseBoardMocks';
import type { RunnerFabricResponse, RunnerNodeSummary } from '../src/api/types';

test.describe.configure({ retries: 1 });

const FAMILIES = ['acme-split', 'globex', 'initech'];

async function mockShiftFamilies(page: Page): Promise<void> {
  await page.route('**/api/v1/shift/families**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        families: FAMILIES.map((name) => ({
          name,
          queue_repo: `${name}/${name}-todo`,
          repos: [],
          shift_tz: 'UTC',
          landing: {},
        })),
      }),
    });
  });
}

function node(runnerId: string): RunnerNodeSummary {
  return {
    runnerId,
    source: 'runnerd',
    state: 'active',
    capacity: 4,
    inFlight: 0,
    labels: ['rust'],
    classes: [],
    activeTaskCount: 0,
    lastUpdated: '2026-10-03T09:00:00Z',
    activeTasks: [],
  } as unknown as RunnerNodeSummary;
}

/** `build-1/slot0` is a lane of the globex board; `house-1/slot0` is nobody's. */
const RUNNERS: RunnerFabricResponse = {
  schemaVersion: 'jeryu.runner_fabric/v1',
  local: {
    state: 'fresh',
    nodes: 2,
    onlineRunners: 2,
    offlineRunners: 0,
    busyRunners: 0,
    idleRunners: 2,
    totalSlots: 8,
    activeSlots: 0,
    utilization: 0,
    lastUpdated: '2026-10-03T09:00:00Z',
    nodeDetails: [node('build-1/slot0'), node('house-1/slot0')],
  },
  mirror: {
    name: 'github_actions_runners',
    state: 'missing',
    reason: 'optional GitHub mirror runner adapter is not configured',
    docsUrl: 'docs/agent-native-standard.md',
  },
} as unknown as RunnerFabricResponse;

const REPOS = [
  {
    id: { host: 'jeryu', owner: 'acme', name: 'acme-web' },
    default_branch: 'main',
    description: 'A repository of the acme family',
    visibility: 'private' as const,
    family: 'acme-split',
  },
  {
    id: { host: 'jeryu', owner: 'globex', name: 'globex-api' },
    default_branch: 'main',
    description: 'A repository of the globex family',
    visibility: 'private' as const,
    family: 'globex',
  },
];

test.describe('Family scope on the System pages', () => {
  test('Runners narrows to the family’s board lanes, Intelligence says it cannot @action:chrome.family_scope_system', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockShiftFamilies(page);
    await mockRepoList(page, REPOS);
    await mockBoards(page);
    await mockControlPlaneRunners(page, RUNNERS);
    await mockControlPlane(page);
    await mockToolingEvidence(page);

    const shell = new AppShellPage(page);
    await shell.goto('/runners?family=globex');
    await shell.assertShellLoaded();

    // globex's own gate runner, and the one no lane names.
    await expect(page.getByTestId('fleet-node-build-1_slot0')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('fleet-node-house-1_slot0')).toBeVisible();
    await expect(page.getByTestId('family-scope-select')).toHaveValue('globex');
    await expect(page.getByTestId('family-scope-global')).toHaveCount(0);

    // Another family: the lane's runner belongs to globex, so it is held back
    // and counted — nothing disappears without being accounted for.
    await page.getByTestId('family-scope-select').selectOption('acme');
    await page.waitForURL(/\/runners\?family=acme$/);
    await expect(page.getByTestId('fleet-node-build-1_slot0')).toHaveCount(0);
    await expect(page.getByTestId('fleet-node-house-1_slot0')).toBeVisible();
    await expect(page.getByTestId('family-scope-elsewhere')).toContainText(
      '+1 runners in other families'
    );

    // Intelligence is the same page for every family: it says so, and keeps
    // carrying acme rather than clearing the scope out from under the reader.
    // Runners is itself a System page, so the group is already open here.
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await Promise.all([
      page.waitForURL('**/intelligence?family=acme'),
      nav.getByRole('link', { name: 'Intelligence', exact: true }).click(),
    ]);
    await expect(page.getByTestId('intelligence-page')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('family-scope-global')).toContainText(
      'this page is not per-family'
    );
    await expect(page.getByTestId('family-scope-select')).toHaveValue('acme');

    // Back on a page that does narrow, the note is gone and the scope is still
    // acme's: the global page never widened it.
    await Promise.all([
      page.waitForURL('**/runners?family=acme'),
      nav.getByRole('link', { name: 'Runners', exact: true }).click(),
    ]);
    await expect(page.getByTestId('family-scope-global')).toHaveCount(0);
    await expect(page.getByTestId('family-scope-select')).toHaveValue('acme');
  });
});
