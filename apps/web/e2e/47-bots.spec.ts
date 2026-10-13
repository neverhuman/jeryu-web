// 47-bots.spec.ts — account agent enrollment (Grokbot, Musebot, or any
// kind), the repository roster that links to it, and the Settings link to the
// agent setup page.
//
// Create and rotate are the only responses that carry an enrollment key.
// A later visit must not invent one. Narrow viewports keep the page inside
// the window; the account table stacks instead of widening the document.
// Agent tokens follow the same rule: the token is shown once, on create.

import { expect, test, type Page, type Route } from './fixtures/test';

import {
  blockingViolations,
  persistAxeResult,
  persistRenderedEvidence,
  runAxe,
} from './fixtures/accessibility';
import { AppShellPage } from './pages/AppShellPage';
import { mockBootstrap, mockRepoAgentRuns, mockRepoList } from './fixtures/mocks';
import { mockShiftTodos } from './fixtures/releaseChannelMocks';

test.describe.configure({ retries: 1 });

const PHONE = { width: 390, height: 844 } as const;
const REPO = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;
const REPO_PATH = `/repos/${REPO.host}/${REPO.owner}/${REPO.name}`;
const NOW = '2026-09-21T00:21:16Z';
/** Fixed ids. The API parses a bot path with `Uuid::parse_str`. */
const BOT_ID = '11111111-1111-4111-8111-111111111111';
const CREATED_BOT_ID = '22222222-2222-4222-8222-222222222222';
/**
 * `require_login` rejects this slug. `map_bot_error` serves it as 422
 * `invalid_input`.
 */
const INVALID_SLUG_MESSAGE =
  'login must be canonical lowercase ASCII using letters, numbers, hyphen, or underscore';

interface Summary {
  id: string;
  owner: string;
  slug: string;
  display_name: string;
  kind: string;
  status: 'active' | 'suspended' | 'revoked';
  reach: Record<string, unknown>;
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
    id: BOT_ID,
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

/**
 * Body `normalize` serves after `api_error`: top-level `code` and `message`,
 * then the envelope fields. `reason` repeats the handler message. The other
 * fields are the defaults for a code with no repair hint of its own.
 */
function apiEnvelope(code: string, message: string): {
  code: string;
  message: string;
  reason: string;
  purpose: string;
  common_fixes: string[];
  repair_hint: string;
  docs_url: string;
} {
  return {
    code,
    message,
    reason: message,
    purpose: 'complete a jeryu API request',
    common_fixes: [
      'look the code up at GET /api/v1/errors',
      'check the request against the route index at GET /api/v1',
    ],
    repair_hint: 'look the code up at GET /api/v1/errors, fix the request it names, and retry',
    docs_url: '/api/v1/docs/errors.md',
  };
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
      kind?: string;
      reach: Record<string, unknown>;
    };
    const created = summary({
      id: CREATED_BOT_ID,
      slug: body.slug,
      display_name: body.display_name,
      kind: body.kind ?? 'agent',
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
      await fulfillJson(route, 404, apiEnvelope('not_found', `bot ${id}`));
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
      await fulfillJson(route, 404, apiEnvelope('not_found', `bot ${id}`));
      return;
    }
    row.status = action === 'suspend' ? 'suspended' : 'revoked';
    await fulfillJson(route, 200, row);
  });
  await mockAgentTokens(page, []);
  return bots;
}

