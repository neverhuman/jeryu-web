import { expect, test } from './fixtures/test';
import { mockBootstrap } from './fixtures/mocks';
import { attentionBody, mockPipelineApi } from './fixtures/pipelineMocks';

test('personal blocks, and every block on the All tab @action:needs_you.personal @action:blocked.family', async ({ page }) => {
  await mockBootstrap(page, { login: 'operator', auth: { role: 'admin' } });
  await mockPipelineApi(page);
  const template = (attentionBody().items as Array<Record<string, unknown>>)[2];
  const rows = [
    { id: 'other', family: 'acme', requested_by: 'someone', assignee: null },
    { id: 'assigned', family: 'acme', requested_by: 'someone', assignee: 'operator' },
    { id: 'filed', family: 'globex', requested_by: 'operator', assignee: null },
    { id: 'waiting', family: 'globex', requested_by: 'someone', assignee: 'operator', kind: 'todo_waiting_on_blocker', severity: 'watch' },
  ].map((row) => ({ ...template, ...row, title: `Block ${row.id}`, todo_id: row.id }));
  await page.route(/\/api\/v1\/attention(\?.*)?$/, (route) => route.fulfill({
    json: { generated_at: new Date().toISOString(), counts: { critical: 0, action: 3, watch: 1 }, items: rows },
  }));
  await page.goto('/needs-you');
  await expect(page.getByRole('heading', { name: 'Needs you', exact: true })).toBeVisible();
  await expect(page.getByTestId('needs-you-item-other')).toHaveCount(0);
  await expect(page.getByTestId('needs-you-item-assigned')).toBeVisible();
  await expect(page.getByTestId('needs-you-item-filed')).toBeVisible();
  await expect(page.getByTestId('needs-you-badge')).toHaveText('2');
  await page.getByTestId('needs-you-watch').locator(':scope > summary').click();
  await expect(page.getByTestId('needs-you-item-waiting')).toBeVisible();
  await page.getByTestId('needs-you-page').screenshot({ path: 'playwright-report/personal-attention.png' });

  await page.getByTestId('needs-you-tabs').getByRole('link', { name: 'All', exact: true }).click();
  await expect(page).toHaveURL(/\/needs-you\?view=all$/);
  await expect(page.getByTestId('needs-you-tabs-all')).toHaveAttribute('aria-current', 'page');
  for (const id of ['other', 'assigned', 'filed']) {
    await expect(page.getByTestId(`needs-you-item-${id}`)).toBeVisible();
  }
  await page.getByTestId('needs-you-item-other').getByRole('button', { name: 'Show only acme' }).click();
  await expect(page).toHaveURL(/\/needs-you\?view=all&family=acme$/);
  await expect(page.getByTestId('needs-you-item-other')).toBeVisible();
  await expect(page.getByTestId('needs-you-item-assigned')).toBeVisible();
  await expect(page.getByTestId('needs-you-item-filed')).toHaveCount(0);
  await expect(page.getByTestId('needs-you-item-waiting')).toHaveCount(0);
  await expect(page.getByTestId('needs-you-badge')).toHaveText('1');
  await page.reload();
  await expect(page.getByTestId('needs-you-item-other')).toBeVisible();
  await page.getByTestId('needs-you-item-other').getByRole('button', { name: 'Showing only acme: show every family' }).click();
  await expect(page.getByTestId('needs-you-item-filed')).toBeVisible();
  await page.getByTestId('needs-you-page').screenshot({ path: 'playwright-report/blocked-attention.png' });
});

test('another role sees neither admin attention destination @action:blocked.permission', async ({ page }) => {
  await mockBootstrap(page, { login: 'reader', auth: { role: 'user' } });
  await mockPipelineApi(page);
  await page.goto('/repos');
  await expect(page.getByRole('link', { name: 'Needs you', exact: true })).toHaveCount(0);
  // The old Blocked address still answers, with the same refusal.
  await page.goto('/blocked');
  await expect(page.getByRole('alert')).toHaveText('Only admins can see the Needs you list.');
  await expect(page.getByTestId('needs-you-item-other')).toHaveCount(0);
});
