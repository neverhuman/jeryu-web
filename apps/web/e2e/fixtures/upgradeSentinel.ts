// upgradeSentinel.ts — an origin that records WebSocket upgrades.
//
// A mocked socket never leaves Chromium, which is exactly what makes the
// mock hard to prove: there is no request to look for. So this helper gives
// the page a second origin to load from — a small Node server that proxies
// every GET to the dev server and records (then drops) every upgrade request
// it is asked for. Load the SPA from it and the app's `/api/v1/ws` connection
// lands here unless something intercepted it first.
//
// Used by `e2e/33-realtime-socket.spec.ts`.

import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface UpgradeSentinel {
  /** `http://127.0.0.1:<port>` — load the SPA from here. */
  readonly origin: string;
  /** Paths of the upgrade requests this origin was asked for. */
  readonly upgrades: string[];
  close(): Promise<void>;
}

/** Start a sentinel that serves `target`'s files and records upgrades. */
export async function startUpgradeSentinel(target: string): Promise<UpgradeSentinel> {
  const upgrades: string[] = [];
  const server = http.createServer((request, response) => {
    void (async () => {
      try {
        const upstream = await fetch(new URL(request.url ?? '/', target), {
          headers: { accept: request.headers.accept ?? '*/*', 'accept-encoding': 'identity' },
          redirect: 'manual',
        });
        const body = Buffer.from(await upstream.arrayBuffer());
        response.writeHead(upstream.status, {
          'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
          'content-length': String(body.byteLength),
        });
        response.end(body);
      } catch (err) {
        response.writeHead(502, { 'content-type': 'text/plain' });
        response.end(err instanceof Error ? err.message : 'sentinel proxy failed');
      }
    })();
  });

  server.on('upgrade', (request, socket) => {
    upgrades.push(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    socket.destroy();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${port}`,
    upgrades,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
