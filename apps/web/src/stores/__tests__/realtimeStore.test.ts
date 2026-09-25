// realtimeStore.test.ts — the zustand binding over `JeRyuWsClient`: status,
// rolling event buffer, persisted cursor, reference-counted subscriptions,
// agent-TTY taps and snapshot / invalidation fan-out. Error frames are
// covered in `realtimeStore.errors.test.ts`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRealtimeStore } from '../realtimeStore';
import type { WebEvent } from '../../api/types';

type Listener = (ev: unknown) => void;

/** Minimal scriptable WebSocket double, as in `api/__tests__/websocket.test.ts`. */
class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  private listeners: Record<string, Listener[]> = {};

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: Listener): void {
    (this.listeners[type] ??= []).push(fn);
  }

  removeEventListener(): void {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  emit(type: string, ev: unknown): void {
    for (const fn of this.listeners[type] ?? []) fn(ev);
  }

  frames(): { type: string; [k: string]: unknown }[] {
    return this.sent.map((s) => JSON.parse(s));
  }
}

const SEQ_KEY = 'jeryu.ws.lastSeq.v1';

function openSocket(): FakeWebSocket {
  useRealtimeStore.getState().connect();
  const socket = FakeWebSocket.instances.at(-1)!;
  socket.emit('open', {});
  socket.sent.length = 0;
  return socket;
}

function sendEvent(socket: FakeWebSocket, seq: number, scope = 'global.activity'): void {
  socket.emit('message', {
    data: JSON.stringify({
      type: 'event',
      event: {
        seq,
        timestamp: '2026-01-01T00:00:00Z',
        scope,
        kind: 'repo.updated',
        entity: 'repo:1',
        summary: `event ${seq}`,
        payload: {},
      },
    }),
  });
}

