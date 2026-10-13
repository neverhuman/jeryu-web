// AgentTerminal.test.tsx — component-level wiring test for the live terminal.
//
// Drives the REAL transport path of the SSE + REST architecture: a stubbed
// A scripted `WebSocket` feeds attach frames (`tty` events) into the terminal.
// → the rAF write loop → `term.write`, and operator input flows out via
// POST /api/v1/agent-runs/{id}/control (captured by a `fetch` spy). xterm
// itself is mocked so we can assert the exact bytes handed to `write` and
// invoke the captured `onData` handler. Covers:
//   * merged bytes: two frames in one rAF batch coalesce into one write;
//   * verbatim rendering of scripted text and base64-encoded PTY bytes;
//   * sanitizer: unsupported escape sequences and tcmalloc noise are stripped;
//   * input: keystrokes become `send_input` controls with the typed text;
//   * interrupt: Ctrl-C (button + ETX keystroke) become `interrupt` controls;
//   * exit: an exit_code event surfaces the exit pill and the exit line;
//   * isolation: SSE bytes never touch the realtime rolling event buffer.

import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentTerminal } from '../AgentTerminal';
import { textToBase64 } from '../agentTtyDecode';
import { useRealtimeStore } from '../../../stores/realtimeStore';
import { setCsrfToken } from '../../../api/client';

// ── xterm mocks ────────────────────────────────────────────────────────────
vi.mock('@xterm/xterm', () => {
  class Terminal {
    static last: Terminal | null = null;
    cols = 80;
    rows = 24;
    writes: Uint8Array[] = [];
    clears = 0;
    dataHandler: ((d: string) => void) | null = null;
    constructor() {
      Terminal.last = this;
    }
    loadAddon(): void {}
    open(): void {}
    onData(cb: (d: string) => void): { dispose(): void } {
      this.dataHandler = cb;
      return { dispose: () => {} };
    }
    write(data: Uint8Array): void {
      this.writes.push(data);
    }
    clear(): void {
      this.clears += 1;
    }
    dispose(): void {}
  }
  return { Terminal };
});

vi.mock('@xterm/addon-fit', () => {
  class FitAddon {
    fit(): void {}
  }
  return { FitAddon };
});

import { Terminal } from '@xterm/xterm';

/** Shape of the mocked Terminal we read in assertions. */
interface MockTerminal {
  writes: Uint8Array[];
  clears: number;
  dataHandler: ((d: string) => void) | null;
  cols: number;
  rows: number;
}

/** The `static last` slot exposed by the mock above. */
function lastTerm(): MockTerminal {
  return (Terminal as unknown as { last: MockTerminal }).last;
}

function lastTermOrNull(): MockTerminal | null {
  return (Terminal as unknown as { last: MockTerminal | null }).last;
}

function resetLastTerm(): void {
  (Terminal as unknown as { last: MockTerminal | null }).last = null;
}

// ── scriptable WebSocket double ─────────────────────────────────────────────
class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  binaryType = 'blob';
  onopen: (() => void) | null = null;
  onmessage: ((msg: { data: unknown }) => void) | null = null;
  onclose: ((event?: { code: number }) => void) | null = null;
  sent: Array<string | Uint8Array> = [];
  closed = false;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(frame: string | Uint8Array): void {
    this.sent.push(frame);
  }
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
}

// ── controllable requestAnimationFrame ──────────────────────────────────────
let rafCallbacks: Array<FrameRequestCallback | undefined> = [];
function runRaf(): void {
  const cbs = rafCallbacks;
  rafCallbacks = [];
  act(() => {
    for (const cb of cbs) cb?.(0);
  });
}

const RUN_ID = 'run-1';
const CONTROL_PATH = `/api/v1/agent-runs/${RUN_ID}/control`;

interface SseEventOpts {
  seq: number;
  stream?: 'pty' | 'stdout' | 'stderr' | 'event';
  text?: string | null;
  bytesB64?: string | null;
  exitCode?: number | null;
}

function sseFrame(opts: SseEventOpts): string {
  return JSON.stringify({
    type: 'tty',
    event: {
      seq: opts.seq,
      stream: opts.stream ?? 'stdout',
      text: opts.text ?? null,
      bytes_b64: opts.bytesB64 ?? null,
      exit_code: opts.exitCode ?? null,
    },
  });
}

function emit(source: FakeWebSocket, frame: string | Record<string, unknown>): void {
  const data = typeof frame === 'string' ? frame : JSON.stringify(frame);
  act(() => {
    source.onmessage?.({ data });
  });
}

/** Keystrokes the terminal sent up the socket, as text. */
function sentKeys(source: FakeWebSocket): string[] {
  return source.sent
    // ArrayBuffer.isView, not instanceof: jsdom's TextEncoder returns a typed
    // array from another realm.
    .filter((frame): frame is Uint8Array => ArrayBuffer.isView(frame))
    .map((frame) => new TextDecoder().decode(frame));
}

