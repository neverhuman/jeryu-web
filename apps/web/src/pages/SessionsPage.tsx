// SessionsPage.tsx — your agent sessions, across every repository.
//
// Each session is one Firecracker VM with two terminals in it: the agent and
// a shell. This page lists the caller's sessions (`GET /api/v1/me/sessions`,
// newest first): where each one runs, which provider and model, who started
// it (the account itself or one of its Grokbots or Musebots), and the todo it
// works for. It says whether the session runner can take another one
// (`GET /api/v1/runner/status`) and when its node's certificate runs out, and
// a running session can be stopped here.
// Opening one goes to its own page (`/sessions/<id>`); its terminals live on
// its repository's Agents tab.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  RunnerStatus,
  SessionList,
  SessionStateFilter,
  SessionSummary
} from '../api/types/sessions';
import { ActionButton } from '../components/action/ActionButton';
import { PageHeader, queryFreshness } from '../components/pageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/state';
import { sendTerminate } from '../components/terminal/agentControlTransport';
import { absoluteText, instantOf, relativeText } from '../format/when';
import { useForgeHost } from '../hooks/useForgeHost';
import { repoRefOf, repoUrl } from './repoBrowserModel';
import { todoHref } from './shift/workPaths';

import './page.css';
import './SessionsPage.css';

export const SESSIONS_PATH = '/sessions';

/** One session's own page. */
export function sessionPath(sessionId: string): string {
  return `${SESSIONS_PATH}/${encodeURIComponent(sessionId)}`;
}

/** Every session query starts here, so a stop refreshes the list and a session's page. */
export const SESSIONS_KEY: readonly string[] = ['me', 'sessions'];

const FILTERS: { value: SessionStateFilter; label: string }[] = [
  { value: 'running', label: 'Running' },
  { value: 'finished', label: 'Finished' },
  { value: 'all', label: 'All' }
];

/** A session that still has a terminal running: it can be stopped. */
export function isLiveSession(session: SessionSummary): boolean {
  return (
    session.dispatch_state !== 'stopped' &&
    session.dispatch_state !== 'failed' &&
    (session.agent_state === 'running' || session.shell_state === 'running')
  );
}

/**
 * The run a stop goes through: the agent while it runs, else the shell, which
 * keeps the VM. Either one stops the whole session.
 */
export function stopChannel(session: SessionSummary): string {
  return session.agent_state === 'running'
    ? session.run_id
    : session.shell_run_id;
}

