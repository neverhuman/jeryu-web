// agentAttachTransport.ts — one WebSocket for an agent run's live terminal.
//
// GET /api/v1/agent-runs/{id}/attach?after_seq=N&control=BOOL upgrades to a
// WebSocket. The server replays retained output past the cursor, then streams
// live `tty` frames (the same AgentStreamEvent shape the SSE stream used).
// Keystrokes go up as binary frames; resize and interrupt as JSON control
// frames. One client at a time holds the control lease; others watch. The
// browser sends the session cookie and Origin itself, and the server refuses a
// cross-origin upgrade.

import type { AgentStreamEvent } from './agentTtyTransport';

/** `refused`: the server would not attach this client (no access, the run is
 * gone, or a policy close). No reconnect follows. */
/** `signed_out`: the server ended the socket because the credential it was
 * opened with stopped working (logout, password change, revoked token). */
export type AttachStatus = 'connecting' | 'open' | 'closed' | 'error' | 'refused' | 'signed_out';

/** A socket that never opens this many times in a row is treated as refused. */
export const MAX_FAILED_UPGRADES = 3;
const MAX_RECONNECT_DELAY_MS = 30_000;

/** Close codes the server uses to deny, not drop: policy (1008) and 4xxx. */
function deniedClose(code: number | undefined): boolean {
  return code === 1008 || (code !== undefined && code >= 4000 && code <= 4999);
}

export interface AttachHandlers {
  onEvent: (event: AgentStreamEvent) => void;
  onStatus?: (status: AttachStatus) => void;
  /** True while this socket holds the control lease. */
  onControl?: (controller: boolean) => void;
  /** Output was skipped because the client fell behind the retained ring. */
  onGap?: () => void;
  /** The run finished and its output drained; no reconnect follows. */
  onEnded?: (state: string | null) => void;
}

export interface AttachConnection {
  sendKeys(data: string): void;
  resize(cols: number, rows: number): void;
  interrupt(): void;
  takeControl(): void;
  close(): void;
}

export interface AttachOptions {
  control?: boolean;
  afterSeq?: number;
  /** Injected for tests; defaults to the browser WebSocket. */
  socketFactory?: (url: string) => WebSocket;
  reconnectDelayMs?: number;
}

/** A server frame is a JSON object; anything else is skipped. */
function parseFrame(text: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return isRecord(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const optional = (value: unknown, type: 'string' | 'number'): boolean =>
  value === undefined || value === null || typeof value === type;

/** A `tty` frame's event, checked field by field before it is rendered. The
 * server's stream name is passed through (a PTY run says `pty`). */
function isStreamEvent(value: unknown): value is AgentStreamEvent {
  return (
    isRecord(value) &&
    typeof value.seq === 'number' &&
    typeof value.stream === 'string' &&
    optional(value.text, 'string') &&
    optional(value.bytes_b64, 'string') &&
    optional(value.exit_code, 'number')
  );
}

export function attachUrl(runId: string, afterSeq: number, control: boolean, loc: Location = window.location): string {
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${loc.host}/api/v1/agent-runs/${encodeURIComponent(runId)}/attach?after_seq=${afterSeq}&control=${control}`;
}

export function connectAttach(runId: string, handlers: AttachHandlers, options: AttachOptions = {}): AttachConnection {
  const factory = options.socketFactory ?? ((url: string) => new WebSocket(url));
  const reconnectDelay = options.reconnectDelayMs ?? 1500;
  const encoder = new TextEncoder();
  let wantControl = options.control ?? true;
  let lastSeq = options.afterSeq ?? 0;
  let socket: WebSocket | null = null;
  let closed = false;
  let ended = false;
  // The server revoked this socket's sign-in; reattaching cannot succeed.
  let revoked = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Upgrades that closed before opening, since the last open.
  let failedUpgrades = 0;

  function send(frame: string | Uint8Array): void {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(frame);
    }
  }

  function control(command: Record<string, unknown>): void {
    send(JSON.stringify({ type: 'control', command }));
  }

  function handle(frame: Record<string, unknown>): void {
    switch (frame.type) {
      case 'attached':
      case 'control':
        handlers.onControl?.(frame.controller === true);
        break;
      case 'control_lost':
        handlers.onControl?.(false);
        break;
      case 'tty': {
        const event = frame.event;
        if (isStreamEvent(event) && event.seq > lastSeq) {
          lastSeq = event.seq;
          handlers.onEvent(event);
        }
        break;
      }
      case 'resync':
        handlers.onGap?.();
        break;
      case 'ended':
        ended = true;
        handlers.onEnded?.(typeof frame.state === 'string' ? frame.state : null);
        break;
      case 'auth_revoked':
        revoked = true;
        handlers.onControl?.(false);
        handlers.onStatus?.('signed_out');
        break;
      default:
        // `ack` and `error` frames need no rendering here.
        break;
    }
  }

  function open(): void {
    if (closed || ended || revoked) return;
    handlers.onStatus?.('connecting');
    const ws = factory(attachUrl(runId, lastSeq, wantControl));
    ws.binaryType = 'arraybuffer';
    socket = ws;
    let opened = false;
    ws.onopen = () => {
      opened = true;
      failedUpgrades = 0;
      handlers.onStatus?.('open');
    };
    ws.onmessage = (message: MessageEvent) => {
      if (typeof message.data !== 'string') return;
      const frame = parseFrame(message.data);
      if (frame) handle(frame);
    };
    ws.onclose = (event?: CloseEvent) => {
      socket = null;
      if (revoked) return;
      if (closed || ended) {
        handlers.onStatus?.('closed');
        return;
      }
      handlers.onControl?.(false);
      if (!opened) failedUpgrades += 1;
      // The browser hides the upgrade's HTTP status, so a refusal looks like a
      // socket that never opens. Stop after a few of those, or at once on a
      // denying close code, instead of retrying forever.
      if (deniedClose(event?.code) || failedUpgrades >= MAX_FAILED_UPGRADES) {
        handlers.onStatus?.('refused');
        return;
      }
      handlers.onStatus?.('error');
      const delay = Math.min(reconnectDelay * 2 ** failedUpgrades, MAX_RECONNECT_DELAY_MS);
      timer = setTimeout(open, delay);
    };
  }

  open();

  return {
    sendKeys(data: string) {
      if (data.length > 0) send(encoder.encode(data));
    },
    resize(cols: number, rows: number) {
      if (cols > 0 && rows > 0) control({ kind: 'resize_pty', cols, rows });
    },
    interrupt() {
      control({ kind: 'interrupt' });
    },
    takeControl() {
      wantControl = true;
      send(JSON.stringify({ type: 'take_control' }));
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
      socket = null;
      handlers.onStatus?.('closed');
    },
  };
}
