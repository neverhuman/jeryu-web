// 49-sessions.spec.ts — your agent sessions across repositories: each one
// opens on its own page (its VM, both terminals' controls and who sent each,
// what bots did in it), the session runner says whether it can take another,
// and a running session stops only after a confirmation, with a
// CSRF-protected control.

import { expect, test, type Route } from './fixtures/test';

import { mockBootstrap, mockRepoList } from './fixtures/mocks';

const SESSION = {
  session_id: 'vm-ar-7',
  run_id: 'ar-7',
  shell_run_id: 'ar-8',
  repo: 'alice/demo',
  provider: 'grok',
  profile_id: 'mock-grok',
  owner: 'alice',
  started_by: 'bot/atlas',
  labels: { model: 'grok-4', todo_id: '42' },
  runner_id: 'node-a',
  generation: 1,
  dispatch_state: 'running',
  state_reason: null,
  agent_state: 'running',
  shell_state: 'running',
  created_at_ms: Date.now() - 300_000,
  updated_at_ms: Date.now() - 60_000,
  lease_expires_at_ms: Date.now() + 3_600_000,
  source_revision: 'a'.repeat(40),
  main_revision: 'a'.repeat(40)
};

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

async function mockSessions(
  page: Parameters<typeof mockBootstrap>[0],
  running: () => unknown[]
): Promise<void> {
  await mockRepoList(page, [
    { id: { host: 'jeryu', owner: 'alice', name: 'demo' } }
  ]);
  await page.route('**/api/v1/me/sessions?state=running', (route) =>
    json(route, { count: running().length, sessions: running() })
  );
  await page.route('**/api/v1/runner/status', (route) =>
    json(route, {
      ready: true,
      runtime: 'firecracker',
      runner_id: 'node-a',
      profiles: {
        claude: 'mock-claude',
        codex: 'mock-codex',
        grok: 'mock-grok'
      },
      open_sessions: { mine: running().length, all: null }
    })
  );
}

test.describe('Sessions', () => {
  test('lists your sessions and opens one @action:sessions.list', async ({
    page
  }) => {
    await mockBootstrap(page, {
      login: 'alice',
      auth: { role: 'user', csrfToken: 'csrf-user' }
    });
    await mockSessions(page, () => [SESSION]);

    await page.goto('/sessions');
    await expect(page.getByTestId('sessions-runner')).toContainText(
      'The session runner is ready on node-a, for claude, codex, grok.'
    );
    const row = page.getByTestId('sessions-row');
    await expect(row).toContainText('grok-4');
    await expect(row).toContainText('bot/atlas');
    await expect(row.getByRole('link', { name: 'todo 42' })).toHaveAttribute(
      'href',
      '/work/42'
    );
    await expect(row.getByRole('link', { name: 'vm-ar-7' })).toHaveAttribute(
      'href',
      '/sessions/vm-ar-7'
    );
  });

  test('opens a session with its VM, who sent each control and what bots did in it @action:sessions.detail', async ({
    page
  }) => {
    await mockBootstrap(page, {
      login: 'alice',
      auth: { role: 'user', csrfToken: 'csrf-user' }
    });
    await mockSessions(page, () => [SESSION]);
    const channel = (run: string, controls: unknown[]) => ({
      run_id: run,
      state: 'running',
      error_code: null,
      exit_code: null,
      recent_controls: controls
    });
    await page.route(/\/api\/v1\/me\/sessions\/vm-ar-7$/, (route) =>
      json(route, {
        ...SESSION,
        channels: {
          agent: channel('ar-7', []),
          shell: channel('ar-8', [
            {
              seq: 2,
              command: 'send_input',
              actor: 'api:alice',
              outcome: null
            },
            {
              seq: 1,
              command: 'send_input',
              actor: 'bot/atlas',
              outcome: 'applied'
            }
          ])
        }
      })
    );
    await page.route(/\/api\/v1\/repos\/alice%2Fdemo\/bots$/, (route) =>
      json(route, { bots: [{ id: 'bot-1', display_name: 'Atlas' }] })
    );
    const event = (id: string, session: string, action: string) => ({
      id,
      bot_id: 'bot-1',
      key_id: 'k-1',
      repo: 'alice/demo',
      session_id: session,
      action,
      outcome: 'ok',
      scope: 'mcp',
      created_at: new Date(Date.now() - 30_000).toISOString()
    });
    await page.route(/\/api\/v1\/repos\/alice%2Fdemo\/bot-activity$/, (route) =>
      json(route, {
        events: [
          event('e-1', 'vm-ar-7', 'session.send_input'),
          event('e-2', 'vm-ar-9', 'session.stop')
        ]
      })
    );

    await page.goto('/sessions');
    await page
      .getByTestId('sessions-row')
      .getByRole('link', { name: 'vm-ar-7' })
      .click();
    await expect(page).toHaveURL(/\/sessions\/vm-ar-7$/);
    await expect(page.getByTestId('session-facts')).toContainText(
      `${SESSION.runner_id} generation 1`
    );
    const controls = page
      .getByTestId('session-channel-shell')
      .getByTestId('session-control');
    await expect(controls.first()).toContainText('alice');
    await expect(controls.nth(1)).toContainText('bot/atlas');
    const activity = page.getByTestId('session-bot-activity-row');
    await expect(activity).toHaveCount(1);
    await expect(activity.first()).toContainText('session.send_input');
    await expect(activity.first()).toContainText('Atlas');
    await expect(
      page.getByRole('link', { name: 'Open its terminals' })
    ).toHaveAttribute('href', '/repos/jeryu/alice/demo/agents/ar-7');
  });

  test('stop only after a confirmation @action:sessions.stop', async ({
    page
  }) => {
    await mockBootstrap(page, {
      login: 'alice',
      auth: { role: 'user', csrfToken: 'csrf-user' }
    });
    let running = [SESSION];
    await mockSessions(page, () => running);
    const controls: { run: string; csrf: string; body: unknown }[] = [];
    await page.route(
      '**/api/v1/agent-runs/*/control',
      async (route, request) => {
        expect(request.method()).toBe('POST');
        controls.push({
          run: new URL(request.url()).pathname.split('/')[4],
          csrf: request.headers()['x-jeryu-csrf'] ?? '',
          body: request.postDataJSON()
        });
        running = [];
        await json(route, { accepted: true, control_seq: 1 });
      }
    );

    await page.goto('/sessions');
    const row = page.getByTestId('sessions-row');
    await row.getByRole('button', { name: 'Stop vm-ar-7' }).click();
    await expect(
      page.getByText(
        'Stopping ends the VM: the agent and the shell in it stop together.'
      )
    ).toBeVisible();
    expect(controls).toEqual([]);
    await row.getByRole('button', { name: 'Confirm stop' }).click();
    await expect(page.getByTestId('sessions-empty')).toBeVisible();
    expect(controls).toEqual([
      { run: 'ar-7', csrf: 'csrf-user', body: { kind: 'terminate' } }
    ]);
  });
});
