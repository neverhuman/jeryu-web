import { readFileSync } from 'node:fs';

import type { ExternalWorkSnapshot } from '../src/api/types';
import { EXTERNAL_WORK } from '../src/pages/__tests__/externalWorkTestData';
import { FLOW_REPORT } from '../src/pages/__tests__/flowTestData';
import { expect, test } from './fixtures/test';
import { blockingViolations, persistAxeResult, persistRenderedEvidence, runAxe } from './fixtures/accessibility';
import { mockBootstrap } from './fixtures/mocks';
import { mockPullRoom } from './fixtures/pullRoomMocks';

// An optional operator-supplied capture exercises a real plan without publishing private fixtures.
const captured = process.env.EXTERNAL_WORK_PREVIEW_FILE;
const snapshot: ExternalWorkSnapshot = captured ? JSON.parse(readFileSync(captured, 'utf8')) : EXTERNAL_WORK;

test('External Flow preserves waves and parent followups without native events', async ({ page }) => {
  await mockBootstrap(page);
  const report = { ...FLOW_REPORT, family: snapshot.family, lots: [],
    stations: FLOW_REPORT.stations.map((station) => ({ ...station, wip: { active: 0, waiting: 0, held: 0 } })),
    external_work: { snapshots: [snapshot], problems: [] } };
  await page.route('**/api/v1/flow**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) }));
  await page.goto(`/flow?family=${snapshot.family}&station=queue`);
  await expect(page.getByTestId('external-task-plan')).toBeVisible();
  await expect(page.getByText('Nothing is in progress.')).toHaveCount(0);
  await expect(page.getByText('W0 · Foundations', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /API-01-F01/ }).first()).toBeVisible();
  await page.getByLabel('Only needs human').check();
  await expect(page.getByText('Needs human', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /API-01-F01/ })).toHaveCount(0);
  await page.getByLabel('Only needs human').uncheck();
  await page.getByText('Milestones and exit criteria').click();
  await expect(page.getByText(/exit criteria unassessed/).first()).toBeVisible();
  const rows=page.getByTestId('external-task-plan').locator('tbody tr');
  await rows.first().focus();await page.keyboard.press('j');await expect(rows.nth(1)).toBeFocused();
  const axe=await runAxe(page,{ include:'[data-testid="external-task-plan"]' });
  await persistAxeResult(captured ? 'external-real-plan' : 'external-plan',axe);
  expect(blockingViolations(axe)).toEqual([]);
  await page.evaluate(()=>window.scrollTo(0,0));
  const rendered=await persistRenderedEvidence(page, captured ? 'external-real-plan' : 'external-plan');
  expect(rendered.design_tokens.space_4).not.toBe('');
});

test('External origin branches show comparison and separate pull request state', async ({ page }) => {
  await mockBootstrap(page);
  await mockPullRoom(page);
  await page.route('**/api/v1/flow**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...FLOW_REPORT, external_work: { snapshots: [snapshot], problems: [] } }) }));
  await page.goto(`/in-flight?family=${snapshot.family}`);
  await expect(page.getByTestId('external-branches')).toBeVisible();
  await page.getByLabel('Include merged and closed branches').check();
  const table=page.getByRole('table', { name: 'External origin branches' });
  await expect(table.locator('tbody tr')).toHaveCount(snapshot.branches.length);
  const first=snapshot.branches[0];
  await expect(table.getByRole('link', { name: first.name, exact: true })).toHaveAttribute('href', first.url);
  const axe=await runAxe(page,{ include:'[data-testid="external-branches"]' });
  await persistAxeResult(captured ? 'external-real-origin' : 'external-origin',axe);
  expect(blockingViolations(axe)).toEqual([]);
  await page.evaluate(()=>window.scrollTo(0,0));
  const rendered=await persistRenderedEvidence(page,captured ? 'external-real-origin' : 'external-origin');
  expect(rendered.design_tokens.color_bg_0).not.toBe('');
});
