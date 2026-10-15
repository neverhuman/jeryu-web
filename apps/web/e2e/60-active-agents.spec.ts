import { expect, test, type Page } from './fixtures/test';
import { blockingViolations, persistAxeResult, persistRenderedEvidence, runAxe } from './fixtures/accessibility';
import { mockBootstrap, mockCompanionShell, mockRepoList } from './fixtures/mocks';

async function seed(page: Page, login = 'ada', role: 'admin' | 'user' = 'user'): Promise<void> {
  await mockBootstrap(page, { login, auth: { role } });
  await mockRepoList(page, [{ id: { host: 'forge', owner: 'acme', name: 'widgets' }, default_branch: 'main', visibility: 'public', family: 'acme' }]);
  await mockCompanionShell(page);
  await page.route('**/api/v1/agent-presence?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const filtered = params.get('agent') === 'agy';
    const second = params.get('page') === '2';
    const agents = filtered ? ['agy'] : second ? ['cursor'] : ['claude-code', 'codex', 'cursor', 'grok', 'agy'];
    const items = agents.map((agent, index) => ({
      id: `external:${agent}`, session_id: agent, source: 'external', agent,
      state: 'idle', reporter: 'ada', operator: 'ada', host: 'xbabe2',
      branch: 'ada/agents', last_active_at: Date.now(), links: {}, collides_with: [],
      repos: index === 4 ? [] : ['acme/widgets'], families: index === 4 ? [] : ['acme'],
      location: { session_path: `/home/ada/.${agent}/sessions/${'long-native-session-'.repeat(5)}data.jsonl`, checkout_path: '/src/widgets/.agent/worktrees/agents', checkout_kind: 'worktree', cwd: '/src/widgets/.agent/worktrees/agents/src', screen: '123.agents' },
    }));
    const total = filtered ? 1 : 51;
    await route.fulfill({ json: { items, total, page: { page: second ? 2 : 1, limit: 50, total, has_more: !filtered && !second } } });
  });
}

test('global inventory links from System and filters, pages and opens by keyboard @action:agents.global_inventory', async ({ page }) => {
  await seed(page);
  await page.goto('/agents');
  await expect(page.getByRole('heading', { name: 'Active agents', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Active agents', exact: true }).first()).toHaveAttribute('href', '/agents');
  const list = page.getByTestId('agents-presence-list');
  await expect(list.getByRole('listitem')).toHaveCount(5);
  await expect(list).toContainText('No repository assigned');
  await expect(list).toContainText('/src/widgets/.agent/worktrees/agents');
  await expect(list).toContainText('123.agents');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(list.getByRole('listitem')).toHaveCount(5);
  await page.getByRole('combobox', { name: 'Harness', exact: true }).selectOption('agy');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/agent=agy/);
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Harness', exact: true })).toHaveValue('agy');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(5);
  await list.getByRole('listitem').first().focus();
  await page.keyboard.press('j');
  await expect(list.getByRole('listitem').nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/repos\/forge\/acme\/widgets\/agents$/);
});

test('global inventory wraps native paths on a phone @a11y @action:agents.global_phone', async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/agents');
  await expect(page.getByTestId('agents-presence-list')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const result = await runAxe(page, { include: '[data-testid="active-agents-page"]' });
  await persistAxeResult('active-agents-phone', result);
  await persistRenderedEvidence(page, 'active-agents-phone');
  expect(blockingViolations(result).map((v) => v.id)).toEqual([]);
});


test('global private metadata is visible only to reporter or admin @action:agents.global_privacy', async ({ page }) => {
  // Deliberately over-return private fields: the browser also hides them for
  // another viewer. Server authorization remains the actual access boundary.
  await seed(page, 'grace');
  await page.goto('/agents');
  await expect(page.getByTestId('agents-presence-list').getByRole('listitem')).toHaveCount(5);
  await expect(page.locator('[data-testid^="presence-location-"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="presence-host-"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Active agents', exact: true }).first()).toBeVisible();
  await seed(page, 'root', 'admin');
  await page.reload();
  await expect(page.locator('[data-testid^="presence-location-"]')).toHaveCount(5);
  await expect(page.locator('[data-testid^="presence-host-"]')).toHaveCount(5);
});
