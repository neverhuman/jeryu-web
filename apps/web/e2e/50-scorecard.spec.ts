// 50-scorecard.spec.ts — /scorecard: outcome tiles, unknown states, filters,
// phone rendering and System navigation.

import { expect, test, type Page } from './fixtures/test';

import {
  blockingViolations,
  persistAxeResult,
  persistRenderedEvidence,
  runAxe,
} from './fixtures/accessibility';
import { mockBootstrap } from './fixtures/mocks';
import { mockScorecardApi, mockScorecardForbidden } from './fixtures/scorecardMocks';

const PHONE = { width: 390, height: 844 };

async function useTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  const entry: [string, string] = ['jeryu.preferences.v2', JSON.stringify({ theme })];
  await page.addInitScript(([key, value]) => {
    window.localStorage.setItem(key, value);
  }, entry);
}

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(root.scrollWidth - window.innerWidth, document.body.scrollWidth - window.innerWidth);
  });
}

test.describe('Scorecard', () => {
  test('renders outcome tiles, unknown sources and paired volume guardrails @action:scorecard.overview', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockScorecardApi(page);

    await page.goto('/scorecard');
    await expect(page.getByTestId('scorecard-page')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('scorecard-tile-lead_time_p50')).toContainText('1 d');
    await expect(page.getByTestId('scorecard-tile-lead_time_p50')).toContainText('p85 1.6 d');
    await expect(page.getByTestId('scorecard-tile-time_to_restore')).toContainText(
      'Not measured yet — needs incident ledger'
    );
    await expect(page.getByTestId('scorecard-station-breakdown')).toContainText('review');
    await expect(page.getByTestId('scorecard-wip-strip')).toHaveAttribute('href', '/flow');

    const pairHeadings = await page
      .getByTestId('scorecard-volume-pairs')
      .getByRole('heading')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent));
    expect(pairHeadings).toEqual([
      'Items/day',
      'False-done guardrail',
      'Releases/day',
      'Failure guardrail',
      'Surviving net lines/day',
      'Rework guardrail',
    ]);
    await expect(page.getByTestId('scorecard-volume-context')).toContainText('PRs/day');
    await expect(page.getByTestId('scorecard-volume-context')).toContainText('Raw lines/day');

    const result = await runAxe(page, { disableRules: ['color-contrast'] });
    await persistAxeResult('scorecard', result);
    const rendered = await persistRenderedEvidence(page, 'scorecard');
    expect(rendered.geometry.width, 'the Scorecard page rendered with width').toBeGreaterThan(0);
    expect(blockingViolations(result).map((v) => `${v.impact ?? '?'} ${v.id}`)).toEqual([]);
  });

  test('filters stay in the URL and request, and Outcomes opens as a tab @action:scorecard.filters', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    const log = await mockScorecardApi(page);

    await page.goto('/scorecard?family=acme&window=7d&repo=acme/widgets');
    await expect(page.getByTestId('scorecard-body')).toBeVisible({ timeout: 15_000 });
    expect(log.queries[0]?.get('family')).toBe('acme');
    expect(log.queries[0]?.get('window')).toBe('7d');
    expect(log.queries[0]?.get('repo')).toBe('acme/widgets');

    await page.getByRole('group', { name: 'Window' }).getByRole('button', { name: '90 d' }).click();
    await expect(page).toHaveURL(/[?&]window=90d\b/);
    await expect.poll(() => log.queries.at(-1)?.get('window')).toBe('90d');

    await page.getByLabel(/Repository/).fill('globex/api');
    await expect.poll(() => log.queries.at(-1)?.get('repo')).toBe('globex/api');

    await page.getByRole('tab', { name: 'Outcomes' }).click();
    await expect(page).toHaveURL(/[?&]tab=outcomes\b/);
    await expect(page.getByTestId('scorecard-outcomes')).toContainText('Hypotheses checked and met');
  });

  test('phone dark mode has no sideways scroll and keeps HTML labels readable @action:scorecard.phone_dark', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await useTheme(page, 'dark');
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockScorecardApi(page);

    await page.goto('/scorecard');
    await expect(page.getByTestId('scorecard-page')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await sidewaysOverflow(page), 'no sideways scroll at 390px').toBeLessThanOrEqual(0);
    await expect(page.getByTestId('scorecard-station-breakdown').getByText('review')).toBeVisible();
    const labelPx = await page
      .getByTestId('scorecard-station-breakdown')
      .locator('.scorecard-stations__label')
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(labelPx, 'station labels stay legible at 390px').toBeGreaterThanOrEqual(12);

    const result = await runAxe(page, { disableRules: ['color-contrast'] });
    await persistAxeResult('scorecard-phone-dark', result);
    const rendered = await persistRenderedEvidence(page, 'scorecard-phone-dark');
    expect(rendered.geometry.width, 'the Scorecard page rendered on a phone').toBeGreaterThan(0);
    expect(blockingViolations(result).map((v) => `${v.impact ?? '?'} ${v.id}`)).toEqual([]);
  });

  test('System nav and g c reach Scorecard for admins, while other roles are refused @action:scorecard.nav', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });

    await page.goto('/repos');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav.getByRole('button', { name: 'System' }).click();
    await nav.getByRole('link', { name: 'Scorecard', exact: true }).click();
    await expect(page).toHaveURL(/\/scorecard$/);
    await expect(page.getByText('Not available on this server version.')).toBeVisible({
      timeout: 15_000,
    });

    await mockScorecardApi(page);
    await page.keyboard.press('g');
    await page.keyboard.press('c');
    await expect(page).toHaveURL(/\/scorecard$/);
    await expect(page.getByTestId('scorecard-page')).toBeVisible({ timeout: 15_000 });

    await mockBootstrap(page, { auth: { role: 'user' } });
    await mockScorecardForbidden(page);
    await page.goto('/scorecard');
    await expect(page.getByText('Only admins can see the scorecard.')).toBeVisible({
      timeout: 15_000,
    });
    const userNav = page.getByRole('navigation', { name: 'Primary' });
    const system = userNav.getByRole('button', { name: 'System' });
    if ((await system.getAttribute('aria-expanded')) !== 'true') await system.click();
    await expect(userNav.getByRole('link', { name: 'Scorecard', exact: true })).toHaveCount(0);
  });
});
