// 48-access-tokens.spec.ts — personal access tokens in Settings: a new token
// is shown once after a CSRF-protected POST and is gone after "Done"; a
// revoke needs a confirmation and is CSRF-protected too.

import { expect, test, type Route } from './fixtures/test';

import { mockBootstrap } from './fixtures/mocks';

/** Not a real credential: a marker the spec looks for on the page. */
const CANARY = ['e2e', 'token', 'canary'].join('-');

const TOKEN = {
  id: 'tok_1',
  name: 'laptop CLI',
  createdAt: '2026-10-08T00:00:00Z',
  expiresAt: '2027-01-06T00:00:00Z',
};

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test.describe('Access tokens', () => {
  test('create a token and see it once @action:tokens.create', async ({ page }) => {
    await mockBootstrap(page, { login: 'jeryu-user', auth: { role: 'user', csrfToken: 'csrf-user' } });
    let tokens: (typeof TOKEN)[] = [];
    const posts: { csrf: string; body: { name?: string } }[] = [];
    await page.route('**/api/v1/auth/tokens', async (route, request) => {
      if (request.method() === 'POST') {
        posts.push({ csrf: request.headers()['x-jeryu-csrf'] ?? '', body: request.postDataJSON() });
        tokens = [TOKEN];
        await json(route, { id: TOKEN.id, token: CANARY, name: TOKEN.name, expiresAt: TOKEN.expiresAt });
        return;
      }
      await json(route, tokens);
    });

    await page.goto('/settings');
    const section = page.locator('#access-tokens');
    await expect(section.getByTestId('access-tokens-empty')).toBeVisible();
    const form = page.getByRole('form', { name: 'Create an access token' });
    await form.getByLabel('Token name').fill('laptop CLI');
    await form.getByRole('button', { name: 'Create token' }).click();

    const created = section.getByTestId('access-token-created');
    await expect(created.getByRole('textbox')).toHaveValue(CANARY);
    expect(posts).toHaveLength(1);
    expect(posts[0].csrf).toBe('csrf-user');
    expect(posts[0].body.name).toBe('laptop CLI');
    await expect(section.getByTestId('access-tokens-table')).toContainText('laptop CLI');
    await created.getByRole('button', { name: 'Done' }).click();
    await expect(created).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(CANARY);
  });

  test('revoke only after a confirmation @action:tokens.revoke', async ({ page }) => {
    await mockBootstrap(page, { login: 'jeryu-user', auth: { role: 'user', csrfToken: 'csrf-user' } });
    let tokens = [TOKEN];
    const deletes: string[] = [];
    await page.route('**/api/v1/auth/tokens', (route) => json(route, tokens));
    await page.route('**/api/v1/auth/tokens/tok_1', async (route, request) => {
      expect(request.method()).toBe('DELETE');
      deletes.push(request.headers()['x-jeryu-csrf'] ?? '');
      tokens = [];
      await route.fulfill({ status: 204, body: '' });
    });

    await page.goto('/settings');
    const table = page.getByTestId('access-tokens-table');
    await table.getByRole('button', { name: 'Revoke laptop CLI' }).click();
    expect(deletes).toEqual([]);
    await table.getByRole('button', { name: 'Confirm revoke' }).click();
    await expect(page.getByTestId('access-tokens-empty')).toBeVisible();
    expect(deletes).toEqual(['csrf-user']);
  });
});
