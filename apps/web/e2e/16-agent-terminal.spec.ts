// 16-agent-terminal.spec.ts — per-run live terminal over the attach WebSocket.
//
// Mocks:
//   - GET /api/v1/agent-runs/{id}/attach (WebSocket) → in-page double that
//     replays scripted tty frames and records every frame the terminal sends
//   - POST /api/v1/agent-runs/{id}/control → the toolbar's REST interrupt
//   - Standard bootstrap / repos / agent-runs mocks
//
// Asserts that each shipped terminal control remains visible and usable in the
// mocked UI lane. The endpoint mocks stay installed so local backend runs can
// keep exercising the same request shapes.

import { expect, test, type Page } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import { mockBootstrap, mockRepoAgentRuns, mockRepoList } from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const REPO = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;
const RUN_ID = 'run-42';
const REPO_PATH = `/repos/${REPO.host}/${REPO.owner}/${REPO.name}`;
const AGENT_PATH = `${REPO_PATH}/agents/${RUN_ID}`;

interface CapturedControl {
  kind: string;
  text?: string;
  cols?: number;
  rows?: number;
}

/**
 * Install browser-bound terminal mocks. The attach socket is a small in-page
 * WebSocket double that replays scripted output and records every frame the
 * terminal sends; the toolbar's REST interrupt still goes through page.route.
 */
async function installMocks(page: Page): Promise<{
  controls: CapturedControl[];
  routeControls: () => Promise<void>;
  streamCount: () => Promise<number>;
  sentKeys: () => Promise<string[]>;
  sentControls: (kind: string) => Promise<CapturedControl[]>;
}> {
  const controls: CapturedControl[] = [];
  await page.addInitScript(() => {
    const win = window as typeof window & {
      __attachCount?: number;
      __attachSent?: Array<{ binary: boolean; text: string }>;
    };
    win.__attachCount = 0;
    win.__attachSent = [];
    const encode = (text: string): string => {
      const bytes = new TextEncoder().encode(text);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    };
    class MockWebSocket {
      static OPEN = 1;
      readyState = 0;
      binaryType = 'blob';
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      private closed = false;

      constructor(public readonly url: string) {
        win.__attachCount = (win.__attachCount ?? 0) + 1;
        const connection = win.__attachCount;
        const prompt = connection === 1 ? '$ cargo test\r\n' : '$ recovered run\r\n';
        const frames = [
          { type: 'attached', controller: true, control_epoch: 1 },
          ...['$ cargo test\r\n', 'PASS all tests\r\n', '$ '].map((text, index) => ({
            type: 'tty',
            event: {
              seq: 1 + index + (connection - 1) * 10,
              stream: 'stdout',
              text: null,
              bytes_b64: encode(index === 0 ? prompt : text),
              exit_code: null,
            },
          })),
        ];
        setTimeout(() => {
          if (this.closed) return;
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.(new Event('open'));
          frames.forEach((frame, index) => {
            setTimeout(() => {
              if (!this.closed) {
                this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(frame) }));
              }
            }, index * 10);
          });
        }, 0);
      }

      send(frame: string | ArrayBufferView): void {
        const binary = typeof frame !== 'string';
        const text = binary ? new TextDecoder().decode(frame as ArrayBufferView) : frame;
        win.__attachSent?.push({ binary, text });
      }

      close(): void {
        this.closed = true;
      }
    }
    // Route only the attach socket to the double; the app's own realtime
    // socket (/api/v1/ws) keeps the browser implementation.
    const RealWebSocket = window.WebSocket;
    class RoutingWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      constructor(url: string | URL, protocols?: string | string[]) {
        if (String(url).includes('/attach')) {
          return new MockWebSocket(String(url)) as unknown as RoutingWebSocket;
        }
        return new RealWebSocket(url, protocols) as unknown as RoutingWebSocket;
      }
    }
    Object.defineProperty(window, 'WebSocket', { configurable: true, value: RoutingWebSocket });
  });

  // Mock the REST control endpoint (the toolbar Ctrl-C button). Playwright
  // prefers the most recently registered route, so this is installed after
  // the shell mocks, from `routeControls()`.
  const routeControls = (): Promise<void> =>
    page.route('**/api/v1/agent-runs/*/control', async (route, request) => {
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }
    try {
      const body = JSON.parse(request.postData() ?? '{}') as CapturedControl;
      controls.push(body);
    } catch {
      // ignore parse errors
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accepted: true,
        agent_run_id: RUN_ID,
        command: 'interrupt',
        control_seq: controls.length,
      }),
    });
  });

  type Sent = Array<{ binary: boolean; text: string }>;
  const sent = (): Promise<Sent> =>
    page.evaluate(() => (window as typeof window & { __attachSent?: Sent }).__attachSent ?? []);
  return {
    controls,
    routeControls,
    streamCount: () =>
      page.evaluate(
        () => (window as typeof window & { __attachCount?: number }).__attachCount ?? 0
      ),
    sentKeys: async () => (await sent()).filter((f) => f.binary).map((f) => f.text),
    sentControls: async (kind: string) =>
      (await sent())
        .filter((f) => !f.binary)
        .map((f) => JSON.parse(f.text) as { type: string; command?: CapturedControl })
        .filter((f) => f.type === 'control' && f.command?.kind === kind)
        .map((f) => f.command as CapturedControl),
  };
}

