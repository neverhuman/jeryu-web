// 45-landing.spec.ts — signed-out dragon, waitlist, and the existing login.
//
// Network is mocked the same way as 23-auth-hardening. The waitlist must not
// call signup or login. Login still posts the same body and lands on /repos.

import { expect, test, type Page, type Route } from './fixtures/test';

import { blockingViolations, persistAxeResult, persistRenderedEvidence, runAxe } from './fixtures/accessibility';
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

async function persistSceneEvidence(page: Page, scope: string): Promise<Awaited<ReturnType<typeof persistRenderedEvidence>>> {
  const poster = page.getByTestId('dragon-poster');
  await expect.poll(() => poster.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await poster.evaluate(async (node) => { await (node as HTMLImageElement).decode(); });
  return persistRenderedEvidence(page, scope);
}

async function openStory(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Git for agents.' })).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('Signed-out landing', () => {
  test('waitlist join posts the form and a repeat shows the same receipt @action:landing.waitlist_join', async ({
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
    await page.route('**/api/v1/waitlist', async (route) => {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ result: 'received' }),
      });
    });

    await openStory(page);
    await expect(page.getByLabel('Email')).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Account access' }).getByRole('link', { name: /Join waitlist/ }).click();
    await expect(page).toHaveURL(/\/waitlist$/);
    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByLabel('Name').fill('Ada');
    await page.getByLabel('What do you want from JeRyū?').fill('agents');
    await page.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByRole('status')).toContainText("Thanks, you're on the list.");
    await expect(page.getByLabel('Email')).toHaveValue('');
    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByRole('status')).toContainText("Thanks, you're on the list.");
    expect(posts.map((post) => post.path)).toEqual(['/api/v1/waitlist', '/api/v1/waitlist']);
    expect(posts[0]?.body).toEqual({
      email: 'ada@example.com',
      name: 'Ada',
      note: 'agents',
    });
    // Record geometry and the design tokens this landing already paints.
    const rendered = await persistSceneEvidence(page, 'landing');
    expect(rendered.geometry.width).toBeGreaterThan(0);
    expect(rendered.geometry.height).toBeGreaterThan(0);
    expect(rendered.design_tokens.color_bg_0.length).toBeGreaterThan(0);
    expect(rendered.design_tokens.space_4.length).toBeGreaterThan(0);
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
    await page.goto('/waitlist');
    await page.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page).toHaveURL(/\/waitlist$/);
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
    await expect(page.getByTestId('dragon-landing')).toBeVisible();
    await expect(page.locator('.marketing-scene')).toHaveAttribute('data-background-motion', 'running');
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
      if (/\/(?:landing\/v6|assets)\/dragon-graphic-/.test(request.url())) {
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
    await expect(page.locator('.marketing-scene')).toHaveAttribute('data-background-motion', 'paused');
    await expect(page.getByRole('button', { name: 'Pause background motion' })).toHaveCount(0);
    expect(await page.locator('.dragon-landing__flow').first().evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
    const login = page.getByRole('button', { name: 'Log in' });
    await expect(login).toBeVisible();
    const box = await login.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(720);
  });

  test('background motion runs automatically without controls and stops offscreen @action:landing.motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mockBootstrap(page, { login: 'jordanh', auth: null });
    await mockSession(page, { current: null });
    await openStory(page);
    const story = page.locator('.marketing-scene');
    const flow = page.locator('.dragon-landing__flow').first();
    await expect(story).toHaveAttribute('data-background-motion', 'running');
    // SVG wakes must stream left behind the right-facing dragon in rendered frames, not merely have a keyframe name.
    const first = await flow.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41);
    await expect.poll(() => flow.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41)).toBeLessThan(first - 2);
    await expect(page.getByRole('button', { name: /(?:Pause|Play) background motion/ })).toHaveCount(0);
    const poster = page.getByTestId('dragon-poster');
    await expect(poster).toHaveCSS('opacity', '1');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(poster).toHaveCSS('opacity', '0.1');
    await page.getByRole('button', { name: /Back to the story/ }).click();
    await expect(poster).toHaveCSS('opacity', '1');
    await page.locator('.marketing-footer').scrollIntoViewIfNeeded();
    await expect(story).toHaveAttribute('data-background-motion', 'paused');
    await page.getByRole('heading', { name: 'Git for agents.' }).scrollIntoViewIfNeeded();
    await expect(story).toHaveAttribute('data-background-motion', 'running');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(story).toHaveAttribute('data-background-motion', 'paused');
    expect(await flow.evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
    await persistSceneEvidence(page, 'landing-v9-motion-reduced');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const route of ['/waitlist', '/login', '/signup']) {
      await page.goto(route);
      await expect(page.getByTestId('dragon-poster')).toBeVisible();
      await expect(poster).toHaveCSS('opacity', '0.1');
      await expect(story).toHaveAttribute('data-background-motion', 'running');
      const position = await flow.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41);
      await expect.poll(() => flow.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41)).toBeLessThan(position - 2);
      await page.getByRole('link', { name: /Back to the story/ }).click();
      await expect(poster).toHaveCSS('opacity', '1');
    }
  });

  for (const width of [390, 320]) {
    test(`a ${width}px phone offers waitlist drill-down without sideways scroll @action:landing.phone`, async ({ page }) => {
      await mockBootstrap(page, { login: 'jordanh', auth: null });
      await mockSession(page, { current: null });
      await page.setViewportSize({ width, height: 844 });
      await openStory(page);
      await expect(page.getByLabel('Email')).toHaveCount(0);
      const join = page.getByRole('navigation', { name: 'Account access' }).getByRole('link', { name: /Join waitlist/ });
      const box = await join.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.y + box!.height).toBeLessThan(844);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await expect(page.getByTestId('dragon-poster')).toBeVisible();
      const frame = await page.getByTestId('dragon-landing').boundingBox();
      expect(frame).not.toBeNull();
      expect(frame!.x).toBeGreaterThanOrEqual(0);
      expect(frame!.x + frame!.width).toBeLessThanOrEqual(width);
      await expect(page.getByTestId('dragon-layers')).toHaveCount(0);
      await persistSceneEvidence(page, `landing-phone-${width}`);
      await join.click();
      await expect(page).toHaveURL(/\/waitlist$/);
      await expect(page.getByLabel('Email')).toBeVisible();
      await page.reload();
      await expect(page.getByLabel('Email')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await persistSceneEvidence(page, `waitlist-phone-${width}`);
      await page.getByRole('link', { name: /Back to the story/ }).click();
      await expect(page.getByRole('heading', { name: 'Git for agents.' })).toBeVisible();
      await page.getByRole('button', { name: 'Log in' }).click();
      await expect(page.getByLabel('Password')).toBeVisible();
      await expect(page.getByTestId('dragon-poster')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await persistSceneEvidence(page, `login-phone-${width}`);
    });
  }

  test('the public waitlist preserves input after errors and retries @action:landing.waitlist_retry', async ({ page }) => {
    await mockBootstrap(page, { login: 'jordanh', auth: null });
    await mockSession(page, { current: null });
    let status = 422;
    await page.route('**/api/v1/waitlist', async (route) => {
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 202 ? { result: 'received' } : { error: { code: 'waitlist_failure', message: 'Try again' } }) });
    });
    await page.goto('/waitlist');
    await page.getByLabel('Email').fill('reviewer@example.com');
    for (const [code, message] of [[422, 'cannot be saved'], [429, 'Too many attempts'], [503, 'could not be reached']] as const) {
      status = code;
      await page.getByRole('button', { name: 'Join the waitlist' }).click();
      await expect(page.getByRole('status')).toContainText(message);
      await expect(page.getByLabel('Email')).toHaveValue('reviewer@example.com');
    }
    status = 202;
    await page.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByRole('status')).toContainText("Thanks, you're on the list.");
    await expect(page.getByLabel('Email')).toHaveValue('');
  });

  test('a signed-in visitor can open the public waitlist @action:landing.waitlist_public', async ({ page }) => {
    await mockBootstrap(page, { login: 'jordanh' });
    await mockSession(page, { current: { login: 'jordanh', role: 'user', mustChangePassword: false, csrfToken: 'csrf-jordanh' } });
    await page.goto('/waitlist');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page).toHaveURL(/\/waitlist$/);
  });

  test('the story, waitlist and login share the artwork and have rendered accessibility proof @action:landing.visual', async ({ page }) => {
    // Six accessibility scans plus theme and forced-color captures share this case.
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockBootstrap(page, { login: 'jordanh', auth: null });
    await mockSession(page, { current: null });
    for (const colorScheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await openStory(page);
      await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), colorScheme);
      await expect.poll(() => page.getByTestId('dragon-poster').evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(page.getByTestId('dragon-poster')).toHaveAttribute('src', /dragon-graphic-/);
      await expect(page.locator('form')).toHaveCount(0);
      const frame = await page.getByTestId('dragon-landing').boundingBox();
      const poster = await page.getByTestId('dragon-poster').boundingBox();
      const workflow = await page.locator('#how-it-works').boundingBox();
      expect(frame).not.toBeNull();
      expect(poster).not.toBeNull();
      expect(workflow).not.toBeNull();
      // Keep the complete graphic and its free tips inside the viewport.
      expect(frame!.x).toBeGreaterThanOrEqual(0);
      expect(frame!.x + frame!.width).toBeLessThanOrEqual(1440);
      expect(poster!.y + poster!.height).toBeLessThanOrEqual(frame!.y + frame!.height + 1);
      // The alpha dragon crosses the hero boundary into the product story.
      expect(poster!.y + poster!.height).toBeGreaterThan(workflow!.y);
      const scene = await page.locator('.marketing-scene').evaluate((node) => ({
        grid: getComputedStyle(node, '::before').backgroundImage,
        position: getComputedStyle(node.querySelector('.dragon-landing')!).position,
        parent: node.querySelector('.dragon-landing')!.parentElement?.className,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(scene.grid).toContain('linear-gradient');
      expect(scene.position).toBe('absolute');
      expect(scene.parent).toBe('marketing-scene');
      expect(scene.overflow).toBeLessThanOrEqual(1);
      await expect(page.getByTestId('dragon-poster')).toHaveCSS('opacity', '1');
      await persistSceneEvidence(page, `landing-v9-${colorScheme}`);
      const result = await runAxe(page);
      await persistAxeResult(`landing-v9-${colorScheme}`, result);
      expect(blockingViolations(result)).toEqual([]);
      await page.goto('/waitlist');
      await expect(page.getByLabel('Email')).toBeVisible();
      await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), colorScheme);
      await expect(page.getByTestId('dragon-poster')).toHaveAttribute('src', /dragon-graphic-/);
      expect(await page.locator('.marketing-scene').evaluate((node) => getComputedStyle(node, '::before').backgroundImage)).toBe(scene.grid);
      await expect(page.getByTestId('dragon-poster')).toHaveCSS('opacity', '0.1');
      await persistSceneEvidence(page, `waitlist-v9-${colorScheme}`);
      const waitlist = await runAxe(page);
      await persistAxeResult(`waitlist-v9-${colorScheme}`, waitlist);
      expect(blockingViolations(waitlist)).toEqual([]);
      await page.goto('/login');
      await expect(page.getByLabel('Password')).toBeVisible();
      await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), colorScheme);
      await expect(page.getByTestId('dragon-poster')).toHaveAttribute('src', /dragon-graphic-/);
      expect(await page.locator('.marketing-scene').evaluate((node) => getComputedStyle(node, '::before').backgroundImage)).toBe(scene.grid);
      await expect(page.getByTestId('dragon-poster')).toHaveCSS('opacity', '0.1');
      await persistSceneEvidence(page, `login-v9-${colorScheme}`);
      const login = await runAxe(page);
      await persistAxeResult(`login-v9-${colorScheme}`, login);
      expect(blockingViolations(login)).toEqual([]);
    }
    await page.emulateMedia({ forcedColors: 'active' });
    await openStory(page);
    await expect(page.getByRole('navigation').getByRole('link', { name: /Join waitlist/ })).toBeVisible();
    await persistSceneEvidence(page, 'landing-v9-forced-colors');
  });

  test('a failed hero image keeps navigation and permits a retry @action:landing.art_failure', async ({ page }) => {
    await mockBootstrap(page, { login: 'jordanh', auth: null });
    await mockSession(page, { current: null });
    let fail = true;
    await page.route(/\/(?:landing\/v6|assets)\/dragon-graphic-[^/]+\.webp/, async (route) => {
      if (fail) await route.abort();
      else await route.fallback();
    });
    await openStory(page);
    await expect(page.getByRole('status')).toContainText('artwork could not load');
    await expect(page.getByRole('navigation').getByRole('link', { name: /Join waitlist/ })).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => page.getByTestId('dragon-poster').evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  });
});
