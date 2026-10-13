// SessionPage.tsx — one agent session: where its VM runs, what it started
// from, and both of its terminals with who sent each control.
//
// `GET /api/v1/me/sessions/{id}` answers any of the session's ids for its
// owner. It carries the VM (node, generation, dispatch state, lease end), the
// commit the session started from and main then, and each channel's state,
// exit code and recent controls. A control names its sender: the owner as
// `api:<login>`, one of the owner's Grokbots or Musebots as `bot/<slug>`, an
// attached terminal as `attach:…`. Below that, what the owner's bots did in
// this session. Its terminals live on the repository's Agents tab.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  SessionChannel,
  SessionControl,
  SessionStatus
} from '../api/types/sessions';
import { ActionButton } from '../components/action/ActionButton';
import { PageHeader, queryFreshness } from '../components/pageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/state';
import { sendTerminate } from '../components/terminal/agentControlTransport';
import { absoluteText, relativeText } from '../format/when';
import { useForgeHost } from '../hooks/useForgeHost';
import { BotActivityList } from './bots/BotActivityList';
import { repoRefOf, repoUrl, type RepoRef } from './repoBrowserModel';
import { SESSIONS_KEY, isLiveSession, stopChannel } from './SessionsPage';
import { todoHref } from './shift/workPaths';

import './page.css';
import './SessionsPage.css';

/** How a control's sender reads. */
export function controlSender(actor: string | null): string {
  if (!actor) return 'unknown';
  if (actor.startsWith('api:')) return actor.slice('api:'.length);
  if (actor.startsWith('attach:')) return 'an attached terminal';
  return actor;
}

function short(sha: string): string {
  return sha.slice(0, 12);
}

export function SessionPage(): JSX.Element {
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const session = useQuery({
    queryKey: [...SESSIONS_KEY, 'one', sessionId],
    queryFn: ({ signal }) =>
      apiGet<SessionStatus>(endpoints.mySession(sessionId), { signal }),
    enabled: sessionId.length > 0,
    refetchInterval: (query) =>
      query.state.data && isLiveSession(query.state.data) ? 5_000 : false,
    retry: false
  });
  const forgeHost = useForgeHost();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const stop = useMutation({
    mutationFn: (current: SessionStatus) => sendTerminate(stopChannel(current)),
    onSettled: () => {
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    }
  });
  const data = session.data;
  const ref = data ? repoRefOf(forgeHost(data.repo), data.repo) : null;

  return (
    <div className="page sessions session-page" data-testid="session-page">
      <PageHeader
        title={<span className="sessions__mono">{sessionId}</span>}
        testId="session-header"
        parent="nav.sessions"
        crumbs={[{ label: sessionId }]}
        freshness={data ? queryFreshness(session) : undefined}
        subtitle="One Firecracker VM: the agent and a shell beside it."
        actions={
          data && ref ? (
            <>
              <Link
                className="session-page__terminals"
                to={repoUrl(ref, 'agents', encodeURIComponent(data.run_id))}
              >
                Open its terminals
              </Link>
              {!isLiveSession(data) ? null : confirming ? (
                <>
                  <ActionButton
                    actionId="sessions.stop"
                    variant="human"
                    disabled={stop.isPending}
                    onClick={() => stop.mutate(data)}
                  >
                    Confirm stop
                  </ActionButton>
                  <ActionButton
                    variant="default"
                    onClick={() => setConfirming(false)}
                  >
                    Keep
                  </ActionButton>
                </>
              ) : (
                <ActionButton
                  variant="default"
                  aria-label={`Stop ${data.session_id}`}
                  onClick={() => setConfirming(true)}
                >
                  Stop
                </ActionButton>
              )}
            </>
          ) : undefined
        }
      />

      {confirming ? (
        <p className="page__roadmap-note" role="status">
          Stopping ends the VM: the agent and the shell in it stop together.
        </p>
      ) : null}
      {stop.isError ? (
        <ErrorState
          title="Could not stop the session."
          error={stop.error}
          testId="session-stop-error"
        />
      ) : null}

      {session.isPending ? (
        <LoadingState variant="message" title="Loading the session." />
      ) : session.isError ? (
        session.error instanceof ApiError && session.error.status === 404 ? (
          <EmptyState
            title="No session of yours has this id."
            description="It may be another account's, or the id may be mistyped."
            testId="session-missing"
          />
        ) : (
          <ErrorState
            title="Could not load the session."
            error={session.error}
            onRetry={() => void session.refetch()}
            testId="session-error"
          />
        )
      ) : data && ref ? (
        <>
          <SessionFacts
            session={data}
            repoRef={ref}
            now={session.dataUpdatedAt}
          />
          <section className="page__section" aria-labelledby="session-channels">
            <h2 id="session-channels">Terminals</h2>
            <div className="session-page__channels">
              <ChannelCard name="Agent" channel={data.channels.agent} />
              <ChannelCard name="Shell" channel={data.channels.shell} />
            </div>
          </section>
          <section className="page__section" aria-labelledby="session-bots">
            <h2 id="session-bots">
              Grokbot and Musebot activity in this session
            </h2>
            <BotActivityList
              repo={data.repo}
              sessionId={data.session_id}
              emptyTitle="No Grokbot or Musebot has worked this session."
              testId="session-bot-activity"
            />
          </section>
        </>
      ) : null}
    </div>
  );
}

