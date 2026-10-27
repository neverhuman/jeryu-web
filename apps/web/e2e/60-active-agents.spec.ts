import { expect, test, type Page } from './fixtures/test';
import { blockingViolations, persistAxeResult, persistRenderedEvidence, runAxe } from './fixtures/accessibility';
import { mockBootstrap, mockCompanionShell, mockRepoList } from './fixtures/mocks';

// One session names a model long enough to have to wrap inside a card.
const LONG_MODEL = 'model-with-a-rather-long-release-name-2026-10-27-preview';

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
      model: index === 0 ? LONG_MODEL : null,
      state: 'idle', reporter: 'ada', operator: 'ada', host: 'xbabe2',
      branch: 'ada/agents', started_at: Date.now() - (index + 2) * 3_600_000, last_active_at: Date.now(), links: {}, collides_with: [],
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
  await expect(page.getByRole('heading', { name: 'Agents', exact: true, level: 1 })).toBeVisible();
  // One System destination, lit on each of its three tabs.
  const navAgents = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Agents', exact: true });
  await expect(navAgents).toHaveAttribute('href', '/agents');
  await expect(navAgents).toHaveAttribute('aria-current', 'page');
  const tabs = page.getByTestId('agents-tabs');
  await expect(tabs.getByRole('link', { name: 'Running' })).toHaveAttribute('aria-current', 'page');
  await expect(tabs.getByRole('link', { name: 'Your sessions' })).toHaveAttribute('href', '/sessions');
  await expect(tabs.getByRole('link', { name: 'Enrolled' })).toHaveAttribute('href', '/bots');
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


test('agents show robot avatars and a timeline, as a list or as cards @a11y @action:agents.global_views', async ({ page }) => {
  await seed(page);
  await page.goto('/agents');
  const list = page.getByTestId('agents-presence-list');
  await expect(list.getByRole('listitem')).toHaveCount(5);
  // List is the default view: a badge avatar on every row and a timeline strip in a 24 hour window.
  await expect(page.getByTestId('agents-view-list')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid^="presence-avatar-"] svg.agent-avatar--badge')).toHaveCount(5);
  await expect(page.locator('[data-testid^="presence-timeline-bar-"]')).toHaveCount(5);
  // Each bar is drawn on its strip with real width: first seen hours ago, active until now.
  for (const bar of await page.locator('[data-testid^="presence-timeline-bar-"]').all()) {
    const box = await bar.boundingBox();
    const strip = await bar.locator('..').boundingBox();
    expect(box!.width).toBeGreaterThan(4);
    expect(box!.x + box!.width).toBeLessThanOrEqual(strip!.x + strip!.width + 1);
  }
  await expect(page.getByTestId('presence-timeline-axis')).toBeVisible();
  await expect(page.getByTestId('agents-timeline-span')).toHaveValue('24h');
  await expect(page.getByTestId('presence-timeline-external:codex')).toHaveAttribute('aria-label', /idle since/);

  // Switching the view keeps a filter typed but not yet applied.
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('widgets');
  await page.getByTestId('agents-view-cards').click();
  await expect(page).toHaveURL(/view=cards/);
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('widgets');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('');
  const cards = page.getByTestId('agent-cards');
  await expect(cards.getByRole('listitem')).toHaveCount(5);
  await expect(cards.locator('svg.agent-avatar:not(.agent-avatar--badge)')).toHaveCount(5);
  // The model is its own badge, and a long one wraps inside the card instead of spilling out.
  const badge = page.getByTestId('agent-card-model-external:claude-code');
  await expect(badge).toHaveText(LONG_MODEL);
  await expect(page.getByTestId('agent-card-model-external:codex')).toHaveCount(0);
  const badgeBox = await badge.boundingBox();
  const cardBox = await page.getByTestId('agent-card-external:claude-code').boundingBox();
  expect((badgeBox?.x ?? 0) + (badgeBox?.width ?? 0)).toBeLessThanOrEqual((cardBox?.x ?? 0) + (cardBox?.width ?? 0));
  await expect(page.getByTestId('agents-presence-list')).toHaveCount(0);
  const result = await runAxe(page, { include: '[data-testid="active-agents-page"]' });
  await persistAxeResult('active-agents-cards', result);
  await persistRenderedEvidence(page, 'active-agents-cards');
  expect(blockingViolations(result).map((v) => v.id)).toEqual([]);

  // A filter choice applies at once, and the view and timeline span survive it and a reload.
  await page.getByTestId('agents-timeline-span').selectOption('7d');
  await expect(page).toHaveURL(/span=7d/);
  // Choosing applies at once and keeps keyboard focus on the list that was used.
  const harness = page.getByRole('combobox', { name: 'Harness', exact: true });
  await harness.focus();
  // A mark on the DOM node survives only if applying the choice does not remount the list.
  await harness.evaluate((node) => node.setAttribute('data-probe', 'kept'));
  await harness.selectOption('agy');
  await expect(page).toHaveURL(/agent=agy/);
  await expect(cards.getByRole('listitem')).toHaveCount(1);
  await expect(harness).toHaveAttribute('data-probe', 'kept');
  await expect(harness).toBeFocused();
  await page.getByRole('combobox', { name: 'Source', exact: true }).selectOption('external');
  await expect(page).toHaveURL(/source=external/);
  await expect(page).toHaveURL(/agent=agy/);
  await expect(page).toHaveURL(/view=cards/);
  await expect(page).toHaveURL(/span=7d/);
  await page.reload();
  await expect(cards.getByRole('listitem')).toHaveCount(1);
  // Each card says where its strip starts, since a grid has no shared axis.
  await expect(cards.getByRole('listitem').first()).toContainText('7 days ago');
  await page.getByTestId('agents-view-list').click();
  await expect(page).not.toHaveURL(/view=/);
  await expect(page.getByTestId('agents-presence-list').getByRole('listitem')).toHaveCount(1);

  // Cards are keyboard rows like the list: j moves, Enter opens the repository.
  await page.goto('/agents?view=cards');
  await expect(cards.getByRole('listitem')).toHaveCount(5);
  await cards.getByRole('listitem').first().focus();
  await page.keyboard.press('j');
  await expect(cards.getByRole('listitem').nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/repos\/forge\/acme\/widgets\/agents$/);
});

test('global private metadata is visible only to reporter or admin @action:agents.global_privacy', async ({ page }) => {
  // Deliberately over-return private fields: the browser also hides them for
  // another viewer. Server authorization remains the actual access boundary.
  await seed(page, 'grace');
  await page.goto('/agents');
  await expect(page.getByTestId('agents-presence-list').getByRole('listitem')).toHaveCount(5);
  await expect(page.locator('[data-testid^="presence-location-"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="presence-host-"]')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Agents', exact: true })).toBeVisible();
  await seed(page, 'root', 'admin');
  await page.reload();
  await expect(page.locator('[data-testid^="presence-location-"]')).toHaveCount(5);
  await expect(page.locator('[data-testid^="presence-host-"]')).toHaveCount(5);
});
