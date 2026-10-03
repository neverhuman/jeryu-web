// 42-family-scope.spec.ts — one family scope for the whole shell.
//
// Pick a family on one page and every destination keeps it: the left nav, the
// `g x` chords and the header chip all carry the one scope, in whichever form
// that page states it (`?family=` or `/releases/family/<key>`). Clearing the
// chip shows every family again, on this page and the next.
//
// Invented families only (acme, globex, initech): jeryu is public.

import { expect, test, type Page } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import { mockBootstrap, mockRepoList } from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const FAMILIES = ['acme-split', 'globex', 'initech'];

async function mockShiftFamilies(page: Page): Promise<void> {
  await page.route('**/api/v1/shift/families**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        families: FAMILIES.map((name) => ({
          name,
          queue_repo: `${name}/${name}-todo`,
          repos: [],
          shift_tz: 'UTC',
          landing: {},
        })),
      }),
    });
  });
}

/** Every left-nav destination, and the address it has while acme is in scope. */
const DESTINATIONS = [
  { label: 'Needs you', scoped: '/needs-you?family=acme', bare: '/needs-you' },
  { label: 'Activity', scoped: '/activity?family=acme', bare: '/activity' },
  { label: 'Work', scoped: '/work?family=acme', bare: '/work' },
  { label: 'In flight', scoped: '/in-flight?family=acme', bare: '/in-flight' },
  // The release board states the family as a path segment, not a parameter.
  { label: 'Releases', scoped: '/releases/family/acme', bare: '/releases' },
  { label: 'Repositories', scoped: '/repos?family=acme', bare: '/repos' },
  { label: 'Runners', scoped: '/runners?family=acme', bare: '/runners' },
  { label: 'Intelligence', scoped: '/intelligence?family=acme', bare: '/intelligence' },
  {
    label: 'Dependencies',
    scoped: '/intelligence/dependencies?family=acme',
    bare: '/intelligence/dependencies',
  },
  { label: 'Quality gate', scoped: '/quality-gate?family=acme', bare: '/quality-gate' },
  // The section's own path is its first tab: the hop keeps the scope.
  { label: 'Shared tools', scoped: '/shared-tools/findings?family=acme', bare: '/shared-tools/findings' },
] as const;

/** The chord that reaches each destination, and where it lands. */
const CHORDS = [
  { key: 'd', scoped: '/needs-you?family=acme' },
  { key: 'a', scoped: '/activity?family=acme' },
  { key: 'w', scoped: '/work?family=acme' },
  { key: 'm', scoped: '/in-flight?family=acme' },
  { key: 'l', scoped: '/releases/family/acme' },
  { key: 'r', scoped: '/repos?family=acme' },
  { key: 'f', scoped: '/runners?family=acme' },
  { key: 'i', scoped: '/intelligence?family=acme' },
  { key: 't', scoped: '/shared-tools/findings?family=acme' },
] as const;

/** The chip says which family the shell is scoped to, on every page. */
async function expectScope(page: Page, family: string): Promise<void> {
  await expect(page.getByTestId('family-scope')).toBeVisible();
  await expect(page.getByTestId('family-scope-select')).toHaveValue(family);
}

/** Leave the chip, so a `g x` chord is a shortcut and not typing in a control. */
async function blur(page: Page): Promise<void> {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
}

async function chord(page: Page, key: string): Promise<void> {
  await blur(page);
  await page.keyboard.press('g');
  await page.keyboard.press(key);
}

test.describe('Family scope', () => {
  test('one family survives every destination, by click and by chord @action:chrome.family_scope', async ({
    page,
  }) => {
    // Needs you, Activity and Work are admin-only destinations, so the walk
    // through every one of them is an admin's.
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockShiftFamilies(page);
    await mockRepoList(page, [
      {
        id: { host: 'jeryu', owner: 'acme', name: 'acme-web' },
        default_branch: 'main',
        description: 'A repository of the acme family',
        visibility: 'private',
        family: 'acme-split',
      },
      {
        id: { host: 'jeryu', owner: 'globex', name: 'globex-api' },
        default_branch: 'main',
        description: 'A repository of the globex family',
        visibility: 'private',
        family: 'globex',
      },
    ]);

    const shell = new AppShellPage(page);
    await shell.goto('/needs-you');
    await shell.assertShellLoaded();
    await expectScope(page, '');

    // Pick a family once, from the chip in the header.
    await page.getByTestId('family-scope-select').selectOption('acme');
    await page.waitForURL(/\/needs-you\?family=acme$/);
    await expectScope(page, 'acme');
    // The window says which family it is watching.
    await expect(page).toHaveTitle(/acme/);

    // The machinery destinations live behind one closed disclosure.
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav.getByRole('button', { name: 'System' }).click();

    for (const destination of DESTINATIONS) {
      await Promise.all([
        page.waitForURL(`**${destination.scoped}`),
        nav.getByRole('link', { name: destination.label, exact: true }).click(),
      ]);
      await shell.assertShellLoaded();
      await expectScope(page, 'acme');
      await expect(page.getByText(/Page not found/i)).toHaveCount(0);
    }

    for (const { key, scoped } of CHORDS) {
      await chord(page, key);
      await page.waitForURL(`**${scoped}`);
      await expectScope(page, 'acme');
    }

    // × shows every family again: here, and on the destination after it.
    await page.getByTestId('family-scope-clear').click();
    await page.waitForURL('**/shared-tools/findings');
    await expectScope(page, '');
    // The page still names itself; the family is no longer part of the title.
    await expect(page).not.toHaveTitle(/acme/);

    for (const destination of DESTINATIONS.slice(0, 6)) {
      await Promise.all([
        page.waitForURL(`**${destination.bare}`),
        nav.getByRole('link', { name: destination.label, exact: true }).click(),
      ]);
      await expectScope(page, '');
      await expect(page).toHaveURL(new RegExp(`${destination.bare.replace(/\//g, '\\/')}$`));
    }

    // And the palette's own two commands move the same scope.
    await shell.openCommandPalette();
    await page.getByRole('option', { name: 'Switch family…' }).click();
    await expect(page.getByTestId('family-scope-select')).toBeFocused();
    await page.getByTestId('family-scope-select').selectOption('globex');
    await expectScope(page, 'globex');
    await shell.openCommandPalette();
    await page.getByRole('option', { name: 'Show all families' }).click();
    await expectScope(page, '');
  });
});