function SessionFacts({
  session,
  repoRef,
  now
}: {
  session: SessionStatus;
  repoRef: RepoRef;
  /** When the session was read: the lease is told as of then. */
  now: number;
}): JSX.Element {
  const commit = (sha: string) => (
    <Link
      className="sessions__mono"
      to={repoUrl(repoRef, 'commit', sha)}
      title={sha}
    >
      {short(sha)}
    </Link>
  );
  return (
    <dl className="session-page__facts" data-testid="session-facts">
      <dt>Repository</dt>
      <dd>
        <Link to={repoUrl(repoRef)}>{session.repo}</Link>
        {session.labels.branch ? (
          <span className="sessions__detail sessions__mono">
            {' '}
            {session.labels.branch}
          </span>
        ) : null}
      </dd>
      <dt>Provider</dt>
      <dd>
        {session.provider}
        {session.labels.model ? (
          <span className="sessions__detail"> {session.labels.model}</span>
        ) : null}
      </dd>
      <dt>Started by</dt>
      <dd>
        <code>{session.started_by}</code>{' '}
        <span title={absoluteText(session.created_at_ms)}>
          {relativeText(session.created_at_ms)}
        </span>
      </dd>
      {session.labels.todo_id ? (
        <>
          <dt>For</dt>
          <dd>
            <Link to={todoHref(session.labels.todo_id)}>
              todo {session.labels.todo_id}
            </Link>
            {session.labels.slot ? (
              <span className="sessions__detail"> {session.labels.slot}</span>
            ) : null}
          </dd>
        </>
      ) : null}
      <dt>State</dt>
      <dd>
        <span className="page__pill">{session.dispatch_state}</span>
        {session.state_reason ? (
          <span className="sessions__detail"> {session.state_reason}</span>
        ) : null}
      </dd>
      <dt>Node</dt>
      <dd>
        <span className="sessions__mono">{session.runner_id}</span>
        <span className="sessions__detail">
          {' '}
          generation {session.generation}
        </span>
      </dd>
      <dt>Lease</dt>
      <dd>
        {session.lease_expires_at_ms ? (
          <span title={absoluteText(session.lease_expires_at_ms)}>
            {session.lease_expires_at_ms > now ? 'ends' : 'ended'}{' '}
            {relativeText(session.lease_expires_at_ms, now)}
          </span>
        ) : (
          '—'
        )}
      </dd>
      <dt>Started from</dt>
      <dd>
        {session.source_revision ? commit(session.source_revision) : '—'}
        {session.main_revision &&
        session.source_revision &&
        session.main_revision !== session.source_revision ? (
          <span className="sessions__detail">
            {' '}
            on main {commit(session.main_revision)}
          </span>
        ) : session.main_revision ? (
          <span className="sessions__detail"> main then</span>
        ) : null}
      </dd>
    </dl>
  );
}

function ChannelCard({
  name,
  channel
}: {
  name: string;
  channel: SessionChannel;
}): JSX.Element {
  return (
    <div
      className="page__card session-page__channel"
      data-testid={`session-channel-${name.toLowerCase()}`}
    >
      <h3>
        {name} <span className="page__pill">{channel.state ?? 'unknown'}</span>
      </h3>
      <p className="sessions__detail">
        <span className="sessions__mono">{channel.run_id}</span>
        {channel.exit_code !== null ? `, exit ${channel.exit_code}` : ''}
        {channel.error_code ? `, ${channel.error_code}` : ''}
      </p>
      {channel.recent_controls.length === 0 ? (
        <p className="sessions__detail">No control sent yet.</p>
      ) : (
        <table className="admin-users__table session-page__controls">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Control</th>
              <th scope="col">From</th>
              <th scope="col">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {channel.recent_controls.map((control: SessionControl) => (
              <tr key={control.seq} data-testid="session-control">
                <td>{control.seq}</td>
                <td>
                  <code>{control.command}</code>
                </td>
                <td>{controlSender(control.actor)}</td>
                <td>{control.outcome ?? 'pending'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
