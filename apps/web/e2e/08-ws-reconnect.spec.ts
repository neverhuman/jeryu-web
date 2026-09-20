// 08-ws-reconnect.spec.ts — WS disconnect + reconnect smoke (W-T-16).
//
// The SPA's `JeRyuWsClient` (apps/web/src/api/websocket.ts) drives
// transport-level state in the GlobalHeader's "live" pill: "Live" once the
// socket is open, "Connecting" / "Reconnecting" / "Offline" / "Idle"
// otherwise. The reconnect policy is exponential backoff capped at 30 s
// with full jitter, starting at 500 ms.
//
// The socket is answered inside the browser by the `realtime` fixture
// (`e2e/fixtures/realtime.ts`), so nothing here touches a server. This spec
// opts in to driving it: a server `hello`, then a close, then the reconnect.

import { expect, test } from './fixtures/test';

import { mockBootstrap } from './fixtures/mocks';
import { REALTIME_WS_PATTERN } from './fixtures/realtime';

test.describe.configure({ retries: 1 });

test.describe('WebSocket reconnect (W-T-16)', () => {
  test('the pill reads Live, survives a close, and comes back @action:ws.reconnect', async ({
    page,
    realtime,
  }) => {
    await mockBootstrap(page);
    await page.goto('/');

    const shell = page.locator('.global-header, .app-shell, [role="alert"]').first();
    await expect(shell).toBeVisible({ timeout: 15_000 });

    // The page's first socket, answered in the browser. A server `hello` is
    // what the client waits for before it trusts the connection.
    await realtime.waitForOpen();
    await realtime.hello();
    const pill = page.getByTestId('live-pill');
    await expect(pill).toHaveText('Live');

    // Drop it the way a forge restart would. Backoff reopens the socket and
    // the client greets the new one; the shell never trips an error boundary.
    await realtime.close({ code: 1006 });
    await expect.poll(() => realtime.openCount, { timeout: 15_000 }).toBeGreaterThan(1);
    await expect
      .poll(() => realtime.sentFrames.filter((frame) => frame.includes('"hello"')).length)
      .toBeGreaterThan(1);
    await realtime.hello({ currentSeq: 2 });
    await expect(pill).toHaveText('Live');
    await expect(shell).toBeVisible();
  });

  test('SPA boots without an open WS (graceful degrade) @action:ws.offline_boot', async ({
    page,
  }) => {
    await mockBootstrap(page);
    // Refuse every upgrade. Registered after the fixture's route, so it wins.
    await page.routeWebSocket(REALTIME_WS_PATTERN, (ws) => ws.close({ code: 1006 }));

    await page.goto('/');

    const shell = page.locator('.global-header, .app-shell, [role="alert"]').first();
    await expect(shell).toBeVisible({ timeout: 15_000 });

    // The pill reports the transport honestly and the SPA keeps working.
    const pill = page.getByTestId('live-pill');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveText(/Connecting|Reconnecting|Offline|Idle/);
  });
});
