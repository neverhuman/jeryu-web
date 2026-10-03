// 12-intelligence.spec.ts - JMCP/control-plane smoke.

import { expect, test } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import { mockBootstrap } from './fixtures/mocks';
import {
  mockControlPlane,
  mockDependencyGraph,
  mockToolingEvidence,
} from './fixtures/intelligenceMocks';

test.describe.configure({ retries: 1 });

test.describe('Intelligence control-plane page', () => {
  test('renders priority, graph, search, selection, and absence evidence @action:intelligence.render @action:intelligence.graph_search @action:intelligence.graph_select', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockControlPlane(page);
    await mockToolingEvidence(page);

    const shell = new AppShellPage(page);
    await shell.goto('/intelligence');
    await shell.assertShellLoaded();

    await expect(page.getByTestId('intelligence-page')).toBeVisible({
      timeout: 10_000,
    });
    // What needs a person is one list, in Needs you; this page links there.
    await expect(page.getByTestId('priority-pr-63-checks-missing')).toHaveCount(0);
    await expect(page.getByTestId('intelligence-needs-you').getByRole('link', { name: 'Needs you' })).toHaveAttribute('href', '/needs-you');
    await expect(page.getByText('none recorded yet')).toBeVisible();
    await expect(page.getByText('absence=evidence')).toHaveCount(0);
    await expect(page.getByTestId('operator-graph-console')).toBeVisible();
    await page.getByLabel('Search graph').fill('ci');
    await expect(page.getByTestId('repo-graph-preview')).toBeVisible();
    await expect(page.getByTestId('graph-node-check:ci')).toBeVisible();
    await page.getByTestId('graph-node-check:ci').click();
    await expect(
      page.getByTestId('repo-graph-preview').getByText('failed')
    ).toBeVisible();
    await expect(page.getByTestId('node-inspector')).toContainText('Selected node');
    await expect(page.getByTestId('tool-build-dossiers')).toContainText('tb-routing');
    await expect(page.getByText('Mirror evidence').first()).toBeVisible();
  });

  test('Intelligence nav link routes to the page @action:intelligence.nav', async ({ page }) => {
    await mockBootstrap(page);
    await mockControlPlane(page);
    await mockToolingEvidence(page);

    const shell = new AppShellPage(page);
    await shell.goto('/');
    await shell.assertShellLoaded();


    // Intelligence lives in the nav's System group, closed until asked for.
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav.getByRole('button', { name: 'System' }).click();
    await nav.getByRole('link', { name: 'Intelligence', exact: true }).click();
    await expect(page).toHaveURL(/\/intelligence$/);
  });
});

test.describe('Dependencies graph view', () => {
  test('reaches Dependencies from the nav and colours edges by pin staleness @action:intelligence.dependencies', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockControlPlane(page);
    await mockToolingEvidence(page);
    await mockDependencyGraph(page);

    const shell = new AppShellPage(page);
    await shell.goto('/');
    await shell.assertShellLoaded();
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav.getByRole('button', { name: 'System' }).click();
    await nav.getByRole('link', { name: 'Dependencies', exact: true }).click();
    await expect(page).toHaveURL(/\/intelligence\/dependencies$/);

    await expect(page.getByTestId('dependencies-page')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('operator-graph-console')).toHaveAttribute(
      'data-mode',
      'dependencies'
    );
    await expect(page.getByTestId('dependencies-current-pins')).toContainText(
      '1 current pins'
    );
    await expect(page.getByLabel('Pin staleness legend')).toBeVisible();
    await expect(page.getByText('4 commits behind')).toBeVisible();
    await page.getByTestId('graph-node-repo:jeryu/core').click();
    await expect(page.getByTestId('node-inspector')).toContainText('Depth');
  });
});