async function gotoTerminal(page: Page): Promise<AppShellPage> {
  await mockBootstrap(page);
  await mockRepoList(page, [
    { id: REPO, default_branch: 'main', visibility: 'public' },
  ]);
  await mockRepoAgentRuns(page, [
    {
      run_id: RUN_ID,
      branch: 'fix/parser',
      runner: 'runnerd-node-0',
      status: 'running',
      tty_live: true,
      agent: 'editbot',
    },
  ]);
  const shell = new AppShellPage(page);
  await shell.goto(AGENT_PATH);
  await shell.assertShellLoaded();
  await expect(page.getByTestId('agent-terminal')).toBeVisible();
  return shell;
}

test('renders streamed TTY text from the attach socket @action:terminal.stream', async ({ page }) => {
  const mocks = await installMocks(page);
  await gotoTerminal(page);

  await expect(page.getByTestId('agent-terminal-interrupt')).toBeVisible();
  await expect(page.locator('.xterm-rows')).toContainText('PASS all tests');
  await expect(page.getByTestId('agent-terminal-control')).toHaveText('In control');
  expect(await mocks.streamCount()).toBe(1);
});

test('typing sends raw keystrokes up the attach socket @action:terminal.input', async ({ page }) => {
  const mocks = await installMocks(page);
  await gotoTerminal(page);

  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.type('ls');

  await expect.poll(async () => (await mocks.sentKeys()).join('')).toBe('ls');
  expect(mocks.controls).toHaveLength(0);
});

test('Ctrl-C button and Control+C keystroke both send interrupt @action:terminal.interrupt', async ({
  page,
}) => {
  const mocks = await installMocks(page);
  await gotoTerminal(page);
  await mocks.routeControls();

  // (1) The explicit toolbar button (REST, CSRF-protected).
  await page.getByTestId('agent-terminal-interrupt').click();
  await expect.poll(() => mocks.controls.filter((c) => c.kind === 'interrupt').length).toBe(1);

  // (2) A Control+C keystroke in the terminal is an interrupt on the socket.
  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.press('Control+C');
  await expect.poll(async () => (await mocks.sentControls('interrupt')).length).toBe(1);
});

test('a viewport resize drives a resize_pty control @action:terminal.resize', async ({ page }) => {
  const mocks = await installMocks(page);
  await gotoTerminal(page);
  await expect.poll(async () => (await mocks.sentControls('resize_pty')).length).toBeGreaterThan(0);
  const before = (await mocks.sentControls('resize_pty')).length;

  await page.setViewportSize({ width: 700, height: 900 });

  await expect
    .poll(async () => (await mocks.sentControls('resize_pty')).length)
    .toBeGreaterThan(before);
});

test('recovers after a reload by re-attaching @action:terminal.reconnect', async ({ page }) => {
  const mocks = await installMocks(page);
  await gotoTerminal(page);

  await page.reload();
  await expect(page.getByTestId('agent-terminal')).toBeVisible();
  await expect(page.locator('.xterm-rows')).toContainText('PASS all tests');
  expect(await mocks.streamCount()).toBe(1);
});
