// realtimeStore.errors.test.ts — what the store keeps from a server `error`
// frame. A refused scope says the viewer may not watch one topic; it is not a
// fault in the connection, so it must not park a standing line in the status
// bar under a working page.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRealtimeStore } from '../realtimeStore';

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
}

function openSocket(): FakeWebSocket {
  useRealtimeStore.getState().connect();
  const socket = FakeWebSocket.instances[0];
  socket.emit('open', {});
  return socket;
}

function sendError(socket: FakeWebSocket, code: string, message: string): void {
  socket.emit('message', { data: JSON.stringify({ type: 'error', code, message }) });
}

describe('realtime store error frames', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    useRealtimeStore.getState().flush();
  });

  afterEach(() => {
    useRealtimeStore.getState().disconnect();
    vi.unstubAllGlobals();
  });

  it('keeps nothing from a scope the viewer may not have', () => {
    const socket = openSocket();
    sendError(
      socket,
      'subscription_denied',
      'not authorized for websocket scope global.activity'
    );
    expect(useRealtimeStore.getState().lastError).toBeNull();
  });

  it('keeps a protocol error the reader should know about', () => {
    const socket = openSocket();
    sendError(socket, 'unknown_message', 'unsupported websocket message type');
    expect(useRealtimeStore.getState().lastError).toEqual({
      code: 'unknown_message',
      message: 'unsupported websocket message type',
    });
  });
});
