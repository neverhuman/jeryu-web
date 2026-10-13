// 23-auth-hardening.spec.ts — public portal auth/data-isolation browser proof.
//
// The BFF e2e harness usually runs with local-dev trust enabled, so this spec
// mocks the auth endpoints at the browser network boundary. That still drives
// the real AuthProvider, AuthPage, fetch client, AppShell gate, settings panel,
// and repositories index without depending on mutable backend accounts.

import { expect, test, type Page, type Route } from './fixtures/test';

import { mockBootstrap, mockRepoList, mockSignupPolicy } from './fixtures/mocks';

test.describe.configure({ retries: 1 });

interface AuthUserWire {
  login: string;
  role: 'admin' | 'user';
  mustChangePassword: boolean;
  csrfToken?: string | null;
}

const splitRepos = [
  {
    id: { host: 'forge.example', owner: 'acme', name: 'acme-core' },
    family: 'acme-split',
    description: 'Granted core repository.',
  },
  {
    id: { host: 'forge.example', owner: 'acme', name: 'acme-web' },
    family: 'acme-split',
    description: 'Granted web repository.',
  },
];
const loginFormCredential = 'auth-form-input-0001';
const signupFormCredential = 'signup-form-input-0001';
const signupLinkToken = 'signup-link-token-0001';
const externalWaitlistUrl = 'https://waitlist.example.com/join';
const shownOneTimeValue = 'one-time-shown-0001';
const currentPasswordValue = 'initial-password-123';
const replacementPasswordValue = 'replacement-password-456';

