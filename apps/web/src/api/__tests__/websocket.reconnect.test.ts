// websocket.reconnect.test.ts — JeRyuWsClient reconnect lifecycle.
//
// When the socket drops without the app asking for it, the client must back
// off, open a fresh socket, and resume from the last cursor it saw with every
// scope it was subscribed to. An explicit `disconnect()` must stay closed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  JeRyuWsClient,
  type JeRyuWsClientHandlers,
  type RealtimeStatus,
} from '../websocket';

type Listener = (ev: unknown) => void;

/** Minimal scriptable WebSocket double, as in `websocket.test.ts`. */
class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  static failNext = false;

  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  private listeners: Record<string, Listener[]> = {};

  constructor(public url: string) {
    if (FakeWebSocket.failNext) {
      FakeWebSocket.failNext = false;
      throw new Error('blocked by test');
    }
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: Listener): void {
    (this.listeners[type] ??= []).push(fn);
  }

  removeEventListener(): void {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
    this.readyState = 3;
  }

  emit(type: string, ev: unknown): void {
    for (const fn of this.listeners[type] ?? []) fn(ev);
  }

  frames(): { type: string; [k: string]: unknown }[] {
    return this.sent.map((s) => JSON.parse(s));
  }
}

function makeHandlers(): {
  handlers: JeRyuWsClientHandlers;
  statuses: RealtimeStatus[];
  errors: string[];
} {
  const statuses: RealtimeStatus[] = [];
  const errors: string[] = [];
  return {
    statuses,
    errors,
    handlers: {
      onStatus: (s) => statuses.push(s),
      onEvent: () => {},
      onSnapshotRequired: () => {},
      onError: (code) => errors.push(code),
    },
  };
}

function eventFrame(seq: number): { data: string } {
  return {
    data: JSON.stringify({
      type: 'event',
      event: {
        seq,
        timestamp: '2026-01-01T00:00:00Z',
        scope: 'global.activity',
        kind: 'repo.updated',
        entity: 'repo:1',
        summary: 'updated',
        payload: {},
      },
    }),
  };
}

describe('JeRyuWsClient reconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Jitter = floor(random * backoff); 0.5 makes the delay exactly half.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    FakeWebSocket.instances = [];
    FakeWebSocket.failNext = false;
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function start(h: JeRyuWsClientHandlers): { client: JeRyuWsClient; socket: FakeWebSocket } {
    const client = new JeRyuWsClient({
      url: 'wss://example.test/api/v1/ws',
      initialSubscriptions: [{ scope: 'global.activity', filters: {} }],
      resumeFrom: null,
      handlers: h,
    });
    client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    return { client, socket };
  }

  it('reopens after an unexpected close and resumes from the last cursor with every scope', () => {
    const h = makeHandlers();
    const { client, socket } = start(h.handlers);
    client.subscribe([{ scope: 'repo.jeryu', filters: {} }]);
    socket.emit('message', eventFrame(7));

    socket.emit('close', {});
    expect(h.statuses.at(-1)).toBe('reconnecting');
    expect(FakeWebSocket.instances).toHaveLength(1);

    // First attempt: backoff 500 * 2^1 = 1000ms, jitter 500ms.
    vi.advanceTimersByTime(499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    const next = FakeWebSocket.instances[1];
    next.emit('open', {});
    expect(h.statuses.at(-1)).toBe('open');
    const hello = next.frames().find((f) => f.type === 'hello');
    expect(hello?.resume_from).toBe(7);
    expect(
      (hello?.subscriptions as { scope: string }[]).map((s) => s.scope).sort()
    ).toEqual(['global.activity', 'repo.jeryu']);
    expect(client.getResumeFrom()).toBe(7n);
  });

  it('backs off longer on each failed attempt and resets once a socket opens', () => {
    const h = makeHandlers();
    const { socket } = start(h.handlers);

    socket.emit('close', {});
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(2);

    // Second attempt fails before opening: backoff 2000ms, jitter 1000ms.
    FakeWebSocket.instances[1].emit('close', {});
    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);

    // A successful open resets the attempt counter back to the first delay.
    FakeWebSocket.instances[2].emit('open', {});
    FakeWebSocket.instances[2].emit('close', {});
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(4);
  });

  it('caps the backoff at thirty seconds', () => {
    const h = makeHandlers();
    const { socket } = start(h.handlers);
    vi.spyOn(Math, 'random').mockReturnValue(0.999);

    socket.emit('close', {});
    for (let i = 1; i < 10; i += 1) {
      vi.advanceTimersByTime(30_000);
      expect(FakeWebSocket.instances).toHaveLength(i + 1);
      FakeWebSocket.instances[i].emit('close', {});
    }
  });

  it('stays closed after an explicit disconnect', () => {
    const h = makeHandlers();
    const { client, socket } = start(h.handlers);

    client.disconnect();
    expect(socket.closed?.code).toBe(1000);
    socket.emit('close', {});
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(h.statuses.at(-1)).toBe('closed');
  });

  it('cancels a pending reconnect on disconnect', () => {
    const h = makeHandlers();
    const { client, socket } = start(h.handlers);

    socket.emit('close', {});
    client.disconnect();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(h.statuses.at(-1)).toBe('closed');
  });

  it('closes a silent socket after the read timeout, then reconnects', () => {
    const h = makeHandlers();
    const { socket } = start(h.handlers);

    vi.advanceTimersByTime(29_999);
    expect(socket.closed).toBeNull();
    vi.advanceTimersByTime(1);
    expect(socket.closed?.code).toBe(4000);

    socket.emit('close', {});
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('pings on the heartbeat interval while open', () => {
    const h = makeHandlers();
    const { socket } = start(h.handlers);
    socket.sent.length = 0;
    vi.advanceTimersByTime(15_000);
    expect(socket.frames().map((f) => f.type)).toEqual(['ping']);
  });

  it('reports a socket that cannot be constructed and retries it', () => {
    const h = makeHandlers();
    FakeWebSocket.failNext = true;
    const client = new JeRyuWsClient({
      url: 'wss://example.test/api/v1/ws',
      initialSubscriptions: [],
      resumeFrom: 3n,
      handlers: h.handlers,
    });
    client.connect();
    expect(h.errors).toEqual(['ws_open_failed']);
    expect(h.statuses).toEqual(['connecting', 'reconnecting']);
    expect(FakeWebSocket.instances).toHaveLength(0);

    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.instances[0].emit('open', {});
    const hello = FakeWebSocket.instances[0].frames().find((f) => f.type === 'hello');
    expect(hello?.resume_from).toBe(3);
  });
});
