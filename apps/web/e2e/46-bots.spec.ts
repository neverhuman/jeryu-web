// 46-bots.spec.ts — account Grokbot and Musebot enrollment, and the
// repository roster that links to it.
//
// Create and rotate are the only responses that carry an enrollment key.
// A later visit must not invent one. Narrow viewports keep the page inside
// the window; the account table stacks instead of widening the document.

import { expect, test, type Page, type Route } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import { mockBootstrap, mockRepoAgentRuns, mockRepoList } from './fixtures/mocks';
import { mockShiftTodos } from './fixtures/releaseChannelMocks';

test.describe.configure({ retries: 1 });

const PHONE = { width: 390, height: 844 } as const;
const REPO = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;
const REPO_PATH = `/repos/${REPO.host}/${REPO.owner}/${REPO.name}`;
const NOW = '2026-09-21T00:21:16Z';

interface Summary {
  id: string;
  owner: string;
  slug: string;
  display_name: string;
  kind: 'grok' | 'muse';
  status: 'active' | 'suspended' | 'revoked';
  reach: { mode: 'general' };
  credential_generation: number;
  last_successful_access: string | null;
  last_auth: null;
  last_mutation: null;
  last_heartbeat: null;
  last_action: null;
  last_outcome: string | null;
  last_repo: null;
  created_at: string;
}

function summary(overrides: Partial<Summary> = {}): Summary {
  return {
    id: 'bot-1',
    owner: 'ada',
    slug: 'north',
    display_name: 'Northwind',
    kind: 'grok',
    status: 'active',
    reach: { mode: 'general' },
    credential_generation: 1,
    last_successful_access: NOW,
    last_auth: null,
    last_mutation: null,
    last_heartbeat: null,
    last_action: null,
    last_outcome: 'shipped',
    last_repo: null,
    created_at: NOW,
    ...overrides,
  };
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/** Account list plus create, rotate, suspend, and revoke. State lives in this call. */
async function mockAccountBots(page: Page, initial: Summary[]): Promise<Summary[]> {
  const bots = initial.map((row) => ({ ...row }));
  await page.route(/\/api\/v1\/bots(?:\?.*)?$/, async (route, request) => {
    if (request.method() === 'GET') {
      await fulfillJson(route, 200, { bots });
      return;
    }
    if (request.method() !== 'POST') {
      await route.fallback();
      return;
    }
    const body = request.postDataJSON() as {
      slug: string;
      display_name: string;
      kind: 'grok' | 'muse';
      reach: { mode: 'general' };
    };
    const created = summary({
      id: 'bot-created',
      slug: body.slug,
      display_name: body.display_name,
      kind: body.kind,
      reach: body.reach,
      status: 'active',
      credential_generation: 1,
    });
    bots.unshift(created);
    await fulfillJson(route, 200, {
      bot: created,
      key_id: 'key-1',
      enrollment_key: 'enroll-once-key',
      setup_script: 'setup-script-body',
    });
  });
  await page.route(/\/api\/v1\/bots\/[^/]+\/keys(?:\?.*)?$/, async (route, request) => {
    if (request.method() !== 'POST') {
      await route.fallback();
      return;
    }
    const id = new URL(request.url()).pathname.split('/')[4];
    const row = bots.find((bot) => bot.id === id);
    if (!row) {
      await fulfillJson(route, 404, { error: { code: 'not_found', message: 'Missing.' } });
      return;
    }
    row.credential_generation += 1;
    await fulfillJson(route, 200, {
      bot: row,
      key_id: 'key-2',
      enrollment_key: 'rotated-key',
      setup_script: 'rotated-script',
    });
  });
  await page.route(/\/api\/v1\/bots\/[^/]+\/(suspend|revoke)(?:\?.*)?$/, async (route, request) => {
    if (request.method() !== 'POST') {
      await route.fallback();
      return;
    }
    const parts = new URL(request.url()).pathname.split('/');
    const id = parts[4];
    const action = parts[5];
    const row = bots.find((bot) => bot.id === id);
    if (!row) {
      await fulfillJson(route, 404, { error: { code: 'not_found', message: 'Missing.' } });
      return;
    }
    row.status = action === 'suspend' ? 'suspended' : 'revoked';
    await fulfillJson(route, 200, row);
  });
  return bots;
}

async function seedRoster(page: Page): Promise<void> {
  await mockBootstrap(page);
  await mockRepoList(page, [{ id: REPO, default_branch: 'main', visibility: 'public' }]);
  await mockRepoAgentRuns(page, []);
  await mockShiftTodos(page, []);
}

/** How far the document can be scrolled sideways; 0 or less is the only pass. */
async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(root.scrollWidth - window.innerWidth, document.body.scrollWidth - window.innerWidth);
  });
}