interface TokenRow {
  token_id: string;
  bot_id: string;
  label: string | null;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const ISSUED_TOKEN = 'jat_example_shown_once';
const FUTURE = '2099-01-01T00:00:00Z';

/** Agent tokens per bot: list, issue (201, token once), revoke. State lives in this call. */
async function mockAgentTokens(page: Page, initial: TokenRow[]): Promise<void> {
  const tokens = initial.map((row) => ({ ...row }));
  await page.route(/\/api\/v1\/bots\/[^/]+\/tokens(?:\/[^/]+\/revoke)?(?:\?.*)?$/, async (route, request) => {
    const parts = new URL(request.url()).pathname.split('/');
    const botId = parts[4];
    const tokenId = parts[6];
    if (request.method() === 'GET' && tokenId === undefined) {
      await fulfillJson(route, 200, { tokens: tokens.filter((row) => row.bot_id === botId) });
      return;
    }
    if (request.method() !== 'POST') {
      await route.fallback();
      return;
    }
    if (tokenId !== undefined) {
      const row = tokens.find((token) => token.token_id === tokenId && token.bot_id === botId);
      if (!row) {
        await fulfillJson(route, 404, apiEnvelope('not_found', `token ${tokenId}`));
        return;
      }
      row.revoked_at = NOW;
      await fulfillJson(route, 200, row);
      return;
    }
    const body = (request.postDataJSON() ?? {}) as { label?: string; ttl_days?: number };
    const created: TokenRow = {
      token_id: `tok-${tokens.length + 1}`,
      bot_id: botId,
      label: body.label ?? null,
      created_at: NOW,
      expires_at: FUTURE,
      last_used_at: null,
      revoked_at: null,
    };
    tokens.unshift(created);
    await fulfillJson(route, 201, {
      bot: summary({ id: botId }),
      token_id: created.token_id,
      token: ISSUED_TOKEN,
      label: created.label,
      created_at: created.created_at,
      expires_at: created.expires_at,
    });
  });
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

test('an empty repository roster links to add an agent @action:bots.roster_empty', async ({
  page,
}) => {
  await seedRoster(page);
  await mockAccountBots(page, []);

  const shell = new AppShellPage(page);
  await shell.goto(`${REPO_PATH}/agents`);
  await shell.assertShellLoaded(15_000);

  const roster = page.getByTestId('bot-roster');
  await expect(roster).toBeVisible();
  await expect(roster.getByRole('heading', { name: 'Enrolled agents', exact: true })).toBeVisible();
  await expect(page.getByTestId('bot-empty')).toContainText('No enrolled agent on this repo yet');

  const add = page.getByTestId('add-bot');
  await expect(add).toHaveText('Add an agent');
  await add.click();

  await expect(page).toHaveURL(/\/bots\?repo=neverhuman(?:%2F|\/)jeryu$/);
  await expect(page.getByTestId('enroll-page')).toBeVisible();
  await expect(page.getByTestId('bot-reach-select')).toHaveValue('repositories');
  await expect(page.getByLabel('Repositories, one per line')).toHaveValue('neverhuman/jeryu');
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
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
  await expect(page.getByText('No agent on this account yet.')).toBeVisible();
  await expect(page.getByTestId('bot-setup')).toHaveCount(0);

  await page.getByLabel('Display name').fill('North');
  await page.getByLabel('Slug').fill('north');
  await page.getByLabel('Kind (optional)').fill('grok');
  await page.getByRole('button', { name: 'Add' }).click();

  const setup = page.getByTestId('bot-setup');
  await expect(setup).toBeVisible();
  await expect(setup).toContainText('enroll-once-key');
  await expect(setup).toContainText('setup-script-body');
  await expect(page.getByTestId('bot-list')).toContainText('North');
  // Record geometry and the design tokens this account page already paints.
  const rendered = await persistRenderedEvidence(page, 'bots');
  expect(rendered.geometry.width).toBeGreaterThan(0);
  expect(rendered.geometry.height).toBeGreaterThan(0);
  expect(rendered.design_tokens.color_bg_0.length).toBeGreaterThan(0);
  expect(rendered.design_tokens.space_4.length).toBeGreaterThan(0);

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

test('a rejected slug shows the invalid_input error and no key @action:bots.invalid_input', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockAccountBots(page, []);
  await page.route(/\/api\/v1\/bots(?:\?.*)?$/, async (route, request) => {
    if (request.method() !== 'POST') {
      await route.fallback();
      return;
    }
    await fulfillJson(route, 422, apiEnvelope('invalid_input', INVALID_SLUG_MESSAGE));
  });

  const shell = new AppShellPage(page);
  await shell.goto('/bots');
  await shell.assertShellLoaded(15_000);

  await page.getByLabel('Display name').fill('Bad slug');
  await page.getByLabel('Slug').fill('Bad');
  await page.getByRole('button', { name: 'Add' }).click();

  const error = page.getByTestId('bot-form-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText('Could not add it.');
  await expect(error).toContainText(INVALID_SLUG_MESSAGE);
  await expect(error).toContainText('invalid_input');
  await expect(page.getByTestId('bot-setup')).toHaveCount(0);
});

test('an agent token is shown once with setup lines, then revoked after an in-page confirm @action:bots.agent_tokens', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockAccountBots(page, [summary()]);
  await mockAgentTokens(page, [
    {
      token_id: 'tok-old',
      bot_id: BOT_ID,
      label: 'old laptop',
      created_at: NOW,
      expires_at: '2020-01-01T00:00:00Z',
      last_used_at: null,
      revoked_at: null,
    },
  ]);

  const shell = new AppShellPage(page);
  await shell.goto('/bots');
  await shell.assertShellLoaded(15_000);

  const tokens = page.getByTestId('agent-tokens');
  await expect(tokens).toContainText('Tokens for Northwind');
  await expect(tokens.getByTestId('agent-token-row')).toContainText('old laptop');
  await expect(tokens.getByTestId('agent-token-status')).toHaveText('Expired');
  await expect(tokens.getByTestId('agent-token-row')).toContainText('Never');

  await tokens.getByLabel('Label (optional)').fill('laptop');
  await tokens.getByLabel('Days valid').fill('30');
  await tokens.getByRole('button', { name: 'Create token' }).click();

  const issued = page.getByTestId('agent-token-issued');
  await expect(issued).toBeVisible();
  await expect(issued).toBeFocused();
  await expect(issued.getByTestId('agent-token-value')).toContainText(ISSUED_TOKEN);
  await expect(issued.getByTestId('agent-token-once')).toContainText('You will not see it again');
  const origin = new URL(page.url()).origin;
  await expect(issued.getByTestId('agent-token-snippet-claude-code')).toContainText(
    `claude mcp add --transport http jeryu ${origin}/mcp --header "Authorization: Bearer ${ISSUED_TOKEN}"`
  );
  await expect(issued.getByTestId('agent-token-snippet-mcp-json')).toContainText(
    `"url":"${origin}/mcp"`
  );
  await expect(issued.getByTestId('agent-token-snippet-gh-git')).toContainText(
    `GH_TOKEN=${ISSUED_TOKEN}`
  );
  await expect(tokens.getByTestId('agent-token-row').first()).toContainText('laptop');

  const result = await runAxe(page, { disableRules: ['color-contrast'] });
  await persistAxeResult('bots-agent-tokens', result);
  // Every axe receipt is paired with rendered evidence of the same surface.
  const rendered = await persistRenderedEvidence(page, 'bots-agent-tokens');
  expect(rendered.geometry.width).toBeGreaterThan(0);
  expect(rendered.geometry.height).toBeGreaterThan(0);
  expect(
    blockingViolations(result).map((v) => `${v.impact ?? '?'} ${v.id}`),
    'the agent token panel adds no serious or critical violation'
  ).toEqual([]);

  await page.setViewportSize(PHONE);
  await expect
    .poll(() => sidewaysOverflow(page), {
      message: `the issued token panel scrolls the page sideways at ${PHONE.width}px`,
    })
    .toBeLessThanOrEqual(0);

  await issued.getByTestId('agent-token-dismiss').click();
  await expect(page.getByTestId('agent-token-issued')).toHaveCount(0);
  await expect(page.getByText(ISSUED_TOKEN)).toHaveCount(0);
  expect(page.url()).not.toContain(ISSUED_TOKEN);

  await page.getByRole('button', { name: 'Revoke laptop' }).click();
  const confirm = page.getByTestId('agent-token-confirm');
  await expect(confirm).toContainText('Revoke laptop?');
  await confirm.getByTestId('agent-token-revoke-confirm').click();
  await expect(page.getByTestId('agent-token-confirm')).toHaveCount(0);
  await expect(tokens.getByTestId('agent-token-status').first()).toHaveText('Revoked');

  await page.reload();
  await shell.assertShellLoaded(15_000);
  await expect(page.getByTestId('agent-tokens')).toContainText('laptop');
  await expect(page.getByText(ISSUED_TOKEN)).toHaveCount(0);
});

test('reach lists one repository or owner per row, and owner/* lines enroll whole owners @action:bots.reach_families', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockAccountBots(page, [
    summary({
      reach: {
        mode: 'repositories',
        repos: [
          { owner: 'acme', name: 'widgets' },
          { owner: 'acme', name: 'gadgets' },
        ],
      },
    }),
    // A reach mode and a kind this page has never heard of still render.
    summary({
      id: '33333333-3333-4333-8333-333333333333',
      slug: 'later',
      display_name: 'Laterwind',
      kind: 'codex',
      reach: { mode: 'galaxy', stars: 3 },
    }),
  ]);

  const shell = new AppShellPage(page);
  await shell.goto('/bots');
  await shell.assertShellLoaded(15_000);

  const list = page.getByTestId('bot-list');
  const north = list.getByRole('row').filter({ hasText: 'Northwind' });
  await expect(north.getByTestId('bot-reach-row')).toHaveText(['acme/widgets', 'acme/gadgets']);
  const later = list.getByRole('row').filter({ hasText: 'Laterwind' });
  await expect(later.getByTestId('bot-kind')).toHaveText('codex');
  await expect(later.getByTestId('bot-reach-row')).toHaveText(['Unknown reach: galaxy']);

  await page.getByLabel('Display name').fill('Family');
  await page.getByLabel('Slug').fill('family');
  await page.getByTestId('bot-reach-select').selectOption('repositories');
  const lines = page.getByLabel('Repositories, one per line');
  await lines.fill('acme/*\nacme/widgets');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'A reach is either whole owners (owner/*) or a list of repositories (owner/name), not both.'
  );

  await page.getByLabel('Kind (optional)').fill('Claude');
  await lines.fill('acme/*\numbrella/*');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('alert')).toContainText('lowercase letter');
  await expect(page.getByTestId('bot-setup')).toHaveCount(0);

  await page.getByLabel('Kind (optional)').fill('claude');
  const posted = page.waitForRequest(
    (request) => request.method() === 'POST' && /\/api\/v1\/bots$/.test(new URL(request.url()).pathname)
  );
  await page.getByRole('button', { name: 'Add' }).click();
  expect((await posted).postDataJSON()).toEqual({
    slug: 'family',
    display_name: 'Family',
    kind: 'claude',
    reach: { mode: 'owners', owners: ['acme', 'umbrella'] },
  });
  await expect(page.getByTestId('bot-setup')).toBeVisible();

  const family = list.getByRole('row').filter({ hasText: 'Family' });
  await expect(family.getByTestId('bot-kind')).toHaveText('claude');
  await expect(family.getByTestId('bot-reach-row')).toHaveText(['acme/*', 'umbrella/*']);

  const docLink = page.getByTestId('bots-connect-doc-link');
  await expect(docLink).toHaveAttribute('href', '/api/v1/docs/connect-an-agent.md');
  await expect(docLink).toHaveAttribute('target', '_blank');

  const result = await runAxe(page, { disableRules: ['color-contrast'] });
  await persistAxeResult('bots-reach', result);
  // Every axe receipt is paired with rendered evidence of the same surface.
  const rendered = await persistRenderedEvidence(page, 'bots-reach');
  expect(rendered.geometry.width).toBeGreaterThan(0);
  expect(rendered.geometry.height).toBeGreaterThan(0);
  expect(
    blockingViolations(result).map((v) => `${v.impact ?? '?'} ${v.id}`),
    'the reach rows and the kind field add no serious or critical violation'
  ).toEqual([]);

  await page.setViewportSize(PHONE);
  await expect
    .poll(() => sidewaysOverflow(page), {
      message: `the reach rows scroll the page sideways at ${PHONE.width}px`,
    })
    .toBeLessThanOrEqual(0);
});

