// 32-quality-gate.spec.ts — the Quality gate pages on the quality-gate
// observation contract mocked at the browser boundary: the overview and its
// one action, the drill-down rule -> flagged head -> findings, the admin
// dispute, what a non-admin sees, and what a server without the contract says.

import { expect, test } from './fixtures/test';

import { blockingViolations, persistAxeResult, runAxe } from './fixtures/accessibility';
import { mockBootstrap } from './fixtures/mocks';
import { FLAGGED_SHA, mockQualityGateApi } from './fixtures/qualityGateMocks';

test.describe('Quality gate', () => {

  test('the overview tiles, both tables and the daily chart, with no a11y blocker @action:quality_gate.overview', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockQualityGateApi(page);

    await page.goto('/quality-gate');
    await expect(page.getByTestId('quality-gate-page')).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId('quality-gate-tile-fail-rate')).toContainText('25%');
    await expect(page.getByTestId('quality-gate-tile-would-block')).toContainText('10');
    await expect(page.getByTestId('quality-gate-tile-disputes')).toContainText('3');

    // Rules worst first; the dispute rate rides beside the rule that has one.
    const rules = page.getByTestId('quality-gate-rules-table');
    await expect(rules.getByRole('row').nth(1)).toContainText('stale-naming');
    await expect(page.getByTestId('quality-gate-rule-evidence-link')).toContainText('75%');
    await expect(page.getByTestId('quality-gate-repo-jeryu/jeryu-web')).toContainText('40%');
    await expect(
      page.getByRole('img', { name: /^Scored heads per day: 30 scored/ })
    ).toBeVisible();
    await page.getByTestId('quality-gate-page').screenshot({ path: 'playwright-report/quality-gate.png' });

    const result = await runAxe(page, { disableRules: ['color-contrast'] });
    await persistAxeResult('quality-gate', result);
    expect(
      blockingViolations(result).map((v) => `${v.impact ?? '?'} ${v.id}`),
      'the Quality gate overview adds no serious or critical violation'
    ).toEqual([]);
  });

  test('drills from the top failing rule to a flagged head and its findings @action:quality_gate.drilldown', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockQualityGateApi(page);

    await page.goto('/quality-gate');
    // The one action on the overview: the rule failing most often.
    await page.getByTestId('quality-gate-top-rule').click();
    await expect(page).toHaveURL(/\/quality-gate\/rules\/stale-naming$/);
    await expect(page.getByTestId('quality-gate-rule-page')).toContainText(
      'A name says what the thing is now'
    );

    await page.getByRole('link', { name: 'jeryu/jeryu-web@0863f25a' }).click();
    await expect(page).toHaveURL(new RegExp(`/quality-gate/heads/jeryu/jeryu-web/${FLAGGED_SHA}$`));
    await expect(page.getByTestId('quality-gate-score')).toContainText('71 / 85');

    const finding = page.getByTestId('quality-gate-finding-f-1');
    await expect(finding).toContainText('const oldToolMap = buildToolMap();');
    // The evidence links to that line of the repository at the scored commit.
    await expect(
      finding.getByRole('link', { name: 'src/pages/ToolsPage.tsx:42' })
    ).toHaveAttribute(
      'href',
      `/repos/jeryu/jeryu/jeryu-web/blob/${FLAGGED_SHA}/src/pages/ToolsPage.tsx#L42`
    );
    // A finding already disputed says who disputed it, and offers no second vote.
    const settled = page.getByTestId('quality-gate-finding-f-2');
    await expect(settled).toContainText('Disputed by alton: The link is one line above.');
    await expect(settled.getByRole('button', { name: 'Dispute this finding' })).toHaveCount(0);
  });

  test('an admin disputes a finding with a reason; other roles only read @action:quality_gate.dispute', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    const log = await mockQualityGateApi(page);

    await page.goto(`/quality-gate/heads/jeryu/jeryu-web/${FLAGGED_SHA}`);
    const finding = page.getByTestId('quality-gate-finding-f-1');
    await expect(finding).toBeVisible({ timeout: 15_000 });
    await finding.getByRole('button', { name: 'Dispute this finding' }).click();
    // Nothing is recorded until there is a reason to record.
    await expect(finding.getByRole('button', { name: 'Record dispute' })).toBeDisabled();
    await finding.getByLabel('Why is this finding wrong?').fill('The name is current.');
    await finding.getByRole('button', { name: 'Record dispute' }).click();

    await expect(finding).toContainText('Disputed by alton: The name is current.');
    expect(log.disputes).toEqual([
      { path: '/api/v1/quality-gate/findings/f-1/dispute', reason: 'The name is current.' },
    ]);

    // The same head as a plain user: the finding reads the same, the vote is gone.
    await mockBootstrap(page, { auth: { role: 'user' } });
    await mockQualityGateApi(page);
    await page.goto(`/quality-gate/heads/jeryu/jeryu-web/${FLAGGED_SHA}`);
    await expect(page.getByTestId('quality-gate-finding-f-1')).toContainText(
      'const oldToolMap = buildToolMap();'
    );
    await expect(page.getByRole('button', { name: 'Dispute this finding' })).toHaveCount(0);
  });

  test('reached from the System group, and plain on a server without the contract @action:quality_gate.nav', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });

    await page.goto('/repos');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav.getByRole('button', { name: 'System' }).click();
    // The primary nav stays at six: Quality gate sits beside Intelligence.
    await expect(nav.getByRole('link', { name: 'Intelligence', exact: true })).toBeVisible();
    await nav.getByRole('link', { name: 'Quality gate', exact: true }).click();
    await expect(page).toHaveURL(/\/quality-gate$/);

    // No quality-gate mocks: the shared fallback answers 404, like an older server.
    await expect(page.getByText('Not available on this server version.')).toBeVisible({
      timeout: 15_000,
    });
  });
});
