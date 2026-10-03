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
import { mockPipelineApi } from './fixtures/pipelineMocks';
import { mockPullRoom } from './fixtures/pullRoomMocks';

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

/** One queue per invented family, so Work has a row of each to filter. */
async function mockShiftQueue(page: Page): Promise<void> {
  const todo = (id: string, family: string, title: string): Record<string, unknown> => ({
    id,
    family,
    title,
    body: '',
    repos: [],
    mode: 'night',
    priority: 3,
    blocked_by: [],
    status: 'open',
    attempts: 0,
    requested_by: 'alton',
    filed_at: new Date(Date.now() - 3_600_000).toISOString(),
    claim_by: null,
    lease_until: null,
    lease_live: false,
    shift: null,
    change_set: null,
    commits: {},
    merged: false,
    note: '',
    triaged: true,
    worked_by: [],
  });
  await page.route('**/api/v1/shift/todos**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generated_at: new Date().toISOString(),
        todos: [
          todo('20261003-0001-aaa', 'acme-split', 'Teach the chip to say outside'),
          todo('20261003-0002-bbb', 'globex', 'Carry the scope into every link'),
        ],
      }),
    });
  });
  await page.route('**/api/v1/shift/shifts**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"shifts":[]}' });
  });
}

/** The repositories of the invented families, as /repos and In flight read them. */
/** Where each left-nav destination points, badge or no badge. */
const NAV_PATH: Record<string, string> = {
  'Needs you': '/needs-you',
  Activity: '/activity',
  Work: '/work',
  'In flight': '/in-flight',
  Releases: '/releases',
  Repositories: '/repos',
};

const SCOPE_REPOS = [
  {
    id: { host: 'jeryu', owner: 'acme', name: 'acme-web' },
    default_branch: 'main',
    description: 'A repository of the acme family',
    visibility: 'private' as const,
    family: 'acme-split',
    open_pull_requests: 1,
  },
  {
    id: { host: 'jeryu', owner: 'globex', name: 'globex-api' },
    default_branch: 'main',
    description: 'A repository of the globex family',
    visibility: 'private' as const,
    family: 'globex',
    open_pull_requests: 0,
  },
];

test.describe('Family scope, page by page', () => {
  test("each page's own family control shows the scope, and setting it there carries to the next @action:chrome.family_scope_pages", async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    await mockShiftFamilies(page);
    await mockShiftQueue(page);
    await mockPullRoom(page);
    // After the pull-room list, so the families of these repositories win.
    await mockRepoList(page, SCOPE_REPOS);

    const shell = new AppShellPage(page);
    // A left-nav destination by its path: a red "needs you" count joins the
    // accessible name of the ones that have work waiting on a person.
    const nav = page.getByRole('navigation', { name: 'Primary' });
    const navTo = (path: string) => nav.locator(`a[href^="${path}"]`).first();
    await shell.goto('/repos');
    await shell.assertShellLoaded();
    await expectScope(page, '');

    // 1. Repositories: the family facet is the scope, and it reaches the URL,
    //    so a reload or Back keeps the list where the operator left it.
    const facets = page.getByRole('group', { name: 'Filter by family' });
    await facets.getByRole('button', { name: 'Family: acme-split' }).click();
    await page.waitForURL(/\/repos\?family=acme$/);
    await expect(facets.getByRole('button', { name: 'Family: acme-split' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expectScope(page, 'acme');
    await expect(page.getByText('globex/globex-api')).toHaveCount(0);
    await page.reload();
    await expect(facets.getByRole('button', { name: 'Family: acme-split' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // 2. Work: the family strip and the composer both open on that family.
    await Promise.all([
      page.waitForURL('**/work?family=acme'),
      navTo(NAV_PATH['Work']).click(),
    ]);
    const strip = page.getByRole('group', { name: 'Filter by family' });
    await expect(strip.getByRole('button', { name: /^acme 1$/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByTestId('shift-todo-20261003-0001-aaa')).toBeVisible();
    await expect(page.getByTestId('shift-todo-20261003-0002-bbb')).toHaveCount(0);
    await expect(page.getByLabel('Family', { exact: true })).toHaveValue('acme-split');

    // A pill on a row of another family moves the one scope, for every page.
    await strip.getByRole('button', { name: /^globex 1$/ }).click();
    await page.waitForURL('**/work?family=globex');
    await expectScope(page, 'globex');

    // 3. In flight: its own family bar is on the scope it was handed.
    await Promise.all([
      page.waitForURL('**/in-flight?family=globex'),
      navTo(NAV_PATH['In flight']).click(),
    ]);
    const families = page.getByTestId('pull-room-families');
    await expect(families.getByRole('button', { name: /^globex/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(families.getByRole('button', { name: /^All/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    // 4. Activity: the Family select shows it, and changing it there is the scope.
    await Promise.all([
      page.waitForURL('**/activity?family=globex'),
      navTo(NAV_PATH['Activity']).click(),
    ]);
    const activityFamily = page.getByTestId('activity-family');
    await expect(activityFamily).toHaveValue('globex');
    // Nothing happened for globex, which reads as a quiet family, not an outage.
    await expect(page.getByText('Nothing for globex here')).toBeVisible();
    await activityFamily.selectOption('acme');
    await page.waitForURL('**/activity?family=acme');
    await expectScope(page, 'acme');

    // 5. Releases: the lane family is a path, and it follows the same scope.
    await Promise.all([
      page.waitForURL('**/releases/family/acme'),
      navTo(NAV_PATH['Releases']).click(),
    ]);
    await expectScope(page, 'acme');

    // 6. A link into ANOTHER family opens it without moving the scope, and
    //    says so with the one click that switches.
    await page.goto('/work?family=globex');
    await shell.assertShellLoaded();
    await expectScope(page, 'acme');
    const switcher = page.getByTestId('family-scope-switch');
    await expect(switcher).toHaveText('outside acme · switch to globex');
    await expect(page.getByTestId('shift-todo-20261003-0002-bbb')).toBeVisible();
    await switcher.click();
    await expectScope(page, 'globex');
    await expect(page.getByTestId('family-scope-switch')).toHaveCount(0);

    // 7. And a scoped page with nothing on it hands back every family.
    await Promise.all([
      page.waitForURL('**/needs-you?family=globex'),
      navTo(NAV_PATH['Needs you']).click(),
    ]);
    await expect(page.getByText('Nothing for globex here')).toBeVisible();
    await page.getByTestId('family-scope-show-all').click();
    await page.waitForURL('**/needs-you');
    await expectScope(page, '');
    await Promise.all([
      page.waitForURL('**/repos'),
      navTo(NAV_PATH['Repositories']).click(),
    ]);
    await expect(page.getByText('globex/globex-api')).toBeVisible();
  });
});