test('Settings links the agent setup page in a new tab @action:settings.connect_agent', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockAccountBots(page, []);

  const shell = new AppShellPage(page);
  await shell.goto('/settings');
  await shell.assertShellLoaded(15_000);

  const section = page.getByTestId('settings-connect-agent');
  await expect(section.getByRole('heading', { name: 'Connect an agent' })).toBeVisible();
  const link = section.getByRole('link', { name: 'Agent setup page' });
  await expect(link).toHaveAttribute('href', '/api/v1/docs/connect-an-agent.md');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(section).toContainText(
    'Send this page and an agent token to an external agent to connect it.'
  );

  await section.getByRole('link', { name: 'Agents', exact: true }).click();
  await expect(page).toHaveURL(/\/bots$/);
  await expect(page.getByTestId('enroll-page')).toBeVisible();
});

test('the repository roster shows what its bots did, newest first, with the session each worked @action:bots.activity', async ({
  page,
}) => {
  await seedRoster(page);
  await mockAccountBots(page, []);
  const bot = summary({ display_name: 'Atlas', slug: 'atlas' });
  await page.route(/\/api\/v1\/repos\/[^/]+\/bots(?:\?.*)?$/, async (route, request) => {
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    await fulfillJson(route, 200, { bots: [bot] });
  });
  const at = (ago: number) => new Date(Date.now() - ago).toISOString();
  await page.route(/\/api\/v1\/repos\/[^/]+\/bot-activity(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, 200, {
      events: [
        { id: 'e-1', bot_id: bot.id, key_id: 'k-1', repo: `${REPO.owner}/${REPO.name}`, session_id: 'vm-ar-7',
          action: `POST /api/v1/repos/${REPO.owner}%2F${REPO.name}/sessions`, outcome: '201', scope: 'http',
          created_at: at(120_000) },
        { id: 'e-2', bot_id: bot.id, key_id: 'k-1', repo: `${REPO.owner}/${REPO.name}`, session_id: 'vm-ar-7',
          action: 'session.send_input', outcome: 'ok', scope: 'mcp', created_at: at(60_000) },
      ],
    });
  });

  const shell = new AppShellPage(page);
  await shell.goto(`${REPO_PATH}/agents`);
  await shell.assertShellLoaded(15_000);
  const rows = page.getByTestId('bot-activity-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('session.send_input');
  await expect(rows.first()).toContainText('Atlas');
  await expect(rows.first().getByRole('link', { name: 'vm-ar-7' })).toHaveAttribute(
    'href',
    '/sessions/vm-ar-7'
  );
  await expect(rows.nth(1)).toContainText('201');
});