test.describe('Auth hardening browser proof', () => {
  test('signed-out visitor logs in and sees only granted split repositories @action:auth.login @action:authz.granted_repos_only', async ({
    page,
  }) => {
    await mockBootstrap(page, { login: 'jordanh', auth: null });
    await mockAuthMe(page, null);
    await mockRepoList(page, splitRepos);

    const loginBodies: unknown[] = [];
    await page.route('**/api/v1/auth/login', async (route, request) => {
      loginBodies.push(request.postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          login: 'jordanh',
          role: 'user',
          mustChangePassword: false,
          csrfToken: 'csrf-jordanh',
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Git for agents.' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('A home for agent work.', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: /From intent/ })).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveCount(0);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('tab', { name: 'Login' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await page.getByLabel('Username').fill('jordanh');
    await page.getByLabel('Password').fill(loginFormCredential);
    await page.getByLabel('Remember me').check();
    await page.getByRole('button', { name: 'Login' }).click();

    // A non-admin lands on the repositories index: the one page every role may
    // read, on any install, with no family baked into the shell.
    await expect(page).toHaveURL(/\/repos$/, { timeout: 10_000 });
    const repositories = page.getByTestId('repositories-page');
    await expect(repositories).toBeVisible({ timeout: 10_000 });
    await expect(repositories).toContainText('acme-core');
    await expect(repositories).toContainText('acme-web');
    await expect(repositories).not.toContainText('acme-deploy');
    expect(loginBodies).toEqual([
      { login: 'jordanh', password: loginFormCredential, rememberMe: true },
    ]);
  });

  test('signed-out deep link opens login and lands on the link after auth @action:auth.deep_link_return', async ({
    page,
  }) => {
    await mockBootstrap(page, { login: 'jordanh', auth: null });
    await mockAuthMe(page, null);
    await mockRepoList(page, splitRepos);
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          login: 'jordanh',
          role: 'user',
          mustChangePassword: false,
          csrfToken: 'csrf-jordanh',
        }),
      });
    });
    const signedOutCalls: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) signedOutCalls.push(url.pathname);
    });

    await page.goto('/repos/family/acme-split?view=list');
    await expect(page).toHaveURL(
      /\/login\?next=%2Frepos%2Ffamily%2Facme-split%3Fview%3Dlist$/,
      { timeout: 10_000 }
    );
    await expect(page.getByRole('status')).toContainText(
      'Log in to continue to /repos/family/acme-split?view=list'
    );
    // Signed out, the only API call is the one that learns it.
    expect(signedOutCalls.filter((path) => path !== '/api/v1/auth/me')).toEqual([]);

    await page.getByLabel('Username').fill('jordanh');
    await page.getByLabel('Password').fill(loginFormCredential);
    await page.getByRole('button', { name: 'Login' }).click();

    // The family address is a doorway: it lands on a member, and the family
    // is the rail beside it.
    await expect(page).toHaveURL(/\/repos\/forge\.example\/acme\/acme-core$/, {
      timeout: 10_000,
    });
    await expect(page.getByTestId('repo-family-rail')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('repo-family-member-acme-web')).toBeVisible();
  });

  test('closed sign-up sends a visitor to the waitlist and never posts a sign-up @action:auth.signup_waitlist', async ({ page }) => {
    await mockBootstrap(page, { login: 'jepsont', auth: null });
    await mockAuthMe(page, null);
    await mockSignupPolicy(page, { mode: 'closed', waitlistUrl: externalWaitlistUrl });
    const signupPosts: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() === 'POST' && path.startsWith('/api/v1/auth/signup')) {
        signupPosts.push(path);
      }
    });

    await page.goto('/signup');
    await expect(page.getByRole('tab', { name: 'Sign up' })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 10_000 }
    );
    const closed = page.getByTestId('signup-closed');
    await expect(closed).toContainText('JeRyū is invite-only for now.');
    const join = closed.getByRole('link', { name: 'Join the waitlist' });
    await expect(join).toHaveAttribute('href', externalWaitlistUrl);
    await expect(join).toHaveAttribute('rel', 'noopener');
    await expect(closed).toContainText('Opens waitlist.example.com, a separate site.');
    await expect(page.getByLabel('Email')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send sign-up link' })).toHaveCount(0);

    // The landing waitlist page links to the same external list instead of a form.
    await page.goto('/waitlist');
    const external = page.getByTestId('waitlist-external');
    await expect(external.getByRole('link', { name: 'Join the waitlist' })).toHaveAttribute(
      'href',
      externalWaitlistUrl,
      { timeout: 10_000 }
    );
    await expect(page.getByLabel('Email')).toHaveCount(0);
    expect(signupPosts).toEqual([]);
  });

  test('new signup proves its email first and receives no repository visibility by default @action:auth.signup @action:authz.signup_no_repos', async ({ page }) => {
    await mockBootstrap(page, { login: 'jepsont', auth: null });
    await mockAuthMe(page, null);
    await mockRepoList(page, []);
    await mockSignupPolicy(page, { mode: 'email', waitlistUrl: null });

    const startBodies: unknown[] = [];
    await page.route('**/api/v1/auth/signup/start', async (route, request) => {
      startBodies.push(request.postDataJSON());
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ result: 'sent' }),
      });
    });
    const signupBodies: unknown[] = [];
    await page.route('**/api/v1/auth/signup', async (route, request) => {
      signupBodies.push(request.postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          login: 'jepsont',
          role: 'user',
          mustChangePassword: false,
          csrfToken: 'csrf-jepsont',
        }),
      });
    });

    // Step one: an address, and nothing else.
    await page.goto('/signup');
    await expect(page.locator('.marketing-scene')).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole('heading', { name: 'Git for agents.' })
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Sign up' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByLabel('Remember me')).toHaveCount(0);
    await expect(page.getByLabel('Username')).toHaveCount(0);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await page.getByLabel('Email').fill('jepsont@example.com');
    await page.getByRole('button', { name: 'Send sign-up link' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Check your email. A link to finish creating your account is on its way; it works for one day.'
    );
    expect(startBodies).toEqual([{ email: 'jepsont@example.com' }]);
    expect(signupBodies).toEqual([]);

    // Step two: the mailed link opens the page that creates the account.
    await page.goto(`/create-account?token=${signupLinkToken}`);
    await expect(
      page.getByRole('heading', { name: 'Finish creating your account' })
    ).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Username').fill('jepsont');
    await page.getByLabel('Password', { exact: true }).fill(signupFormCredential);
    await page.getByLabel('Repeat password').fill(signupFormCredential);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/repos$/, { timeout: 10_000 });
    await expect(page.getByText('No repositories match')).toBeVisible();
    expect(signupBodies).toEqual([
      { token: signupLinkToken, login: 'jepsont', password: signupFormCredential },
    ]);
  });

  test('authenticated visitors are redirected away from auth routes', async ({
    page,
  }) => {
    await mockBootstrap(page, { login: 'jordanh', auth: null });
    await mockAuthMe(page, {
      login: 'jordanh',
      role: 'user',
      mustChangePassword: false,
      csrfToken: 'csrf-jordanh',
    });
    await mockRepoList(page, splitRepos);

    await page.goto('/login');
    await expect(page).toHaveURL(/\/repos$/, { timeout: 10_000 });
    await expect(page.getByTestId('repositories-page')).toBeVisible({
      timeout: 10_000,
    });

    await page.goto('/signup');
    await expect(page).toHaveURL(/\/repos$/, { timeout: 10_000 });
    await expect(page.getByTestId('repositories-page')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('forced password change sends CSRF @action:auth.force_password_change', async ({
    page,
  }) => {
    await mockBootstrap(page, { login: 'jordanh', auth: null });
    await mockAuthMe(page, {
      login: 'jordanh',
      role: 'user',
      mustChangePassword: true,
      csrfToken: 'csrf-temp',
    });
    await mockRepoList(page, splitRepos);

    let csrfHeader: string | null = null;
    await page.route('**/api/v1/auth/password', async (route, request) => {
      csrfHeader = request.headers()['x-jeryu-csrf'] ?? null;
      expect(request.postDataJSON()).toEqual({
        currentPassword: currentPasswordValue,
        newPassword: replacementPasswordValue,
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          login: 'jordanh',
          role: 'user',
          mustChangePassword: false,
          csrfToken: 'csrf-after-change',
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Change password' })).toBeVisible({
      timeout: 10_000,
    });
    const passwordFields = page.locator('input[type="password"]');
    await expect(passwordFields).toHaveCount(2);
    await passwordFields.first().fill(currentPasswordValue);
    await page.getByLabel('New password').fill(replacementPasswordValue);
    await page.getByRole('button', { name: 'Change password' }).click();

    await expect(page.getByTestId('repositories-page')).toBeVisible({
      timeout: 10_000,
    });
    expect(csrfHeader).toBe('csrf-temp');
  });

  test('admin reset and repo grant use CSRF-protected mutations @action:admin.reset_password_success @action:admin.grant_repo_success', async ({
    page,
  }) => {
    await mockBootstrap(page, { login: 'jeryu-admin', auth: null });
    await mockAuthMe(page, {
      login: 'jeryu-admin',
      role: 'admin',
      mustChangePassword: false,
      csrfToken: 'csrf-admin',
    });
    await mockRepoList(page, []);

    const unsafeCsrfHeaders: string[] = [];
    await mockAdminUsers(page);
    const resetBodies: unknown[] = [];
    await page.route(
      /\/api\/v1\/admin\/users\/[^/]+\/reset-password$/,
      async (route, request) => {
        unsafeCsrfHeaders.push(request.headers()['x-jeryu-csrf'] ?? '');
        resetBodies.push(request.postDataJSON());
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({
            result: 'sent',
            login: 'jordanh',
            email: 'jordanh@example.com',
          }),
        });
      }
    );
    let grants: Array<Record<string, string>> = [];
    await mockRepoGrants(page, () => grants);
    await page.route(
      /\/api\/v1\/admin\/repos\/[^/]+\/[^/]+\/grants\/[^/]+$/,
      async (route, request) => {
        unsafeCsrfHeaders.push(request.headers()['x-jeryu-csrf'] ?? '');
        expect(request.method()).toBe('POST');
        expect(request.postDataJSON()).toEqual({ access: 'read' });
        grants = [repoGrant('jordanh', 'read')];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(grants[0]),
        });
      }
    );

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible({
      timeout: 10_000,
    });
    const users = page.getByTestId('admin-users-table');
    await expect(users.getByRole('row', { name: /jordanh/ })).toContainText('none');
    await users.getByRole('button', { name: 'Reset password' }).click();
    const resetForm = page.getByRole('form', { name: 'Reset the password of jordanh' });
    await expect(resetForm).toContainText('They sign in with it and must choose a new password.');
    await resetForm
      .getByLabel('Where should the temporary password go?')
      .fill('jordanh@example.com');
    await resetForm.getByRole('button', { name: 'Email a temporary password' }).click();
    await expect(page.getByTestId('reset-sent-jordanh')).toHaveText(
      'Sent to jordanh@example.com. jordanh must choose a new password at next sign-in.'
    );
    expect(resetBodies).toEqual([{ email: 'jordanh@example.com' }]);

    const accessRegion = page.getByRole('region', { name: 'Repository access' });
    await accessRegion.getByRole('textbox', { name: 'Owner' }).fill('acme');
    await accessRegion.getByRole('textbox', { name: 'Repo' }).fill('acme-web');
    await expect(accessRegion.getByText('No one has been granted access to acme/acme-web.')).toBeVisible();
    await accessRegion.getByRole('textbox', { name: 'User' }).fill('jordanh');
    await accessRegion.getByRole('radio', { name: 'read' }).click();
    const grantButton = accessRegion.getByRole('button', { name: 'Grant access' });
    await expect(grantButton).not.toHaveClass(/action-button--primary/);
    await grantButton.click();
    await expect(page.getByText('Granted', { exact: true })).toBeVisible();
    await expect(
      accessRegion.getByTestId('repo-grants-table').getByRole('rowheader', { name: 'jordanh' })
    ).toBeVisible();
    expect(unsafeCsrfHeaders).toEqual(['csrf-admin', 'csrf-admin']);
  });

  test('admin reset with no mail shows the one-time password to hand over @action:admin.reset_password_shown', async ({
    page,
  }) => {
    await mockBootstrap(page, { login: 'jeryu-admin', auth: null });
    await mockAuthMe(page, {
      login: 'jeryu-admin',
      role: 'admin',
      mustChangePassword: false,
      csrfToken: 'csrf-admin',
    });
    await mockRepoList(page, []);
    await mockAdminUsers(page);
    const resetBodies: unknown[] = [];
    await page.route(
      /\/api\/v1\/admin\/users\/[^/]+\/reset-password$/,
      async (route, request) => {
        expect(request.headers()['x-jeryu-csrf']).toBe('csrf-admin');
        resetBodies.push(request.postDataJSON());
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: 'shown',
            login: 'jordanh',
            password: shownOneTimeValue,
            email: null,
            mailError: 'mail server refused the message',
          }),
        });
      }
    );

    await page.goto('/settings');
    const users = page.getByTestId('admin-users-table');
    await users.getByRole('button', { name: 'Reset password' }).click({ timeout: 10_000 });
    const resetForm = page.getByRole('form', { name: 'Reset the password of jordanh' });
    // No address: the forge may have no mail, so the field is optional.
    await expect(
      resetForm.getByLabel('Where should the temporary password go?')
    ).not.toHaveAttribute('required', '');
    await resetForm.getByRole('button', { name: 'Email a temporary password' }).click();

    const shown = page.getByRole('region', { name: 'One-time password for jordanh' });
    await expect(shown).toContainText('No email was sent');
    await expect(shown).toContainText('Sending failed');
    await expect(shown).toContainText(
      'Give jordanh this one-time password; they must choose a new one at sign-in.'
    );
    await expect(shown.getByLabel('One-time password for jordanh')).toHaveValue(
      shownOneTimeValue
    );
    await expect(shown.getByRole('button', { name: 'Copy' })).toBeVisible();
    await shown.getByRole('button', { name: 'Dismiss' }).click();
    await expect(shown).toHaveCount(0);
    expect(resetBodies).toEqual([{}]);
  });

  test('admin reviews repository grants and revokes one @action:admin.revoke_repo_success', async ({
    page,
  }) => {
    await mockBootstrap(page, { login: 'jeryu-admin', auth: null });
    await mockAuthMe(page, {
      login: 'jeryu-admin',
      role: 'admin',
      mustChangePassword: false,
      csrfToken: 'csrf-admin',
    });
    await mockRepoList(page, []);
    await mockAdminUsers(page);

    let grants = [repoGrant('jordanh', 'write'), repoGrant('sam', 'read')];
    await mockRepoGrants(page, () => grants);
    const revoked: string[] = [];
    await page.route(
      /\/api\/v1\/admin\/repos\/acme\/acme-web\/grants\/[^/]+$/,
      async (route, request) => {
        expect(request.method()).toBe('DELETE');
        expect(request.headers()['x-jeryu-csrf']).toBe('csrf-admin');
        const login = decodeURIComponent(new URL(request.url()).pathname.split('/').pop() ?? '');
        revoked.push(login);
        grants = grants.filter((entry) => entry.login !== login);
        await route.fulfill({ status: 204, body: '' });
      }
    );

    await page.goto('/settings');
    // The panel assumes no repository: the admin names the one they mean.
    const accessRegion = page.getByRole('region', { name: 'Repository access' });
    await accessRegion.getByRole('textbox', { name: 'Owner' }).fill('acme');
    await accessRegion.getByRole('textbox', { name: 'Repo' }).fill('acme-web');
    const table = accessRegion.getByTestId('repo-grants-table');
    await expect(table.getByRole('rowheader', { name: 'jordanh' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(table.getByRole('row', { name: /jordanh/ })).toContainText('write');
    await table.getByRole('button', { name: 'Revoke jordanh' }).click();
    await expect(table.getByRole('rowheader', { name: 'jordanh' })).toHaveCount(0);
    await expect(table.getByRole('rowheader', { name: 'sam' })).toBeVisible();
    expect(revoked).toEqual(['jordanh']);
  });
});

async function mockAuthMe(
  page: Page,
  user: AuthUserWire | null
): Promise<void> {
  await page.route('**/api/v1/auth/me', async (route: Route, request) => {
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    if (user) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'unauthorized', message: 'login required' },
      }),
    });
  });
}

function repoGrant(login: string, access: string): Record<string, string> {
  return {
    login,
    owner: 'acme',
    repo: 'acme-web',
    access,
    granted_by: 'jeryu-admin',
    granted_at: '2026-07-03T00:00:00Z',
  };
}

async function mockRepoGrants(
  page: Page,
  current: () => Array<Record<string, string>>
): Promise<void> {
  await page.route(/\/api\/v1\/admin\/repos\/[^/]+\/[^/]+\/grants$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(current()),
    });
  });
}

async function mockAdminUsers(page: Page): Promise<void> {
  await page.route('**/api/v1/admin/users', async (route: Route, request) => {
    if (request.method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          login: 'jordanh',
          role: 'user',
          email: null,
          emailVerified: false,
          created_at: '2026-07-03T00:00:00Z',
          updated_at: '2026-07-03T00:00:00Z',
        },
      ]),
    });
  });
}