describe('realtime store', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    sessionStorage.clear();
    useRealtimeStore.setState({ subscriptions: new Map(), lastSeq: null, status: 'idle' });
    useRealtimeStore.getState().flush();
  });

  afterEach(() => {
    useRealtimeStore.getState().disconnect();
    vi.unstubAllGlobals();
  });

  it('tracks the connection status through connect and disconnect', () => {
    const store = useRealtimeStore.getState();
    store.connect();
    expect(useRealtimeStore.getState().status).toBe('connecting');
    FakeWebSocket.instances[0].emit('open', {});
    expect(useRealtimeStore.getState().status).toBe('open');
    store.disconnect();
    expect(useRealtimeStore.getState().status).toBe('closed');
  });

  it('subscribes to the global activity scope when nothing else is registered', () => {
    useRealtimeStore.getState().connect();
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toMatch(/^ws:\/\/.+\/api\/v1\/ws$/);
    socket.emit('open', {});
    const hello = socket.frames().find((f) => f.type === 'hello');
    expect(hello?.subscriptions).toEqual([{ scope: 'global.activity', filters: {} }]);
  });

  it('opens with the scopes registered before connect and the persisted cursor', () => {
    useRealtimeStore.getState().subscribe(['repo.a']);
    useRealtimeStore.setState({ lastSeq: 12n });
    useRealtimeStore.getState().connect();
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const hello = socket.frames().find((f) => f.type === 'hello');
    expect(hello?.subscriptions).toEqual([{ scope: 'repo.a', filters: {} }]);
    expect(hello?.resume_from).toBe(12);
  });

  it('buffers events newest first, records and persists the cursor', () => {
    const socket = openSocket();
    sendEvent(socket, 1);
    sendEvent(socket, 2);
    const state = useRealtimeStore.getState();
    expect(state.events.map((e) => e.seq)).toEqual([2n, 1n]);
    expect(state.lastSeq).toBe(2n);
    expect(sessionStorage.getItem(SEQ_KEY)).toBe('2');
  });

  it('keeps only the latest 200 events', () => {
    const socket = openSocket();
    for (let seq = 1; seq <= 205; seq += 1) sendEvent(socket, seq);
    const { events } = useRealtimeStore.getState();
    expect(events).toHaveLength(200);
    expect(events[0].seq).toBe(205n);
    expect(events.at(-1)?.seq).toBe(6n);
  });

  it('flush empties the buffer and the last error', () => {
    const socket = openSocket();
    sendEvent(socket, 1);
    socket.emit('message', {
      data: JSON.stringify({ type: 'error', code: 'unknown_message', message: 'x' }),
    });
    useRealtimeStore.getState().flush();
    const state = useRealtimeStore.getState();
    expect(state.events).toEqual([]);
    expect(state.lastError).toBeNull();
    expect(state.lastSeq).toBe(1n);
  });

  it('reference-counts subscriptions and only tells the server on the edges', () => {
    const socket = openSocket();
    const store = useRealtimeStore.getState();
    store.subscribe(['repo.a']);
    store.subscribe(['repo.a']);
    expect(useRealtimeStore.getState().subscriptions.get('repo.a')).toBe(2);
    expect(socket.frames().filter((f) => f.type === 'subscribe')).toHaveLength(1);

    store.unsubscribe(['repo.a']);
    expect(socket.frames().filter((f) => f.type === 'unsubscribe')).toHaveLength(0);
    store.unsubscribe(['repo.a']);
    expect(useRealtimeStore.getState().subscriptions.has('repo.a')).toBe(false);
    expect(socket.frames().find((f) => f.type === 'unsubscribe')?.scopes).toEqual(['repo.a']);

    // Unsubscribing an unknown scope is a no-op.
    store.unsubscribe(['repo.never']);
    expect(socket.frames().filter((f) => f.type === 'unsubscribe')).toHaveLength(1);
  });

  it('records the server cursor from hello and persists it', () => {
    const socket = openSocket();
    socket.emit('message', {
      data: JSON.stringify({
        type: 'hello',
        server_time: '2026-01-01T00:00:00Z',
        current_seq: 30,
        protocol: 'jeryu.ws.v1',
      }),
    });
    expect(useRealtimeStore.getState().lastSeq).toBe(30n);
    expect(sessionStorage.getItem(SEQ_KEY)).toBe('30');
  });

  it('tells snapshot listeners to refetch and stops after they unsubscribe', () => {
    const socket = openSocket();
    const reasons: string[] = [];
    const off = useRealtimeStore.getState().onSnapshotRequired((r) => reasons.push(r));
    socket.emit('message', {
      data: JSON.stringify({ type: 'snapshot_required', reason: 'lagged', current_seq: 90 }),
    });
    expect(reasons).toEqual(['lagged']);
    expect(useRealtimeStore.getState().lastSeq).toBe(90n);
    off();
    socket.emit('message', {
      data: JSON.stringify({ type: 'snapshot_required', reason: 'lagged', current_seq: 91 }),
    });
    expect(reasons).toEqual(['lagged']);
  });

  it('hands every buffered event to invalidators until they are removed', () => {
    const socket = openSocket();
    const seen: WebEvent[] = [];
    const off = useRealtimeStore.getState().addInvalidator((e) => seen.push(e));
    sendEvent(socket, 1);
    off();
    sendEvent(socket, 2);
    expect(seen.map((e) => e.seq)).toEqual([1n]);
  });

  it('streams agent TTY frames to listeners without touching the event buffer', () => {
    const socket = openSocket();
    const store = useRealtimeStore.getState();
    const a: WebEvent[] = [];
    const b: WebEvent[] = [];
    const offA = store.subscribeTty('run-1', (e) => a.push(e));
    const offB = store.subscribeTty('run-1', (e) => b.push(e));
    expect(socket.frames().filter((f) => f.type === 'subscribe')).toHaveLength(1);

    sendEvent(socket, 5, 'agent_run.run-1');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(useRealtimeStore.getState().events).toEqual([]);

    offA();
    expect(socket.frames().filter((f) => f.type === 'unsubscribe')).toHaveLength(0);
    offB();
    expect(socket.frames().find((f) => f.type === 'unsubscribe')?.scopes).toEqual([
      'agent_run.run-1',
    ]);

    // With the tap gone, the scope's frames fall back to the buffer.
    sendEvent(socket, 6, 'agent_run.run-1');
    expect(useRealtimeStore.getState().events.map((e) => e.seq)).toEqual([6n]);
  });

  it('keeps a terminal mounted before connect streaming once connected', () => {
    const got: WebEvent[] = [];
    const off = useRealtimeStore.getState().subscribeTty('run-2', (e) => got.push(e));
    const socket = openSocket();
    sendEvent(socket, 1, 'agent_run.run-2');
    expect(got).toHaveLength(1);
    expect(useRealtimeStore.getState().events).toEqual([]);
    off();
  });

  it('sends agent control frames keyed by run', () => {
    const socket = openSocket();
    useRealtimeStore.getState().sendAgentControl('run-3', { kind: 'interrupt' });
    expect(socket.frames()).toEqual([
      { type: 'agent_control', run_id: 'run-3', control: { kind: 'interrupt' } },
    ]);
  });
});
