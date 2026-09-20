// realtime.ts — the app's WebSocket, answered inside the browser.
//
// The SPA opens `/api/v1/ws` as soon as it mounts. `page.route` and
// `context.route` only see HTTP requests, so a route on that path does nothing
// to the socket: it goes out over the browser's network stack, through the Vite
// dev proxy, and on some boxes into a tunnel that reaches the hosted forge.
// Hundreds of unauthenticated upgrade attempts per gate run, and the SPA
// reconnecting in a loop for the length of every test.
//
// `page.routeWebSocket` does see it. The handler below accepts the socket and
// never calls `connectToServer`, so nothing leaves the browser and the page
// holds an open, silent connection — which is what almost every spec wants.
// A spec that tests live updates pushes frames through the returned handle:
// `hello()` for the transport state the "Live" pill reads, `event()` for the
// pipeline nudge.
//
// `fixtures/test.ts` installs this for every test, so specs only reach for the
// handle when they want to send something.

import type { Page, WebSocketRoute } from '@playwright/test';

/** The SPA's socket path (`endpoints.ws()`), on any origin. */
export const REALTIME_WS_PATTERN = '**/api/v1/ws';

/** Wire protocol identifier (`src/api/websocketProtocol.ts`). A `hello` frame
 *  carrying anything else makes the client tear the socket down. */
export const REALTIME_WS_PROTOCOL = 'jeryu.ws.v1';

/** The shape of an `event` frame's payload, as `isWebEvent` demands it. */
export interface RealtimeEvent {
  seq: number;
  scope: string;
  kind: string;
  entity: string;
  [key: string]: unknown;
}

export interface RealtimeSocket {
  /** Sockets the page has opened so far, newest last. */
  readonly openCount: number;
  /** Frames the page has sent, oldest first (`hello`, `ack`, `ping`, ...). */
  readonly sentFrames: string[];
  /** Resolve once the page has an open socket. */
  waitForOpen(timeout?: number): Promise<void>;
  /** Push the server `hello`: the client answers by reporting itself open. */
  hello(options?: { currentSeq?: number; protocol?: string }): Promise<void>;
  /** Push one `event` frame on a scope the page subscribed to. */
  event(event: RealtimeEvent): Promise<void>;
  /** Push a raw server frame. */
  send(frame: unknown): Promise<void>;
  /** Close the page's current socket; the client reconnects on its backoff. */
  close(options?: { code?: number; reason?: string }): Promise<void>;
}

/**
 * Answer `/api/v1/ws` for `page` from the browser. Silent until the caller
 * pushes a frame.
 */
export async function mockRealtimeSocket(page: Page): Promise<RealtimeSocket> {
  const open: WebSocketRoute[] = [];
  const sentFrames: string[] = [];
  let openCount = 0;

  await page.routeWebSocket(REALTIME_WS_PATTERN, (ws) => {
    open.push(ws);
    openCount += 1;
    ws.onMessage((message) => {
      sentFrames.push(typeof message === 'string' ? message : message.toString('utf8'));
    });
    ws.onClose(() => {
      const at = open.indexOf(ws);
      if (at >= 0) open.splice(at, 1);
    });
  });

  async function current(timeout = 10_000): Promise<WebSocketRoute> {
    const deadline = Date.now() + timeout;
    while (open.length === 0) {
      if (Date.now() > deadline) {
        throw new Error(
          `The page opened no WebSocket on ${REALTIME_WS_PATTERN} within ${timeout} ms.`
        );
      }
      await page.waitForTimeout(50);
    }
    return open[open.length - 1];
  }

  return {
    get openCount() {
      return openCount;
    },
    get sentFrames() {
      return sentFrames;
    },
    async waitForOpen(timeout?: number) {
      await current(timeout);
    },
    async hello(options = {}) {
      await this.send({
        type: 'hello',
        protocol: options.protocol ?? REALTIME_WS_PROTOCOL,
        server_time: new Date().toISOString(),
        current_seq: options.currentSeq ?? 1,
      });
    },
    async event(event: RealtimeEvent) {
      await this.send({ type: 'event', event });
    },
    async send(frame: unknown) {
      (await current()).send(JSON.stringify(frame));
    },
    async close(options = {}) {
      (await current()).close(options);
    },
  };
}
