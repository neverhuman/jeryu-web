// 51-agent-presence.spec.ts — everyone at work on a repository, on its Agents tab.
//
// Mocks `GET /api/v1/repos/{id}/agent-presence` and the family list
// `GET /api/v1/agent-presence?family=<key>`. Asserts one list of agents with
// their family reach and collisions, links into the app, a jeryu run row that
// still opens the terminal, the fall-back to the runs list on a server without
// the route, the family rail's active agents, and a phone-width render.

import { expect, test, type Page } from './fixtures/test';

import {
  blockingViolations,
  persistAxeResult,
  persistRenderedEvidence,
  runAxe,
} from './fixtures/accessibility';
import { AppShellPage } from './pages/AppShellPage';
import {
  mockAgentControl,
  mockBootstrap,
  mockCompanionShell,
  mockFamilyAgentPresence,
  mockRepoAgentPresence,
  mockRepoAgentRuns,
  mockRepoList,
  mockTtyStream,
  type MockPresenceItem,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const PHONE = { width: 390, height: 844 };
const WIDGETS = { host: 'forge', owner: 'acme', name: 'widgets' };
const GEARS = { host: 'forge', owner: 'acme', name: 'gears' };
const REPO_PATH = `/repos/${WIDGETS.host}/${WIDGETS.owner}/${WIDGETS.name}`;

const PRESENCE: MockPresenceItem[] = [
  {
    id: 'external:cli:ada-1',
    agent: 'claude-code',
    model: 'model-x',
    operator: 'ada',
    lane: 'presence-tab',
    branch: 'ada/presence-tab',
    title: 'Wire presence into the repository tab',
    started_minutes_ago: 50,
    seen_minutes_ago: 1,
    cost_usd: 1.23,
    host: 'node-a',
    links: { pr: 'acme/widgets#12', todo: 'acme:20261012-1200-abc123' },
    collides_with: ['external:cli:grace-1'],
  },
  {
    id: 'external:cli:grace-1',
    agent: 'codex',
    model: 'model-y',
    operator: 'grace',
    branch: 'ada/presence-tab',
    title: 'Family-wide dependency bump',
    via: 'family',
    family: 'acme',
    seen_minutes_ago: 3,
    collides_with: ['external:cli:ada-1'],
  },
  {
    id: 'reviewer:node-b:w1',
    source: 'reviewer',
    agent: 'reviewer',
    state: 'idle',
    seen_minutes_ago: 4,
    links: { pr: 'acme/widgets#11' },
  },
  {
    id: 'agent_run:run-2',
    source: 'agent_run',
    agent: 'editor',
    branch: 'feat/cache',
    state: 'ended',
    seen_minutes_ago: 20,
    links: { agent_run: 'run-2' },
  },
];

async function seed(page: Page, presence: MockPresenceItem[] | null): Promise<void> {
  await mockBootstrap(page, { login: 'ada', auth: { role: 'admin' } });
  await mockRepoList(page, [
    { id: WIDGETS, default_branch: 'main', visibility: 'private', family: 'acme' },
    { id: GEARS, default_branch: 'main', visibility: 'private', family: 'acme' },
  ]);
  await mockRepoAgentRuns(page, [
    {
      run_id: 'run-2',
      branch: 'feat/cache',
      runner: 'node-b',
      status: 'exited',
      tty_live: false,
      agent: 'editor',
    },
  ]);
  await mockRepoAgentPresence(page, presence);
  await mockFamilyAgentPresence(
    page,
    presence === null
      ? null
      : [
          { ...PRESENCE[0], repos: ['acme/widgets'] },
          { ...PRESENCE[1], via: undefined, family: undefined, repos: [], families: ['acme'] },
          {
            id: 'external:cli:ada-2',
            agent: 'codex',
            operator: 'ada',
            title: 'Gears cleanup',
            repos: ['acme/gears'],
          },
        ]
  );
  await mockTtyStream(page);
  await mockAgentControl(page);
  await mockCompanionShell(page);
}

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(root.scrollWidth - window.innerWidth, document.body.scrollWidth - window.innerWidth);
  });
}

