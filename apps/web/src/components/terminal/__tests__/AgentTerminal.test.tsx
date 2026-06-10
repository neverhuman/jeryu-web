// AgentTerminal.test.tsx — component-level wiring test for the live terminal.
//
// Drives the real SSE/REST transport boundary with test doubles: a stubbed
// EventSource emits TTY events into the component and a stubbed fetch captures
// control requests. xterm itself is mocked so we can assert the exact bytes
// handed to `write` and invoke the captured `onData` handler.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentTerminal } from '../AgentTerminal';
import type { AgentStreamEvent } from '../agentTtyTransport';

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

// ── scriptable EventSource double ───────────────────────────────────────────
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  open(): void {
    this.onopen?.(new Event('open'));
  }

  message(event: AgentStreamEvent): void {
    this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
  }

  close(): void {
    this.closed = true;
  }
}

// ── controllable requestAnimationFrame ──────────────────────────────────────
let rafCallbacks: Array<FrameRequestCallback | undefined> = [];
function runRaf(): void {
  const cbs = rafCallbacks;
  rafCallbacks = [];
  for (const cb of cbs) cb?.(0);
}

const RUN_ID = 'run-1';

function streamEvent(opts: {
  seq: number;
  text: string;
  stream?: AgentStreamEvent['stream'];
  exit_code?: number | null;
}): AgentStreamEvent {
  return {
    seq: opts.seq,
    stream: opts.stream ?? 'stdout',
    text: opts.text,
    bytes_b64: null,
    exit_code: opts.exit_code ?? null,
  };
}

let fetchCalls: Array<{ url: string; body: Record<string, unknown> | null }> = [];

function sentControls(): Array<Record<string, unknown>> {
  return fetchCalls
    .filter((call) => call.url === `/api/v1/agent-runs/${RUN_ID}/control`)
    .map((call) => call.body)
    .filter((body): body is Record<string, unknown> => body !== null);
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

async function mountAndStream(): Promise<{
  source: FakeEventSource;
  term: () => MockTerminal;
}> {
  render(<AgentTerminal runId={RUN_ID} />);
  await waitFor(() => expect(FakeEventSource.instances[0]).toBeDefined());
  const source = FakeEventSource.instances[0];
  source.open();
  // Wait for the lazy xterm surface to finish importing and opening.
  await screen.findByTestId('agent-terminal-surface');
  await waitFor(() => expect(lastTermOrNull()).not.toBeNull());
  fetchCalls = [];
  return { source, term: lastTerm };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  fetchCalls = [];
  rafCallbacks = [];
  resetLastTerm();
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(JSON.stringify({ accepted: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }));
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AgentTerminal live wiring', () => {
  it('merges two TTY frames in one rAF batch into a single write', async () => {
    const { source, term } = await mountAndStream();
    source.message(streamEvent({ seq: 1, text: 'A' }));
    source.message(streamEvent({ seq: 2, text: 'B' }));
    runRaf();
    const t = term();
    expect(t.writes).toHaveLength(1);
    expect(decode(t.writes[0])).toBe('AB');
  });

  it('renders the scripted prompt bytes verbatim', async () => {
    const { source, term } = await mountAndStream();
    source.message(streamEvent({ seq: 1, text: '$ cargo test\r\n' }));
    runRaf();
    expect(decode(term().writes[0])).toBe('$ cargo test\r\n');
  });

  it('strips terminal sequences xterm cannot render cleanly', async () => {
    const { source, term } = await mountAndStream();
    source.message(streamEvent({
      seq: 1,
      text: '\x1b[>4mkeep\x1b[?2026$p\n123 third_party/tcmalloc/noise\n',
    }));
    runRaf();
    expect(decode(term().writes[0])).toBe('keep\n');
  });

  it('sends an input control when the operator types', async () => {
    await mountAndStream();
    lastTerm().dataHandler?.('x');
    await waitFor(() => expect(sentControls()).toHaveLength(1));
    expect(sentControls()[0]).toEqual({ kind: 'send_input', text: 'x' });
  });

  it('promotes a Ctrl-C keystroke (ETX) to an interrupt control', async () => {
    await mountAndStream();
    lastTerm().dataHandler?.('\x03');
    await waitFor(() => expect(sentControls()).toHaveLength(1));
    expect(sentControls()[0]).toEqual({ kind: 'interrupt' });
  });

  it('sends an interrupt when the Ctrl-C toolbar button is clicked', async () => {
    await mountAndStream();
    fireEvent.click(screen.getByTestId('agent-terminal-interrupt'));
    await waitFor(() => expect(sentControls()).toHaveLength(1));
    expect(sentControls()[0]).toEqual({ kind: 'interrupt' });
  });

  it('renders exit codes from the SSE stream', async () => {
    const { source, term } = await mountAndStream();
    source.message(streamEvent({ seq: 1, text: '', stream: 'event', exit_code: 0 }));
    runRaf();
    expect(decode(term().writes[0])).toContain('process exited with code 0');
    expect(await screen.findByTestId('agent-terminal-exit')).toHaveTextContent('exit 0');
  });
});