export function SessionsPage(): JSX.Element {
  const [state, setState] = useState<SessionStateFilter>('running');
  const sessions = useQuery({
    queryKey: [...SESSIONS_KEY, state],
    queryFn: ({ signal }) =>
      apiGet<SessionList>(endpoints.mySessions({ state }), { signal }),
    refetchInterval: 10_000
  });
  const runner = useQuery({
    queryKey: ['runner', 'status'],
    queryFn: ({ signal }) =>
      apiGet<RunnerStatus>(endpoints.runnerStatus(), { signal }),
    refetchInterval: 30_000
  });
  const forgeHost = useForgeHost();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null);
  const stop = useMutation({
    mutationFn: (session: SessionSummary) =>
      sendTerminate(stopChannel(session)),
    onSettled: () => {
      setConfirming(null);
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    }
  });
  const rows = sessions.data?.sessions ?? [];

  return (
    <div className="page sessions" data-testid="sessions-page">
      <PageHeader
        title="Sessions"
        testId="sessions-header"
        freshness={queryFreshness(sessions)}
        subtitle="Your agent sessions across repositories, newest first. Each one runs in its own Firecracker VM, started from its repository's default branch."
      >
        <label className="sessions__filter">
          <span className="sr-only">Show</span>
          <select
            value={state}
            onChange={(event) =>
              setState(event.target.value as SessionStateFilter)
            }
            data-testid="sessions-filter"
            aria-label="Which sessions to show"
          >
            {FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
      </PageHeader>

      <RunnerLine runner={runner} />

      {stop.isError ? (
        <ErrorState
          title="Could not stop the session."
          error={stop.error}
          testId="sessions-stop-error"
        />
      ) : null}

      {sessions.isPending ? (
        <LoadingState variant="message" title="Loading your sessions." />
      ) : sessions.isError ? (
        <ErrorState
          title="Could not load your sessions."
          error={sessions.error}
          onRetry={() => void sessions.refetch()}
          testId="sessions-error"
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            state === 'running' ? 'No session is running.' : 'No sessions yet.'
          }
          description="Start one from a repository's Agents tab with New Session."
          testId="sessions-empty"
        />
      ) : (
        <div className="page__card">
          <div className="table-scroll">
            <table
              className="admin-users__table sessions__table"
              data-testid="sessions-table"
            >
              <thead>
                <tr>
                  <th scope="col">Session</th>
                  <th scope="col">Repository</th>
                  <th scope="col">Provider</th>
                  <th scope="col">State</th>
                  <th scope="col">Started by</th>
                  <th scope="col">For</th>
                  <th scope="col">Started</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((session) => {
                  const ref = repoRefOf(forgeHost(session.repo), session.repo);
                  return (
                    <tr key={session.session_id} data-testid="sessions-row">
                      <th scope="row">
                        <Link
                          className="sessions__mono"
                          to={sessionPath(session.session_id)}
                          title="Open the session"
                        >
                          {session.session_id}
                        </Link>
                      </th>
                      <td>
                        <Link to={repoUrl(ref)}>{session.repo}</Link>
                        {session.labels.branch ? (
                          <span className="sessions__detail sessions__mono">
                            {' '}
                            {session.labels.branch}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {session.provider}
                        {session.labels.model ? (
                          <span className="sessions__detail">
                            {' '}
                            {session.labels.model}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span className="page__pill">
                          {session.dispatch_state}
                        </span>
                        <span className="sessions__detail">
                          {' '}
                          agent {session.agent_state ?? 'unknown'}, shell{' '}
                          {session.shell_state ?? 'unknown'}
                        </span>
                      </td>
                      <td>
                        <code>{session.started_by}</code>
                      </td>
                      <td>
                        {session.labels.todo_id ? (
                          <Link to={todoHref(session.labels.todo_id)}>
                            todo {session.labels.todo_id}
                          </Link>
                        ) : (
                          '—'
                        )}
                        {session.labels.slot ? (
                          <span className="sessions__detail">
                            {' '}
                            {session.labels.slot}
                          </span>
                        ) : null}
                      </td>
                      <td title={absoluteText(session.created_at_ms)}>
                        {relativeText(session.created_at_ms)}
                      </td>
                      <td className="admin-users__actions">
                        {!isLiveSession(session) ? null : confirming ===
                          session.session_id ? (
                          <>
                            <ActionButton
                              actionId="sessions.stop"
                              variant="human"
                              disabled={stop.isPending}
                              onClick={() => stop.mutate(session)}
                            >
                              Confirm stop
                            </ActionButton>
                            <ActionButton
                              variant="default"
                              onClick={() => setConfirming(null)}
                            >
                              Keep
                            </ActionButton>
                          </>
                        ) : (
                          <ActionButton
                            variant="default"
                            aria-label={`Stop ${session.session_id}`}
                            onClick={() => setConfirming(session.session_id)}
                          >
                            Stop
                          </ActionButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {confirming ? (
            <p className="page__roadmap-note" role="status">
              Stopping ends the VM: the agent and the shell in it stop together.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Under this, the node certificate's end is called out: renewal is due. */
export const CERTIFICATE_DUE_MS = 6 * 60 * 60 * 1000;

/**
 * What the session node's certificate expiry means for new sessions, or null
 * while the server has not reached the node. `due`: within
 * `CERTIFICATE_DUE_MS`, or already past.
 */
export function certificateNote(
  expiresAt: string | null | undefined,
  now: number = Date.now()
): { text: string; due: boolean } | null {
  const at = instantOf(expiresAt);
  if (at === null) return null;
  if (at <= now) {
    return {
      text: 'Its node certificate has expired, so every new session is refused until it is renewed.',
      due: true
    };
  }
  if (at - now < CERTIFICATE_DUE_MS) {
    return {
      text: `Its node certificate expires ${relativeText(at, now)} (${absoluteText(at)}), and a session that would outlive it is refused: it needs renewing.`,
      due: true
    };
  }
  return {
    text: `Its node certificate is valid until ${absoluteText(at)}.`,
    due: false
  };
}

/** One line on whether the session runner can take a session now. */
function RunnerLine({
  runner
}: {
  runner: { isPending: boolean; isError: boolean; data?: RunnerStatus };
}): JSX.Element {
  if (runner.isPending) {
    return (
      <p className="page__roadmap-note" data-testid="sessions-runner">
        Checking the session runner.
      </p>
    );
  }
  if (runner.isError || !runner.data) {
    return (
      <p className="page__roadmap-note" data-testid="sessions-runner">
        The session runner did not answer.
      </p>
    );
  }
  const status = runner.data;
  if (!status.ready) {
    return (
      <p
        className="sessions__runner sessions__runner--down"
        data-testid="sessions-runner"
      >
        The session runner cannot take a session now
        {status.reason ? ` (${status.reason})` : ''}. {status.repair_hint ?? ''}
      </p>
    );
  }
  const providers = Object.keys(status.profiles ?? {})
    .sort()
    .join(', ');
  const certificate = certificateNote(status.node_certificate_expires_at);
  return (
    <p
      className={
        certificate?.due
          ? 'sessions__runner sessions__runner--due'
          : 'sessions__runner'
      }
      data-testid="sessions-runner"
    >
      The session runner is ready on {status.runner_id ?? status.runtime}
      {providers ? `, for ${providers}` : ''}. You have{' '}
      {status.open_sessions.mine} open{' '}
      {status.open_sessions.mine === 1 ? 'session' : 'sessions'}.
      {certificate ? ` ${certificate.text}` : ''}
    </p>
  );
}
