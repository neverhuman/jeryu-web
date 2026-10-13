// sessions.ts — Firecracker sessions as the server describes them: the
// caller's sessions (`GET /api/v1/me/sessions`), one session in full
// (`GET /api/v1/me/sessions/{id}`), whether the session runner can take one
// (`GET /api/v1/runner/status`), and the body that starts one.

import type { AgentProvider } from './providerConnections';

/** One session as a list row. */
export interface SessionSummary {
  /** `vm-…`: the session itself. */
  session_id: string;
  /** The agent channel's run. */
  run_id: string;
  /** The shell beside the agent, in the same VM. */
  shell_run_id: string;
  /** `owner/name`. */
  repo: string;
  provider: string;
  profile_id: string;
  owner: string;
  /** `user/<login>`, or `bot/<slug>` for a Grokbot or Musebot of the owner. */
  started_by: string;
  /** Recorded at start: `model`, `todo_id`, `slot`. */
  labels: Record<string, string>;
  runner_id: string;
  generation: number;
  /** The node-side dispatch: `admitted`, `dispatching`, `running`, `stopped`, `failed`, … */
  dispatch_state: string;
  state_reason: string | null;
  agent_state: string | null;
  shell_state: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  lease_expires_at_ms: number | null;
  /** The commit the session started from. */
  source_revision: string | null;
  /** The default branch's tip when the session started. */
  main_revision: string | null;
}

export interface SessionList {
  count: number;
  sessions: SessionSummary[];
}

/** One control a channel received, as the session's history keeps it. */
export interface SessionControl {
  seq: number;
  /** `send_input`, `send_bytes`, `interrupt`, `resize`, `terminate`, … */
  command: string;
  /**
   * Who sent it: `api:<login>` (the owner), `bot/<slug>` (one of the owner's
   * Grokbots or Musebots), or `attach:…` (an attached terminal).
   */
  actor: string | null;
  /** What the guest did with it, once it answered. */
  outcome: string | null;
}

/** One of a session's two terminals, the agent or the shell beside it. */
export interface SessionChannel {
  run_id: string;
  state: string | null;
  error_code: string | null;
  exit_code: number | null;
  /** Newest first, at most ten. */
  recent_controls: SessionControl[];
}

/** One session in full: `GET /api/v1/me/sessions/{id}`. */
export interface SessionStatus extends SessionSummary {
  channels: { agent: SessionChannel; shell: SessionChannel };
}

/** Which sessions a list shows. */
export type SessionStateFilter = 'running' | 'finished' | 'all';

/** Whether the session runner can take a session now. */
export interface RunnerStatus {
  ready: boolean;
  runtime: string;
  runner_id?: string;
  /** Provider → the profile the node admits for it. */
  profiles?: Record<string, string>;
  reason?: string;
  repair_hint?: string;
  /**
   * When the session node's certificate (the leaf the server last verified)
   * runs out; null until the server has reached the node. A start whose lease
   * would outlive it is refused (`runner_certificate_expiring`).
   */
  node_certificate_expires_at?: string | null;
  /** `all` only for an administrator. */
  open_sessions: { mine: number; all: number | null };
}

/** `POST /api/v1/repos/{id}/sessions`. */
export interface StartSessionRequest {
  provider: AgentProvider;
  /** Recorded on the session; the provider's default when left out. */
  model?: string;
  /**
   * What the agent starts on. The server types it into the agent's terminal
   * once, and the provider's CLI starts headless on it; left out, the CLI
   * starts interactive. Text, non-empty once trimmed, at most 8000 bytes of
   * UTF-8 (`SESSION_TASK_MAX_BYTES`).
   */
  task?: string;
}
