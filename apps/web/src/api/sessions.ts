// sessions.ts — client call for creating an isolated agent session.
//
// `POST /api/v1/repos/{id}/sessions` provisions a fresh, isolated agent run on
// a repository and returns the run id + realtime coordinates the SPA needs to
// deep-link to and mount the live `<AgentTerminal>`. A per-attempt
// `Idempotency-Key` (§35.1.3) is attached so a retried click collapses to a
// single server-side session rather than spawning duplicates.

import { apiSend, type ApiRequestOptions } from './client';
import { endpoints } from './endpoints';
import type { CreateSessionResponse } from './agentTerminal';
import type { StartSessionRequest } from './types/sessions';

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `repo-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** The most a start task may hold: the server's limit, in UTF-8 bytes once trimmed. */
export const SESSION_TASK_MAX_BYTES = 8000;

/**
 * A start task's size as the server measures it: the UTF-8 bytes of the task
 * once trimmed, which is what `createSession` sends. Bytes, not characters: an
 * `é` is two, a `€` three, an emoji four.
 */
export function sessionTaskBytes(task: string): number {
  return new TextEncoder().encode(task.trim()).length;
}

/**
 * Start a Firecracker session on `repoId` for `request.provider`, with the
 * model recorded on it when one is named, and the task the agent starts on
 * when one is given. Both are trimmed, and left out when nothing is left: with
 * no task the provider's CLI starts interactive. Every provider this client
 * starts runs an agent (`AgentProvider` has no `shell`), so any of them may
 * take a task. Resolves with the created run's coordinates; rejects with an
 * `ApiError` on a non-2xx response.
 */
export function createSession(
  repoId: string,
  request: StartSessionRequest,
  opts?: ApiRequestOptions
): Promise<CreateSessionResponse> {
  const model = request.model?.trim();
  const task = request.task?.trim();
  const body: StartSessionRequest = { provider: request.provider };
  if (model) body.model = model;
  if (task) body.task = task;
  return apiSend<CreateSessionResponse>(endpoints.repoSessions(repoId), body, {
    idempotencyKey: newIdempotencyKey(),
    ...opts,
  });
}
