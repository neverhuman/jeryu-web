// 33-realtime-socket.spec.ts — the app's socket stays inside the browser.
//
// `e2e/fixtures/realtime.ts` answers `/api/v1/ws` with `page.routeWebSocket`
// for every test. This spec is the proof: load the SPA from an origin that
// records every upgrade request it is asked for, and show the app's socket
// never arrives there — while a page without the mock does reach it, so the
// recorder is not simply blind.
//
// Before the mock, that upgrade travelled through the Vite dev proxy to
// whatever answers 127.0.0.1:8787 — on the shift boxes, a tunnel to the
// hosted forge, which refused it and made the SPA reconnect for the length
// of every test.

import { expect, test } from './fixtures/test';

import { mockBootstrap } from './fixtures/mocks';
import { startUpgradeSentinel } from './fixtures/upgradeSentinel';

const WS_PATH = '/api/v1/ws';

test('the app socket never leaves the browser @action:ws.no_egress', async ({
  page,
  context,
  baseURL,
  realtime,
}) => {
  const sentinel = await startUpgradeSentinel(baseURL ?? 'http://127.0.0.1:5175');
  const wsUpgrades = (): string[] => sentinel.upgrades.filter((path) => path === WS_PATH);

  try {
    await mockBootstrap(page);
    await page.goto(`${sentinel.origin}/`);

    // The SPA mounted and holds a socket — answered in the browser.
    await expect(page.getByTestId('live-pill')).toBeVisible({ timeout: 15_000 });
    await realtime.waitForOpen();
    await realtime.hello();
    await expect(page.getByTestId('live-pill')).toHaveText('Live');

    // Give a reconnect loop time to show itself before reading the recorder.
    await page.waitForTimeout(2_000);
    expect(wsUpgrades(), 'the mocked socket must not reach the server').toEqual([]);

    // Control: the same app, one page without the mock, does reach it. The
    // recorder works, so the empty list above means interception, not silence.
    const unmocked = await context.newPage();
    try {
      await mockBootstrap(unmocked);
      await unmocked.goto(`${sentinel.origin}/`);
      await expect
        .poll(() => wsUpgrades().length, { timeout: 15_000 })
        .toBeGreaterThan(0);
    } finally {
      await unmocked.close();
    }
  } finally {
    await sentinel.close();
  }
});
