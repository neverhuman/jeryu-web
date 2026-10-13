// AgentTerminal.tsx — public live agent terminal over the attach WebSocket.
//
// Renders a compact toolbar (connection status, control lease, byte budget,
// Ctrl-C) and the xterm surface. Output and input share one socket; only the
// client holding the control lease can type.
// AgentTerminalImpl is imported directly (xterm itself is still dynamically
// imported at runtime inside the impl).

import { useState, useCallback } from 'react';
import { CircleStop, TerminalSquare } from 'lucide-react';

import type { AttachStatus } from './agentAttachTransport';
import { sendInterrupt } from './agentControlTransport';
import { AgentTerminalImpl } from './AgentTerminalImpl';

import { toneClass, type Tone } from '../tone/tone';

import './terminal.css';

export interface AgentTerminalProps {
  runId: string;
  label?: string;
}

const STATUS_LABEL: Partial<Record<AttachStatus, string>> = {
  open: 'Live',
  refused: 'No access',
  signed_out: 'Signed out',
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

export function AgentTerminal({ runId, label }: AgentTerminalProps): JSX.Element {
  const [bytes, setBytes] = useState(0);
  const [sseStatus, setSseStatus] = useState<AttachStatus>('connecting');
  const [controlError, setControlError] = useState<string | null>(null);
  const [interrupting, setInterrupting] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [controller, setController] = useState(false);

  const onSseStatus = useCallback((s: AttachStatus) => setSseStatus(s), []);
  const interrupt = useCallback(() => {
    setInterrupting(true);
    setControlError(null);
    sendInterrupt(runId)
      .catch((error: unknown) =>
        setControlError(error instanceof Error ? error.message : 'the interrupt was not delivered'),
      )
      .finally(() => setInterrupting(false));
  }, [runId]);
  const onExit = useCallback((code: number) => setExitCode(code), []);
  const onControl = useCallback((held: boolean) => setController(held), []);

  const live = sseStatus === 'open';
  const statusVariant: Tone = live
    ? 'ok'
    : sseStatus === 'connecting'
      ? 'warn'
      : 'failed';

  return (
    <section
      className="agent-terminal"
      data-testid="agent-terminal"
      data-run-id={runId}
      aria-label={`Agent terminal for run ${runId}`}
    >
      <div className="agent-terminal__toolbar" data-testid="agent-terminal-toolbar">
        <span className="agent-terminal__title">
          <TerminalSquare size={14} aria-hidden="true" />
          {label ?? `run ${runId}`}
        </span>
        {exitCode !== null && (
          <span
            className={toneClass('agent-terminal__pill', exitCode === 0 ? 'ok' : 'failed')}
            data-testid="agent-terminal-exit"
          >
            exit {exitCode}
          </span>
        )}
        <span
          className={toneClass('agent-terminal__pill', statusVariant)}
          data-testid="agent-terminal-status"
        >
          <span
            className={`agent-terminal__dot${live ? ' is-live' : ''}`}
            aria-hidden="true"
          />
          {STATUS_LABEL[sseStatus] ?? sseStatus}
        </span>
        {live && (
          <span
            className={toneClass('agent-terminal__pill', controller ? 'ok' : 'warn')}
            data-testid="agent-terminal-control"
            title={
              controller
                ? 'You hold the control lease: your keystrokes reach the agent'
                : 'Watching: another client holds control, or this run does not accept your input'
            }
          >
            {controller ? 'In control' : 'Read-only'}
          </span>
        )}
        <span
          className="agent-terminal__budget"
          data-testid="agent-terminal-budget"
          title="Bytes streamed this session"
        >
          {formatBytes(bytes)}
        </span>
        <button
          type="button"
          className="agent-terminal__interrupt"
          data-testid="agent-terminal-interrupt"
          onClick={interrupt}
          disabled={interrupting}
          title="Send interrupt (Ctrl-C)"
        >
          <CircleStop size={14} aria-hidden="true" /> Ctrl-C
        </button>
      </div>
      {controlError !== null && (
        <p className="agent-terminal__error" role="alert" data-testid="agent-terminal-control-error">
          Ctrl-C was not delivered: {controlError}
        </p>
      )}
      {sseStatus === 'signed_out' && (
        <p className="agent-terminal__error" role="alert" data-testid="agent-terminal-signed-out">
          Your sign-in ended (you logged out, your password changed, or a token was revoked), so this
          terminal was disconnected. Sign in again to reattach.
        </p>
      )}
      {sseStatus === 'refused' && (
        <p className="agent-terminal__error" role="alert" data-testid="agent-terminal-refused">
          This terminal cannot be attached: you may not have access to this run, or it is gone.
          Reload the page to try again.
        </p>
      )}
      <AgentTerminalImpl
        runId={runId}
        onBytes={setBytes}
        onSseStatus={onSseStatus}
        onExit={onExit}
        onControl={onControl}
      />
    </section>
  );
}

export default AgentTerminal;
