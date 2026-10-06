// 45-account-switcher.spec.ts — the two header controls an operator reaches
// for: the account menu and the repository switcher, plus the Help page both
// of them lead to.
//
// The account menu opens from the keyboard and holds Settings, the theme, the
// shortcuts, Help and Log out. The repository chip is a typeahead: type part
// of a name, press Enter, and you are on that repository.
//
// Invented families and repositories only (acme, globex): jeryu is public.

import { expect, test, type Page } from './fixtures/test';

import { mockBootstrap, mockReadme, mockRepoList, mockTree } from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const HOST = 'example-forge';
const REPOS = [
  { owner: 'acme', name: 'gears', family: 'acme' },
  { owner: 'acme', name: 'widgets', family: 'acme' },
  { owner: 'globex', name: 'ledger', family: 'globex' },
] as const;

async function seed(page: Page): Promise<void> {
  await mockBootstrap(page, { login: '@operator', display_name: 'Ada Operator' });
  await mockRepoList(
    page,
    REPOS.map((repo) => ({
      id: { host: HOST, owner: repo.owner, name: repo.name },
      default_branch: 'main',
      visibility: 'internal' as const,
      family: repo.family,
    }))
  );
  await mockTree(page, [{ path: 'README.md', kind: 'file' }]);
  await mockReadme(page, { html: '<h1>Repository</h1>' });
}

test('the account menu opens by keyboard, reaches Help and logs out @action:chrome.account_menu @action:help.page', async ({
  page,
}) => {
  await seed(page);
  let loggedOut = false;
  await page.route('**/api/v1/auth/me', async (route, request) => {
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    if (loggedOut) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'unauthorized', message: 'login required' } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        login: '@operator',
        role: 'user',
        mustChangePassword: false,
        csrfToken: 'e2e-csrf',
      }),
    });
  });
  await page.route('**/api/v1/auth/logout', async (route, request) => {
    if (request.method() !== 'POST') {
      await route.fallback();
      return;
    }
    loggedOut = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/repos');
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 10_000 });

  // The header names the viewer once, and the menu is shut until it is opened.
  const account = page.getByRole('button', { name: 'Account: Ada Operator' });
  await expect(account).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // Opened from the keyboard, on its first item.
  await account.focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('account-menu-settings')).toBeFocused();
  await expect(menu.getByRole('menuitem', { name: 'Log out' })).toBeVisible();

  // ↓ walks it; Escape closes it and hands focus back to the button.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(account).toBeFocused();

  // The theme is set from the menu, and the chosen one is marked.
  await account.click();
  await page.getByTestId('account-menu-theme-light').click();
  await expect(page.getByTestId('account-menu-theme-light')).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await page.keyboard.press('Escape');

  // Help is a destination: in the menu, in the palette, and on `g h`.
  await account.click();
  await page.getByTestId('account-menu-help').click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByTestId('help-page')).toBeVisible();
  // It says when to open each System page, so a reader picks the right one.
  await expect(page.getByTestId('help-page')).toContainText('Use this when work is queued');
  await expect(
    page.getByTestId('help-page').getByRole('link', { name: 'Runners' })
  ).toBeVisible();

  await page.goto('/repos');
  await page.getByRole('button', { name: /^Search or jump to/ }).click();
  await page.getByRole('combobox', { name: 'Command palette' }).fill('help');
  await page.getByRole('option', { name: /^Go to Help/ }).click();
  await expect(page).toHaveURL(/\/help$/);

  // Log out, from the menu rather than from the foot of Settings.
  await account.click();
  await page.getByTestId('account-menu-logout').click();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible({ timeout: 10_000 });
});

test('the header repo chip switches repository by name @action:chrome.repo_switcher', async ({
  page,
}) => {
  await seed(page);
  await page.goto(`/repos/${HOST}/acme/gears`);
  await expect(page.getByTestId('repo-overview-page')).toBeVisible({ timeout: 15_000 });

  const chip = page.getByTestId('repo-switcher-button');
  await expect(chip).toHaveText('acme/gears');
  await chip.click();

  // The family in scope leads: acme's other repository before globex's. The
  // options are the switcher's own: the Files panel has a branch list too.
  const options = page.locator('.repo-switcher__panel').getByRole('option');
  await expect(options.first()).toHaveText(/acme\/widgets/);
  await expect(options).toHaveCount(2);
  // The repository you are in is not offered: the chip beside the list is it.
  await expect(options.filter({ hasText: 'acme/gears' })).toHaveCount(0);

  // Type part of a name, press Enter, and that is where you are.
  await page.getByTestId('repo-switcher-input').fill('wid');
  await expect(options).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/repos/${HOST}/acme/widgets$`));
  await expect(page.getByTestId('repo-switcher-button')).toHaveText('acme/widgets');

  // Escape closes the switcher and leaves the keyboard on the chip.
  await page.getByTestId('repo-switcher-button').click();
  await expect(page.getByTestId('repo-switcher-input')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('repo-switcher-input')).toHaveCount(0);
  await expect(page.getByTestId('repo-switcher-button')).toBeFocused();
});
