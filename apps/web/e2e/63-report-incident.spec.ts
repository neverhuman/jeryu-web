// 63-report-incident.spec.ts — the Report incident page on `POST /api/v1/incidents`
// mocked at the browser boundary: the form's one required field, the request
// it sends, and what a refused account sees.

import { expect, test, type Route } from './fixtures/test';

import { blockingViolations, runAxe } from './fixtures/accessibility';
import { mockBootstrap } from './fixtures/mocks';

interface Posted {
  body: Record<string, unknown>;
}

async function mockIncidents(page: Parameters<typeof mockBootstrap>[0], status = 201): Promise<Posted[]> {
  const posted: Posted[] = [];
  await page.route('**/api/v1/incidents', async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":{"code":"not_found","message":"no"}}' });
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posted.push({ body });
    if (status !== 201) {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'events_reporter_required', message: 'this account may not post pipeline events' }),
      });
      return;
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ schema_version: '1', ok: true, incident_id: body.incident_id, seqs: [1] }),
    });
  });
  return posted;
}

test.describe('Report incident', () => {
  test('reports an incident with only a summary required, with no a11y blocker @action:incident.report', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    const posted = await mockIncidents(page);

    await page.goto('/report-incident');
    await expect(page.getByTestId('report-incident-page')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Report incident' }).click();
    await expect(page.getByText('Say in one line what is wrong.')).toBeVisible();
    expect(posted).toHaveLength(0);

    await page.getByLabel('Summary').fill('Checkout returns 500');
    await page.getByLabel('Service').fill('checkout');
    await page.getByLabel('Severity').selectOption('high');
    await page.getByLabel('Changes that caused it').fill('lot-1\nlot-2');
    await page.getByRole('button', { name: 'Report incident' }).click();

    await expect(page.getByTestId('report-incident-done')).toContainText('inc-');
    expect(posted).toHaveLength(1);
    expect(posted[0]?.body).toMatchObject({
      summary: 'Checkout returns 500',
      service: 'checkout',
      severity: 'high',
      changes: ['lot-1', 'lot-2'],
    });
    expect(String(posted[0]?.body.incident_id)).toMatch(/^inc-[A-Za-z0-9._:-]+$/);

    const result = await runAxe(page, { disableRules: ['color-contrast'] });
    expect(blockingViolations(result).map((v) => `${v.impact ?? '?'} ${v.id}`)).toEqual([]);
  });

  test('says an account that may not report is not allowed, and the System nav leads here @action:incident.report_refused', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockIncidents(page, 403);

    await page.goto('/repos');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav.getByRole('button', { name: 'System' }).click();
    await nav.getByRole('link', { name: 'Report incident', exact: true }).click();
    await expect(page).toHaveURL(/\/report-incident$/);

    await page.getByLabel('Summary').fill('Checkout returns 500');
    await page.getByRole('button', { name: 'Report incident' }).click();
    await expect(page.getByText('You are not allowed to report incidents.')).toBeVisible();
  });
});