test('an empty repository roster links to add a Grokbot or Musebot @action:bots.roster_empty', async ({
  page,
}) => {
  await seedRoster(page);
  await mockAccountBots(page, []);

  const shell = new AppShellPage(page);
  await shell.goto(`${REPO_PATH}/agents`);
  await shell.assertShellLoaded(15_000);

  const roster = page.getByTestId('bot-roster');
  await expect(roster).toBeVisible();
  await expect(roster.getByRole('heading', { name: 'Grokbot and Musebot' })).toBeVisible();
  await expect(page.getByTestId('bot-empty')).toContainText(
    'No Grokbot or Musebot on this repo yet'
  );

  const add = page.getByTestId('add-bot');
  await expect(add).toHaveText('Add a Grokbot or Musebot');
  await add.click();

  await expect(page).toHaveURL(/\/bots\?repo=neverhuman(?:%2F|\/)jeryu$/);
  await expect(page.getByTestId('enroll-page')).toBeVisible();
  await expect(page.getByTestId('bot-reach-select')).toHaveValue('repositories');
  await expect(page.getByLabel('Repositories, one owner/name per line')).toHaveValue(
    'neverhuman/jeryu'
  );
});

test('adding one shows the enrollment key and setup script once @action:bots.enroll_once', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockAccountBots(page, []);

  const shell = new AppShellPage(page);
  await shell.goto('/bots');
  await shell.assertShellLoaded(15_000);

  await expect(page.getByTestId('enroll-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Grokbot and Musebot' })).toBeVisible();
  await expect(page.getByText('No Grokbot or Musebot on this account yet.')).toBeVisible();
  await expect(page.getByTestId('bot-setup')).toHaveCount(0);

  await page.getByLabel('Display name').fill('North');
  await page.getByLabel('Slug').fill('north');
  await page.getByTestId('bot-kind-select').selectOption('grok');
  await page.getByRole('button', { name: 'Add' }).click();

  const setup = page.getByTestId('bot-setup');
  await expect(setup).toBeVisible();
  await expect(setup).toContainText('enroll-once-key');
  await expect(setup).toContainText('setup-script-body');
  await expect(page.getByTestId('bot-list')).toContainText('North');

  await page.getByRole('button', { name: 'Hide this key' }).click();
  await expect(page.getByTestId('bot-setup')).toHaveCount(0);
  await expect(page.getByText('enroll-once-key')).toHaveCount(0);

  await page.reload();
  await shell.assertShellLoaded(15_000);
  await expect(page.getByTestId('bot-list')).toContainText('North');
  await expect(page.getByTestId('bot-setup')).toHaveCount(0);
  await expect(page.getByText('enroll-once-key')).toHaveCount(0);
});

test('rotate, suspend, and revoke update the account row @action:bots.lifecycle', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockAccountBots(page, [summary()]);

  const shell = new AppShellPage(page);
  await shell.goto('/bots');
  await shell.assertShellLoaded(15_000);

  const list = page.getByTestId('bot-list');
  await expect(list).toContainText('Northwind');
  await expect(list).toContainText('Grokbot');
  await expect(list).toContainText('Active');

  await page.getByTestId('bot-rotate').click();
  const setup = page.getByTestId('bot-setup');
  await expect(setup).toContainText('rotated-key');
  await expect(setup).toContainText('rotated-script');

  await page.getByTestId('bot-suspend').click();
  await expect(list).toContainText('Suspended');
  await expect(page.getByTestId('bot-suspend')).toBeDisabled();

  await page.getByTestId('bot-revoke').click();
  await expect(list).toContainText('Revoked');
  await expect(page.getByTestId('bot-revoke')).toBeDisabled();
  await expect(page.getByTestId('bot-rotate')).toBeDisabled();
  await expect(page.getByTestId('bot-suspend')).toBeDisabled();
});

test('the account page and repository roster stay inside a phone viewport @action:bots.phone', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await seedRoster(page);
  const longName = 'Northwind ' + 'display '.repeat(12);
  await mockAccountBots(page, [
    summary({ display_name: longName, slug: 'north-wind-account-slug' }),
  ]);
  await page.route(/\/api\/v1\/repos\/[^/]+\/bots(?:\?.*)?$/, async (route, request) => {
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    await fulfillJson(route, 200, {
      bots: [summary({ display_name: longName, slug: 'north-wind-repo-slug' })],
    });
  });

  const shell = new AppShellPage(page);
  await shell.goto('/bots');
  await shell.assertShellLoaded(15_000);
  await expect(page.getByTestId('bot-list')).toContainText('Northwind');
  await expect
    .poll(() => sidewaysOverflow(page), {
      message: `account page scrolls sideways at ${PHONE.width}px`,
    })
    .toBeLessThanOrEqual(0);

  await shell.goto(`${REPO_PATH}/agents`);
  await shell.assertShellLoaded(15_000);
  await expect(page.getByTestId('bot-roster')).toContainText('Northwind');
  await expect
    .poll(() => sidewaysOverflow(page), {
      message: `repository roster scrolls sideways at ${PHONE.width}px`,
    })
    .toBeLessThanOrEqual(0);
});