test('lists everyone at work, with family reach, collisions and links @action:agents.presence_list', async ({
  page,
}) => {
  await seed(page, PRESENCE);

  const shell = new AppShellPage(page);
  await shell.goto(`${REPO_PATH}/agents`);
  await shell.assertShellLoaded();

  const list = page.getByTestId('agents-presence-list');
  await expect(list).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(4);
  // Live first; the ended run comes last and is listed once.
  await expect(list.getByRole('listitem').last()).toHaveAttribute(
    'data-testid',
    'presence-row-agent_run:run-2'
  );
  await expect(page.getByTestId('agent-row-run-2')).toHaveCount(1);
  await expect(page.getByTestId('agents-list')).toHaveCount(0);
  await expect(page.getByTestId('agents-presence-live')).toHaveText('3 live');

  const ada = page.getByTestId('presence-row-external:cli:ada-1');
  await expect(ada).toContainText('claude-code · model-x');
  await expect(ada).toContainText('Wire presence into the repository tab');
  await expect(ada).toContainText('ada');
  await expect(ada).toContainText('checkout presence-tab');
  await expect(ada).toContainText('$1.23 so far');
  await expect(page.getByTestId('presence-host-external:cli:ada-1')).toHaveText(/node-a/);
  await expect(page.getByTestId('presence-collision-external:cli:ada-1')).toContainText(
    'codex (grace)'
  );
  await expect(page.getByTestId('presence-via-family-external:cli:grace-1')).toHaveText(
    'via family acme'
  );
  await expect(page.getByTestId('presence-via-family-external:cli:ada-1')).toHaveCount(0);
  await expect(page.getByTestId('presence-source-reviewer:node-b:w1')).toHaveText('reviewer');
  await expect(page.getByTestId('presence-todo-external:cli:ada-1')).toHaveAttribute(
    'href',
    '/work/20261012-1200-abc123?family=acme'
  );

  // The tab bar counts the live agents the list holds.
  await expect(page.getByTestId('repo-tab-count-agents')).toHaveText('3');

  // The pull request link is the app's own page, followed in-app.
  await page.getByTestId('presence-pr-external:cli:ada-1').click();
  await expect(page).toHaveURL(/\/repos\/forge\/acme\/widgets\/pulls\/12$/);
});

test('a jeryu run row in the presence list opens its terminal @action:agents.presence_open_run', async ({
  page,
}) => {
  await seed(page, PRESENCE);

  const shell = new AppShellPage(page);
  await shell.goto(`${REPO_PATH}/agents`);
  await shell.assertShellLoaded();

  await expect(page.getByTestId('agent-status-run-2')).toHaveText('exited');
  await page.getByTestId('agent-row-run-2').click();

  const terminal = page.getByTestId('agent-terminal').first();
  await expect(terminal).toBeVisible();
  await expect(terminal).toHaveAttribute('data-run-id', 'run-2');
  await expect(page.getByTestId('agent-row-run-2')).toHaveAttribute('aria-pressed', 'true');
});

test('a server without the presence route shows the runs alone, with no banner @action:agents.presence_degrade', async ({
  page,
}) => {
  await seed(page, null);

  const shell = new AppShellPage(page);
  await shell.goto(`${REPO_PATH}/agents`);
  await shell.assertShellLoaded();

  await expect(page.getByTestId('agents-list')).toBeVisible();
  await expect(page.getByTestId('agent-row-run-2')).toContainText('feat/cache');
  await expect(page.getByTestId('agents-presence')).toHaveCount(0);
  await expect(page.getByTestId('agents-presence-error')).toHaveCount(0);
  await expect(page.getByTestId('agents-runs-error')).toHaveCount(0);
  // The family rail draws no agents section either.
  await expect(page.getByTestId('family-agents')).toHaveCount(0);

  // The terminal flow is the one it always was.
  await page.getByTestId('agent-row-run-2').click();
  await expect(page.getByTestId('agent-terminal').first()).toHaveAttribute('data-run-id', 'run-2');
});

test('the presence list reads at phone width @action:agents.presence_phone', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, PRESENCE);

  const shell = new AppShellPage(page);
  await shell.goto(`${REPO_PATH}/agents`);
  await shell.assertShellLoaded(15_000);

  await expect(page.getByTestId('presence-collision-external:cli:ada-1')).toBeVisible();
  await expect
    .poll(() => sidewaysOverflow(page), {
      message: `agents presence scrolls sideways at ${PHONE.width}px`,
    })
    .toBeLessThanOrEqual(0);

  const result = await runAxe(page, {
    include: '[data-testid="agents-presence"]',
    disableRules: ['color-contrast'],
  });
  await persistAxeResult('repo-agents-presence-phone', result);
  const rendered = await persistRenderedEvidence(page, 'repo-agents-presence-phone');
  expect(rendered.geometry.width).toBeGreaterThan(0);
  expect(
    blockingViolations(result).map((v) => `${v.impact ?? '?'} ${v.id}`),
    'blocking axe violations on the presence list'
  ).toEqual([]);
});


test('repository presence opens a terminal by keyboard @action:agents.presence_keyboard', async ({ page }) => {
  await seed(page, PRESENCE);
  await page.goto(`${REPO_PATH}/agents`);
  const row = page.getByTestId('presence-row-agent_run:run-2');
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('agent-terminal').first()).toHaveAttribute('data-run-id', 'run-2');
});
