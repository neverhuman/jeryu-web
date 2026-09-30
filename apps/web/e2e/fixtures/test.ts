// test.ts — the `test` every spec imports: Playwright's, with the app's own
// files served to the page from this Node process instead of over the
// browser's network stack.
//
// Why: Chromium aborts every in-flight request with `net::ERR_NETWORK_CHANGED`
// whenever a network interface on the host changes, loopback traffic included.
// On a shared box that is every Docker container another job starts or stops.
// The Vite dev server hands the SPA over as a few hundred separate modules, so a
// page load is a wide target; one aborted module and the app never mounts, and
// the test fails on its first locator with "element(s) not found" on code that
// is fine. A request answered through `route.fulfill` never gets a browser
// socket, so there is nothing for the network change to abort.
//
// API calls are left alone: specs mock `/api/v1/*` with their own routes, which
// are registered later and so win over this one.
//
// An `/api/v1/*` call a spec did not mock is failed here instead of travelling
// to the dev server's proxy. In UI-only mode there is no backend of ours on the
// proxy's port, but on a shared box someone else's server can be listening, and
// its answer -- a 404 for a repository it has never heard of, say -- makes the
// app draw a different page than the spec is about. A failed call is what the
// spec means by "not mocked", and it is the same on every box.
//
// The app's WebSocket is answered in the browser too, by the auto-used
// `realtime` fixture below (`./realtime`), so no socket reaches the dev proxy.

import { test as base, type BrowserContext, type Route } from '@playwright/test';

import { mockRealtimeSocket, type RealtimeSocket } from './realtime';

export * from '@playwright/test';
export type { RealtimeEvent, RealtimeSocket } from './realtime';

interface ServedFile {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

// One per worker process. The dev server's answer for a URL does not change
// within a run, so later tests in the worker load the app from memory.
const served = new Map<string, ServedFile>();

async function serveFromNode(route: Route): Promise<void> {
  const request = route.request();
  if (request.method() !== 'GET') {
    await route.fallback();
    return;
  }
  const url = request.url();
  let file = served.get(url);
  if (!file) {
    const response = await route.fetch();
    file = {
      status: response.status(),
      headers: response.headers(),
      body: await response.body(),
    };
    if (response.ok()) served.set(url, file);
  }
  await route.fulfill(file);
}

// The modes that serve the SPA with no backend of ours behind `/api`.
const MOCKED_MODES = new Set(['ui-only', 'ui-mocked']);

/** Fail every `/api/v1/*` call a spec has not mocked. Mocked modes only. */
export async function failUnmockedApi(
  context: BrowserContext,
  baseURL: string | undefined
): Promise<void> {
  if (!baseURL) return;
  if (!MOCKED_MODES.has(process.env.JERYU_PLAYWRIGHT_E2E_MODE ?? 'ui-only')) return;
  const origin = new URL(baseURL).origin;
  await context.route(
    (url) => url.origin === origin && url.pathname.startsWith('/api/v1/'),
    async (route: Route) => {
      await route.abort('connectionrefused');
    }
  );
}

export async function serveAppFromNode(
  context: BrowserContext,
  baseURL: string | undefined
): Promise<void> {
  if (!baseURL) return;
  const origin = new URL(baseURL).origin;
  await context.route(
    (url) => url.origin === origin && !url.pathname.startsWith('/api/'),
    serveFromNode
  );
}

export const test = base.extend<{ realtime: RealtimeSocket }>({
  context: async ({ context, baseURL }, provide) => {
    await serveAppFromNode(context, baseURL);
    await failUnmockedApi(context, baseURL);
    await provide(context);
    // A test may end while a file is still on its way to the page; that fetch
    // dies with the context and is not a failure of the test.
    await context.unrouteAll({ behavior: 'ignoreErrors' });
  },
  // Auto-used: every test gets the socket answered in the browser, silent
  // unless the test asks for the handle and pushes frames through it.
  realtime: [
    async ({ page }, provide) => {
      await provide(await mockRealtimeSocket(page));
    },
    { auto: true },
  ],
});
