// agentControlTransport.ts — REST-based control channel for agent runs.
//
// Sends operator commands (input, interrupt, resize) to the backend via
// POST /api/v1/agent-runs/{id}/control. The backend acks with
// { accepted: true }; a refusal or a network failure rejects the promise with
// the ApiError, so the caller can show it.

import { apiSend } from '../../api/client';

const CONTROL_URL = (runId: string) =>
  `/api/v1/agent-runs/${encodeURIComponent(runId)}/control`;

interface ControlResponse {
  accepted?: boolean;
  agent_run_id?: string;
  command?: string;
  control_seq?: number;
}

function sendControl(
  runId: string,
  body: Record<string, unknown>,
): Promise<ControlResponse> {
  // apiSend adds the X-Jeryu-CSRF header a cookie session needs.
  return apiSend<ControlResponse>(CONTROL_URL(runId), body);
}

/** Send raw text input to the agent's PTY stdin. */
export function sendInput(runId: string, text: string): Promise<ControlResponse> {
  return sendControl(runId, { kind: 'send_input', text });
}

/** Send SIGINT to the agent process. */
export function sendInterrupt(runId: string): Promise<ControlResponse> {
  return sendControl(runId, { kind: 'interrupt' });
}

/** Notify the agent that the terminal viewport has resized. */
export function sendResize(
  runId: string,
  cols: number,
  rows: number,
): Promise<ControlResponse> {
  return sendControl(runId, { kind: 'resize_pty', cols, rows });
}

/** Terminate the agent process. */
export function sendTerminate(runId: string): Promise<ControlResponse> {
  return sendControl(runId, { kind: 'terminate' });
}
