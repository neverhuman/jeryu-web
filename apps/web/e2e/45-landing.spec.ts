// 45-landing.spec.ts — signed-out dragon, waitlist, and the existing login.
//
// Network is mocked the same way as 23-auth-hardening. The waitlist must not
// call signup or login. Login still posts the same body and lands on /repos.

import { expect, test, type Page, type Route } from './fixtures/test';

import { mockBootstrap, mockRepoList } from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const loginFormCredential = 'auth-form-input-0001';
const splitRepos = [
  {
    id: { host: 'forge.example', owner: 'acme', name: 'acme-core' },
    family: 'acme-split',
    description: 'Granted core repository.',
  },
];

interface SessionUser {
  login: string;
  role: 'admin' | 'user';
  mustChangePassword: boolean;
  csrfToken: string;
}

async function mockSession(page: Page, session: { current: SessionUser | null }): Promise<void> {
  await page.route('**/api/v1/auth/me', async (route: Route, request) => {
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    const user = session.current;
    if (!user) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'unauthorized', message: 'login required' },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });
}

async function openStory(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Git for agents.' })).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('Signed-out landing', () => {
  test('waitlist join posts the form and a repeat is already listed @action:landing.waitlist_join', async ({
    page,
  }) => {
    await mockBootstrap(page, { login: 'jordanh', auth: null });
    await mockSession(page, { current: null });
    const posts: { path: string; body: unknown }[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (
        request.method() === 'POST' &&
        (path === '/api/v1/waitlist' ||
          path === '/api/v1/auth/signup' ||
          path === '/api/v1/auth/login')
      ) {
        posts.push({ path, body: request.postDataJSON() });
      }
    });
    let joins = 0;
    await page.route('**/api/v1/waitlist', async (route) => {
      joins += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: joins === 1 ? 'created' : 'already_listed',
          email: 'ada@example.com',
          created_at: '2026-10-07T00:00:00Z',
          request_count: joins,
        }),
      });
    });

    await openStory(page);
    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByLabel('Name').fill('Ada');
    await page.getByLabel('What do you want from JeRyu?').fill('agents');
    await page.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByRole('status')).toContainText("You're on the waitlist.");
    await page.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByRole('status')).toContainText(
      'This email is already on the waitlist.'
    );
    expect(posts.map((post) => post.path)).toEqual(['/api/v1/waitlist', '/api/v1/waitlist']);
    expect(posts[0]?.body).toEqual({
      email: 'ada@example.com',
      name: 'Ada',
      note: 'agents',
    });
  });

  test('an empty waitlist email does not post @action:landing.waitlist_invalid', async ({
    page,
  }) => {
    await mockBootstrap(page, { login: 'jordanh', auth: null });
    await mockSession(page, { current: null });
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/waitlist') {
        posts.push(request.url());
      }
    });
    await openStory(page);
    await page.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByLabel('Email')).toBeVisible();
    expect(posts).toEqual([]);
  });

  test('login from the story is unchanged and a signed-in home skips the dragon @action:landing.login_unchanged', async ({
    page,
  }) => {
    const session: { current: SessionUser | null } = { current: null };
    await mockBootstrap(page, { login: 'jordanh', auth: null });
    await mockSession(page, session);
    await mockRepoList(page, splitRepos);
    const loginBodies: unknown[] = [];
    await page.route('**/api/v1/auth/login', async (route, request) => {
      loginBodies.push(request.postDataJSON());
      session.current = {
        login: 'jordanh',
        role: 'user',
        mustChangePassword: false,
        csrfToken: 'csrf-jordanh',
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(session.current),
      });
    });

    await openStory(page);
    const heading = await page.getByRole('heading', { name: 'Git for agents.' }).boundingBox();
    const dragon = await page.getByTestId('dragon-landing').boundingBox();
    expect(heading).not.toBeNull();
    expect(dragon).not.toBeNull();
    expect(dragon!.x).toBeGreaterThan(heading!.x);

    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('tab', { name: 'Login' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('dragon-landing')).toHaveCount(0);
    await expect(page.getByLabel('Password')).toBeVisible();

    await page.getByLabel('Username').fill('jordanh');
    await page.getByLabel('Password').fill(loginFormCredential);
    await page.getByLabel('Remember me').check();
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL(/\/repos$/, { timeout: 10_000 });
    await expect(page.getByTestId('repositories-page')).toBeVisible({ timeout: 10_000 });
    expect(loginBodies).toEqual([
      { login: 'jordanh', password: loginFormCredential, rememberMe: true },
    ]);

    const dragonRequests: string[] = [];
    page.on('request', (request) => {
      // Vite dev fetches imported files as modules (`?import`). A painted
      // image is a separate image request, and that is the one that must
      // stay absent once the visitor is signed in.
      if (request.resourceType() !== 'image') return;
      if (/landing\/(?:hero-(?:dark|light)-768|layer-|dragon-transparent)/.test(request.url())) {
        dragonRequests.push(request.url());
      }
    });
    await page.goto('/');
    await expect(page).toHaveURL(/\/repos$/, { timeout: 10_000 });
    await expect(page.getByTestId('dragon-landing')).toHaveCount(0);
    expect(dragonRequests).toEqual([]);
  });

  test('reduced motion shows the poster without layers @action:landing.dragon_static', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockBootstrap(page, { login: 'jordanh', auth: null });
    await mockSession(page, { current: null });
    await openStory(page);
    await expect(page.getByTestId('dragon-poster')).toBeVisible();
    await expect(page.getByTestId('dragon-layers')).toHaveCount(0);
    await expect(page.locator('.dragon-landing--motion')).toHaveCount(0);
    const login = page.getByRole('button', { name: 'Log in' });
    await expect(login).toBeVisible();
    const box = await login.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(720);
  });

  test('a phone shows the story, login, and waitlist without sideways scroll @action:landing.phone', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockBootstrap(page, { login: 'jordanh', auth: null });
    await mockSession(page, { current: null });
    await openStory(page);
    await expect(page.getByRole('heading', { name: 'Git for agents.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    const overflow = await page.evaluate(() => {
      const story = document.querySelector('.boot__story');
      const documentOverflow =
        document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const storyOverflow = story ? story.scrollWidth - story.clientWidth : 0;
      return Math.max(documentOverflow, storyOverflow);
    });
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('dragon-layers')).toHaveCount(0);
    await page.getByRole('button', { name: 'Animate dragon' }).click();
    await expect(page.getByTestId('dragon-layers')).toBeVisible();
  });
});