/** JSON control commands the terminal sent up the socket. */
function socketControls(source: FakeWebSocket, kind: string): Array<Record<string, unknown>> {
  const commands: Array<Record<string, unknown>> = [];
  for (const frame of source.sent) {
    if (typeof frame !== 'string') continue;
    const parsed: unknown = JSON.parse(frame);
    if (!isRecord(parsed) || parsed.type !== 'control') continue;
    const command = parsed.command;
    if (isRecord(command) && command.kind === kind) commands.push(command);
  }
  return commands;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

/** Control POSTs captured by the fetch spy, parsed. */
function sentControls(): Array<Record<string, unknown>> {
  const calls = fetchSpy.mock.calls as Array<[unknown, RequestInit | undefined]>;
  return calls
    .filter(
      ([url, init]) =>
        String(url).includes(CONTROL_PATH) &&
        (init?.method ?? 'GET').toUpperCase() === 'POST'
    )
    .map(([, init]): Record<string, unknown> => JSON.parse(String(init?.body)));
}

function controlsOfKind(kind: string): Array<Record<string, unknown>> {
  return sentControls().filter((c) => c.kind === kind);
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

async function mountAndStream(): Promise<{
  source: FakeWebSocket;
  term: () => MockTerminal;
}> {
  render(<AgentTerminal runId={RUN_ID} />);
  const source = FakeWebSocket.instances[0];
  expect(source.url).toContain(`/api/v1/agent-runs/${RUN_ID}/attach?after_seq=0&control=true`);
  act(() => {
    source.open();
  });
  // Wait for the lazy xterm surface + the dynamic import to finish.
  await screen.findByTestId('agent-terminal-surface');
  await waitFor(() => expect(lastTermOrNull()).not.toBeNull());
  // The mount-time resize control may still be in flight; drain it so the
  // per-test control assertions start from a clean slate.
  fetchSpy.mockClear();
  return { source, term: lastTerm };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  rafCallbacks = [];
  resetLastTerm();
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  );
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCallbacks[id - 1] = undefined;
  });
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    return new Response(JSON.stringify({ accepted: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  useRealtimeStore.setState({ status: 'idle', events: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AgentTerminal live wiring', () => {
  it('merges two TTY frames in one rAF batch into a single write', async () => {
    const { source, term } = await mountAndStream();
    emit(source, sseFrame({ seq: 1, text: 'A' }));
    emit(source, sseFrame({ seq: 2, text: 'B' }));
    runRaf();
    const t = term();
    expect(t.writes).toHaveLength(1);
    expect(decode(t.writes[0])).toBe('AB');
  });

  it('renders the scripted prompt text verbatim', async () => {
    const { source, term } = await mountAndStream();
    emit(source, sseFrame({ seq: 1, text: '$ cargo test\r\n' }));
    runRaf();
    expect(decode(term().writes[0])).toBe('$ cargo test\r\n');
  });

  it('renders base64-encoded PTY bytes verbatim', async () => {
    const { source, term } = await mountAndStream();
    emit(
      source,
      sseFrame({ seq: 1, bytesB64: textToBase64('$ cargo test\r\n') })
    );
    runRaf();
    expect(decode(term().writes[0])).toBe('$ cargo test\r\n');
  });

  it('strips terminal sequences xterm cannot render cleanly', async () => {
    const { source, term } = await mountAndStream();
    emit(
      source,
      sseFrame({
        seq: 1,
        text: '\x1b[>4mkeep\x1b[?2026$p\n123 third_party/tcmalloc/noise\n',
      })
    );
    runRaf();
    expect(decode(term().writes[0])).toBe('keep\n');
  });

  it('sends typed keys up the socket as raw bytes, with no REST call', async () => {
    const { source, term } = await mountAndStream();
    term().dataHandler?.('x\u00e9');
    expect(sentKeys(source)).toEqual(['x\u00e9']);
    expect(sentControls()).toHaveLength(0);
  });

  it('promotes a Ctrl-C keystroke (ETX) to an interrupt control on the socket', async () => {
    const { source, term } = await mountAndStream();
    term().dataHandler?.('\x03');
    expect(socketControls(source, 'interrupt')).toHaveLength(1);
    expect(sentKeys(source)).toHaveLength(0);
  });

  it('sends the initial terminal size as a resize control', async () => {
    const { source } = await mountAndStream();
    const resizes = socketControls(source, 'resize_pty');
    expect(resizes.length).toBeGreaterThanOrEqual(1);
    expect(resizes[0].cols).toBeGreaterThan(0);
  });

  it('sends a CSRF-protected interrupt when the Ctrl-C toolbar button is clicked', async () => {
    setCsrfToken('csrf-test-token');
    await mountAndStream();
    fireEvent.click(screen.getByTestId('agent-terminal-interrupt'));
    await waitFor(() => expect(controlsOfKind('interrupt')).toHaveLength(1));
    const [, init] = fetchSpy.mock.calls.at(-1) as [unknown, RequestInit];
    expect(new Headers(init.headers).get('X-Jeryu-CSRF')).toBe('csrf-test-token');
    setCsrfToken(null);
  });

  it('shows whether this terminal holds the control lease', async () => {
    const { source } = await mountAndStream();
    emit(source, { type: 'attached', controller: true });
    expect(await screen.findByTestId('agent-terminal-control')).toHaveTextContent('In control');
    emit(source, { type: 'control_lost', control_epoch: 1 });
    expect(screen.getByTestId('agent-terminal-control')).toHaveTextContent('Read-only');
  });

  it('reconnects from the last seen sequence and stops after the run ends', async () => {
    // Fake timers only after mounting: the testing library's own waitFor
    // polling runs on real timers.
    const { source } = await mountAndStream();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      emit(source, sseFrame({ seq: 7, text: 'x' }));
      act(() => source.onclose?.());
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      const second = FakeWebSocket.instances[1];
      expect(second.url).toContain('after_seq=7');
      act(() => second.open());
      emit(second, { type: 'ended', state: 'succeeded' });
      act(() => second.onclose?.());
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(FakeWebSocket.instances).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops reconnecting once the server keeps refusing the upgrade', async () => {
    const { source } = await mountAndStream();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // A live socket drops: that is a reconnect, not a refusal.
      act(() => source.onclose?.({ code: 1006 }));
      // Three upgrades in a row that never open: the third stops the loop.
      for (const index of [1, 2, 3]) {
        act(() => {
          vi.advanceTimersByTime(30_000);
        });
        act(() => FakeWebSocket.instances[index].onclose?.({ code: 1006 }));
      }
      act(() => {
        vi.advanceTimersByTime(120_000);
      });
      expect(FakeWebSocket.instances).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
    expect(screen.getByTestId('agent-terminal-status')).toHaveTextContent('No access');
    expect(screen.getByTestId('agent-terminal-refused')).toBeInTheDocument();
  });

  it('stops at once on a denying close code', async () => {
    const { source } = await mountAndStream();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      act(() => source.onclose?.({ code: 4403 }));
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(FakeWebSocket.instances).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
    expect(screen.getByTestId('agent-terminal-refused')).toBeInTheDocument();
  });

  it('stops for good when the server revokes the sign-in', async () => {
    const { source } = await mountAndStream();
    emit(source, { type: 'attached', controller: true });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      emit(source, { type: 'auth_revoked' });
      act(() => source.onclose?.({ code: 1000 }));
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(FakeWebSocket.instances).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
    expect(screen.getByTestId('agent-terminal-signed-out')).toBeInTheDocument();
    expect(screen.getByTestId('agent-terminal-status')).toHaveTextContent('Signed out');
    expect(screen.queryByTestId('agent-terminal-control')).not.toBeInTheDocument();
  });

  it('shows a refused Ctrl-C instead of swallowing it', async () => {
    await mountAndStream();
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'forbidden', message: 'admin role required' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );
    fireEvent.click(screen.getByTestId('agent-terminal-interrupt'));
    expect(await screen.findByTestId('agent-terminal-control-error')).toHaveTextContent(
      'admin role required',
    );
  });

  it('surfaces the exit pill and writes the exit line on an exit_code event', async () => {
    const { source, term } = await mountAndStream();
    emit(source, sseFrame({ seq: 1, stream: 'event', exitCode: 0 }));
    const pill = await screen.findByTestId('agent-terminal-exit');
    expect(pill).toHaveTextContent('exit 0');
    runRaf();
    expect(decode(term().writes[0])).toContain('process exited with code 0');
  });

  it('writes PTY frames: a host PTY run streams as pty, not stdout', async () => {
    const { source, term } = await mountAndStream();
    emit(source, sseFrame({ seq: 1, stream: 'pty', text: 'pty bytes' }));
    emit(source, sseFrame({ seq: 2, stream: 'pty', bytesB64: btoa('raw pty') }));
    runRaf();
    expect(term().writes.map(decode).join('')).toBe('pty bytesraw pty');
  });

  it('streams agent bytes WITHOUT touching the rolling event buffer', async () => {
    const { source, term } = await mountAndStream();
    emit(source, sseFrame({ seq: 1, text: 'quiet bytes' }));
    runRaf();
    expect(decode(term().writes[0])).toBe('quiet bytes');
    expect(useRealtimeStore.getState().events).toHaveLength(0);
  });
});
