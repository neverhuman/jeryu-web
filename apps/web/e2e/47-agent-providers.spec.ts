// 47-agent-providers.spec.ts — connect a provider once in Settings: the
// secret goes up once over a CSRF-protected POST and never comes back; a
// disconnect needs a confirmation and is CSRF-protected too.

import { expect, test, type Route } from './fixtures/test';

import { mockBootstrap } from './fixtures/mocks';

/** Not a real credential: a marker the spec looks for on the page. */
const CANARY = ['e2e', 'provider', 'canary'].join('-');

const CONNECTION = {
  id: 'pc_1',
  owner_id: 'user/jeryu-user',
  provider: 'codex',
  provider_account: 'team-key',
  credential_kind: 'api_key',
  state: 'connected',
  connection_generation: 1,
  secret_version: 0,
  created_at: '2026-10-08T00:00:00Z',
  updated_at: '2026-10-08T00:00:00Z',
  refreshed_at: null,
};

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test.describe('Agent providers', () => {
  test('connect a provider once @action:providers.connect', async ({ page }) => {
    await mockBootstrap(page, { login: 'jeryu-user', auth: { role: 'user', csrfToken: 'csrf-user' } });
    let connections: (typeof CONNECTION)[] = [];
    const posts: { csrf: string; body: unknown }[] = [];
    await page.route('**/api/v1/me/provider-connections', async (route, request) => {
      if (request.method() === 'POST') {
        posts.push({ csrf: request.headers()['x-jeryu-csrf'] ?? '', body: request.postDataJSON() });
        connections = [CONNECTION];
        await json(route, CONNECTION, 201);
        return;
      }
      await json(route, { connections });
    });

    await page.goto('/settings');
    const section = page.locator('#agent-providers');
    await expect(section.getByTestId('agent-providers-empty')).toBeVisible();
    const form = page.getByRole('form', { name: 'Connect a provider' });
    await form.getByLabel('Provider').selectOption('codex');
    await form.getByLabel('Account label').fill('team-key');
    await form.getByLabel('Secret').fill(CANARY);
    await form.getByRole('button', { name: 'Connect' }).click();

    await expect(form.getByText('Connected Codex')).toBeVisible();
    expect(posts).toEqual([
      {
        csrf: 'csrf-user',
        body: {
          provider: 'codex',
          provider_account: 'team-key',
          credential_kind: 'api_key',
          secret: CANARY,
        },
      },
    ]);
    await expect(form.getByLabel('Secret')).toHaveValue('');
    const table = section.getByTestId('agent-providers-table');
    await expect(table.getByRole('row', { name: /Codex/ })).toContainText('team-key');
    await expect(page.locator('body')).not.toContainText(CANARY);
  });

  test('sign a subscription in at the provider @action:providers.sign_in', async ({ page }) => {
    await mockBootstrap(page, { login: 'jeryu-user', auth: { role: 'user', csrfToken: 'csrf-user' } });
    const subscription = {
      ...CONNECTION,
      provider: 'claude',
      provider_account: 'max-plan',
      credential_kind: 'oauth_refresh',
    };
    const pending = {
      login_id: 'pl_1',
      provider: 'claude',
      provider_account: 'max-plan',
      state: 'pending',
      interval: 1,
      expires_at: '2026-10-10T20:15:00Z',
      user_code: 'WDJB-MJHT',
      verification_uri: 'https://auth.example/device',
    };
    let connections: unknown[] = [];
    const starts: { csrf: string; body: unknown }[] = [];
    let reads = 0;
    await page.route('**/api/v1/me/provider-connections', (route) => json(route, { connections }));
    await page.route('**/api/v1/me/provider-connections/login', async (route, request) => {
      expect(request.method()).toBe('POST');
      starts.push({ csrf: request.headers()['x-jeryu-csrf'] ?? '', body: request.postDataJSON() });
      await json(route, pending, 201);
    });
    await page.route('**/api/v1/me/provider-connections/login/pl_1', async (route) => {
      reads += 1;
      if (reads < 2) {
        await json(route, pending);
        return;
      }
      connections = [subscription];
      await json(route, { ...pending, state: 'connected', connection: subscription });
    });

    await page.goto('/settings');
    const form = page.getByRole('form', { name: 'Sign in with a subscription' });
    await form.getByLabel('Provider').selectOption('claude');
    await form.getByLabel('Account label').fill('max-plan');
    await form.getByRole('button', { name: 'Sign in' }).click();

    await expect(form.getByTestId('provider-sign-in-code')).toHaveText('WDJB-MJHT');
    await expect(form.getByRole('link', { name: 'https://auth.example/device' })).toHaveAttribute(
      'href',
      'https://auth.example/device'
    );
    await expect(form.getByText('Signed in Claude as max-plan')).toBeVisible({ timeout: 10_000 });
    expect(starts).toEqual([
      { csrf: 'csrf-user', body: { provider: 'claude', provider_account: 'max-plan' } },
    ]);
    const table = page.locator('#agent-providers').getByTestId('agent-providers-table');
    await expect(table.getByRole('row', { name: /Claude/ })).toContainText('Subscription');
  });

  test('disconnect only after a confirmation @action:providers.disconnect', async ({ page }) => {
    await mockBootstrap(page, { login: 'jeryu-user', auth: { role: 'user', csrfToken: 'csrf-user' } });
    let connections = [CONNECTION];
    const deletes: string[] = [];
    await page.route('**/api/v1/me/provider-connections', (route) => json(route, { connections }));
    await page.route('**/api/v1/me/provider-connections/pc_1', async (route, request) => {
      expect(request.method()).toBe('DELETE');
      deletes.push(request.headers()['x-jeryu-csrf'] ?? '');
      connections = [];
      await json(route, { ...CONNECTION, state: 'disconnected', connection_generation: 2 });
    });

    await page.goto('/settings');
    const table = page.getByTestId('agent-providers-table');
    await table.getByRole('button', { name: 'Disconnect Codex team-key' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'stops every running session' })).toBeVisible();
    expect(deletes).toEqual([]);
    await table.getByRole('button', { name: 'Confirm disconnect' }).click();
    await expect(page.getByTestId('agent-providers-empty')).toBeVisible();
    expect(deletes).toEqual(['csrf-user']);
  });
});
