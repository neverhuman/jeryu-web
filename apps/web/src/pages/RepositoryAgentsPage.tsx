import React, { useState, useEffect, useCallback, useId, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, GitBranch, Server, Bot, Radio, ListChecks, Cpu, SquareTerminal } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import {
  livePresenceCount,
  mergePresenceWithRuns,
  presenceRunId,
  presenceView,
  type PresenceRow,
} from '../api/agentPresence';
import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import { runLabel } from '../api/agentTerminal';
import { SESSION_TASK_MAX_BYTES, sessionTaskBytes } from '../api/sessions';
import type { RepoAgentRunsResponse, RepoAgentSummary } from '../api/types';
import type { AgentProvider } from '../api/types/providerConnections';
import { EmptyState, ErrorState, LoadingState } from '../components/state';
import { toneClass, type Tone } from '../components/tone/tone';
import { AgentTerminal } from '../components/terminal/AgentTerminal';
import { useResolveRepo } from '../hooks/useResolveRepo';
import { useRealtime } from '../hooks/useRealtime';
import { useCreateSession } from '../hooks/useCreateSession';
import { useShiftTodos } from '../hooks/useShift';
import { useRepoAgentPresence } from '../hooks/useAgentPresence';
import { useTickingNow } from '../hooks/useTickingNow';
import { PresenceList } from './agents/PresenceList';
import { agentLabel } from './agents/presenceModel';
import { RepoBotRoster } from './bots/RepoBotRoster';
import { SESSIONS_PATH } from './SessionsPage';
import { repoQueueRuns, type RepoQueueRun } from './repoQueueRuns';
import { todoHref } from './shift/workPaths';

import './page.css';
import './RepositoryAgentsPage.css';

const MAX_AGENT_PANES = 3;

/** The providers a session node admits; each runs in its own Firecracker VM. */
const SESSION_PROVIDERS: { value: AgentProvider; label: string }[] = [
  { value: 'codex', label: 'Codex' },
  { value: 'claude', label: 'Claude' },
  { value: 'grok', label: 'Grok' },
];

/** `1 byte`, `8000 bytes`. */
function byteCount(bytes: number): string {
  return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
}

/** A run whose terminal is worth opening by itself: it is still running. */
function isLiveRun(run: RepoAgentSummary): boolean {
  return run.tty_live || run.status === 'running';
}

/** A single agent pane shown in the top split. */
interface ActivePane {
  runId: string;
  shellRunId: string | null;
  label?: string;
}

export interface RepositoryAgentsPageProps {
  provider?: string;
  fullName?: string;
  splatTail?: string;
}

export function RepositoryAgentsPage(props: RepositoryAgentsPageProps = {}): JSX.Element {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const provider = props.provider ?? params.provider ?? 'unknown';
  const fullName = props.fullName ?? params.fullName ?? '';
  const splatRunId = (props.splatTail ?? params['*'] ?? '').replace(/\/+$/, '') || null;
  const [sessionProvider, setSessionProvider] = useState<AgentProvider>('codex');
  const [model, setModel] = useState('');
  // The start task, which the page calls the prompt: the glossary keeps the
  // word "task" off the screen, where a reader would take it for a todo.
  const [task, setTask] = useState('');
  const taskId = useId();
  // Measured as the server measures it: UTF-8 bytes of the trimmed text.
  const taskBytes = sessionTaskBytes(task);
  const taskOver = taskBytes > SESSION_TASK_MAX_BYTES;

  // Multiple active panes (up to MAX_AGENT_PANES).
  const [activePanes, setActivePanes] = useState<ActivePane[]>([]);

  // The "selected" run is the last-added pane (for URL + list highlighting).
  const selectedRunId = activePanes.length > 0 ? activePanes[activePanes.length - 1].runId : null;
  // The companion shell is from the first pane (primary workspace).
  const shellRunId = activePanes.length > 0 ? activePanes[0].shellRunId : null;

  const resolved = useResolveRepo(provider, fullName);
  const repoId = resolved.data?.id ?? null;

  useRealtime(repoId ? [`repo.${repoId}`] : []);

  const createSession = useCreateSession(repoId);

  const onNewSession = useCallback((): void => {
    if (activePanes.length >= MAX_AGENT_PANES || taskOver) return;
    createSession.mutate({ provider: sessionProvider, model, task }, {
      onSuccess: (created) => {
        setActivePanes((prev) => {
          // Guard against duplicate panes (e.g. server ID counter reset).
          if (prev.some((p) => p.runId === created.run_id)) return prev;
          return [
            ...prev,
            {
              runId: created.run_id,
              shellRunId: created.shell_run_id ?? null,
              // A VM session has no branch of its own: name it by session.
              label: `${sessionProvider} · ${created.branch || created.session_id || created.run_id}`,
            },
          ];
        });
        const agentsBase = location.pathname.replace(/\/agents(?:\/.*)?$/, '/agents');
        navigate(`${agentsBase}/${encodeURIComponent(created.run_id)}`);
      },
    });
  }, [activePanes.length, createSession, location.pathname, model, navigate, sessionProvider, task, taskOver]);

  const runs = useQuery({
    queryKey: ['repo-agent-runs', repoId],
    queryFn: ({ signal }) =>
      apiGet<RepoAgentRunsResponse>(endpoints.repoAgentRuns(repoId as string), {
        signal,
      }),
    enabled: typeof repoId === 'string' && repoId.length > 0,
    staleTime: 10_000,
  });

  const items = useMemo(() => runs.data?.items ?? [], [runs.data]);

  // Agent presence: everyone at work here, jeryu's own runs among them. An
  // older server has no such route; the page then shows the runs alone.
  const presence = useRepoAgentPresence(repoId);
  const view = presenceView(presence);
  const presenceRows = useMemo(
    () => (presence.data ? mergePresenceWithRuns(presence.data.items, items) : null),
    [presence.data, items]
  );
  const now = useTickingNow();

  // Queue runs: a worker attempt on a todo naming this repository is work the
  // operator has running here, and it never shows up under `agent-runs`.
  const queueTodos = useShiftTodos(undefined);
  const repoName = resolved.data?.summary.id.name ?? '';
  const queueRuns = useMemo(
    () => repoQueueRuns(queueTodos.data?.todos ?? [], repoName),
    [queueTodos.data, repoName]
  );

  // Opened with no run named, the page used to show an empty "Choose a run"
  // pane beside a list of live runs. A live run is what the operator came for,
  // so the first one opens itself — once, so choosing another one sticks.
  const autoOpened = useRef(false);

  // Deep-link: when the runs list loads, add the splat run if it exists on
  // the server and isn't already in the active panes. Also backfill
  // shellRunId for any panes that were added before the list arrived.
  useEffect(() => {
    if (items.length === 0) return;
    setActivePanes((prev) => {
      let next = prev;
      let changed = false;

      // Deep-link: add the URL-specified run if not already present.
      if (splatRunId && !next.some((p) => p.runId === splatRunId)) {
        const match = items.find((r: RepoAgentSummary) => r.run_id === splatRunId);
        if (match) {
          next = [...next, {
            runId: splatRunId,
            shellRunId: match.shell_run_id ?? null,
            label: runLabel(match),
          }];
          changed = true;
        }
      }

      // Backfill shellRunId for any panes missing it.
      next = next.map((pane) => {
        if (pane.shellRunId) return pane;
        const match = items.find((r: RepoAgentSummary) => r.run_id === pane.runId);
        if (match?.shell_run_id) {
          changed = true;
          return { ...pane, shellRunId: match.shell_run_id };
        }
        return pane;
      });

      return changed ? next : prev;
    });
  }, [splatRunId, items]);

  // Opened with no run named: the first live run opens itself. Its own effect,
  // not a branch of the one above — a state updater runs more than once, and
  // deciding "only the first time" inside one skipped the pane it had added.
  useEffect(() => {
    if (splatRunId || autoOpened.current || items.length === 0) return;
    if (activePanes.length > 0) {
      autoOpened.current = true;
      return;
    }
    const live = items.find((r: RepoAgentSummary) => isLiveRun(r));
    if (!live) return;
    autoOpened.current = true;
    setActivePanes([
      {
        runId: live.run_id,
        shellRunId: live.shell_run_id ?? null,
        label: runLabel(live),
      },
    ]);
  }, [splatRunId, items, activePanes.length]);

  // Click a row from the list → replace all panes with just that one.
  function onSelectRun(run: RepoAgentSummary): void {
    setActivePanes([{
      runId: run.run_id,
      shellRunId: run.shell_run_id ?? null,
      label: runLabel(run),
    }]);
  }

  function onOpenPresence(row: PresenceRow): void {
    const runId = presenceRunId(row.item);
    if (!runId) return;
    setActivePanes([{
      runId,
      shellRunId: row.run?.shell_run_id ?? null,
      label: `${agentLabel(row.item)} · ${row.item.branch ?? runId}`,
    }]);
  }

  if (resolved.isPending) {
    return (
      <div className="page" data-testid="repo-agents-page">
        <LoadingState variant="message" title="Resolving repository." />
      </div>
    );
  }

  if (resolved.error || !resolved.data) {
    return (
      <div className="page" data-testid="repo-agents-page">
        <header className="page__header">
          <h2 className="page__title">Active agents</h2>
        </header>
        <ErrorState
          title="Could not resolve the repository."
          error={resolved.error}
          description={resolved.error ? undefined : `No repository ${fullName}.`}
          onRetry={resolved.refetch}
          testId="repo-agents-error"
        />
      </div>
    );
  }

  const atCapacity = activePanes.length >= MAX_AGENT_PANES;
  // The terminal belongs to agent runs. With none to open, its "choose a run"
  // prompt would only stack a second empty state under the list's own.
  const showTerminalPane =
    activePanes.length > 0 ||
    items.length > 0 ||
    (presenceRows ?? []).some((row) => presenceRunId(row.item) !== null);

  return (
    <div className="page page--full agents" data-testid="repo-agents-page">
      <header className="page__header">
        <div>
          <h2 className="page__title">Active agents</h2>
          <p className="page__subtitle">
            {resolved.data.summary.id.owner}/{resolved.data.summary.id.name}
          </p>
        </div>
        <div className="agents__header-actions">
          <Link className="agents__all-sessions" to={SESSIONS_PATH} data-testid="agents-all-sessions">
            Your sessions
          </Link>
          <label className="agents__agent-pick">
            <span className="sr-only">Provider</span>
            <select
              className="agents__agent-select"
              value={sessionProvider}
              onChange={(event) => setSessionProvider(event.target.value as AgentProvider)}
              disabled={createSession.isPending}
              data-testid="new-session-agent"
              aria-label="Provider to start"
            >
              {SESSION_PROVIDERS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="agents__agent-pick">
            <span className="sr-only">Model</span>
            <input
              className="agents__model-input"
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              disabled={createSession.isPending}
              placeholder="Model (default)"
              maxLength={128}
              spellCheck={false}
              autoComplete="off"
              data-testid="new-session-model"
              aria-label="Model, or empty for the provider's default"
            />
          </label>
          <button
            type="button"
            className="agents__new-session"
            data-testid="new-session-button"
            onClick={onNewSession}
            disabled={createSession.isPending || !repoId || atCapacity || taskOver}
            aria-busy={createSession.isPending}
            title={
              atCapacity
                ? `Max ${MAX_AGENT_PANES} sessions`
                : taskOver
                  ? `The prompt is over ${SESSION_TASK_MAX_BYTES} bytes`
                  : undefined
            }
          >
            <Plus size={14} aria-hidden="true" />
            {createSession.isPending ? 'Starting…' : 'New Session'}
            {activePanes.length > 0 ? (
              <span className="agents__session-count">
                {activePanes.length}/{MAX_AGENT_PANES}
              </span>
            ) : null}
          </button>
        </div>
        <div className="agents__task">
          <label className="agents__task-pick">
            <span className="agents__task-label">Prompt</span>
            <textarea
              className="agents__task-input"
              rows={2}
              value={task}
              onChange={(event) => setTask(event.target.value)}
              disabled={createSession.isPending}
              autoComplete="off"
              data-testid="new-session-task"
              aria-invalid={taskOver || undefined}
              aria-describedby={`${taskId}-hint ${taskId}-count`}
            />
          </label>
          <div className="agents__task-notes">
            <span id={`${taskId}-hint`}>
              Optional. The agent starts on this prompt; leave it empty to start an interactive
              session.
            </span>
            <span
              id={`${taskId}-count`}
              className={`agents__task-count${taskOver ? ' is-over' : ''}`}
              data-testid="new-session-task-count"
            >
              {taskOver
                ? `${byteCount(taskBytes - SESSION_TASK_MAX_BYTES)} over the limit of ${SESSION_TASK_MAX_BYTES}: shorten the prompt to start a session.`
                : `${byteCount(SESSION_TASK_MAX_BYTES - taskBytes)} left`}
            </span>
          </div>
        </div>
      </header>

      {createSession.isError ? (
        <ErrorState
          className="agents__new-session-error"
          title="Could not start a session."
          error={createSession.error}
          testId="new-session-error"
        />
      ) : null}

      <div className="agents__layout">
        <RepoBotRoster
          repoId={resolved.data.id}
          owner={resolved.data.summary.id.owner}
          name={resolved.data.summary.id.name}
        />
        {presenceRows ? (
          <PresencePane
            rows={presenceRows}
            host={resolved.data.summary.id.host}
            repo={`${resolved.data.summary.id.owner}/${resolved.data.summary.id.name}`}
            now={now}
            openRuns={new Set(activePanes.map((pane) => pane.runId))}
            onOpenRun={onOpenPresence}
          />
        ) : view.kind === 'waiting' && repoId ? (
          <section className="page__section agents__list-pane" aria-label="Agents at work">
            <LoadingState variant="message" title="Loading agents." />
          </section>
        ) : (
          <>
            {view.kind === 'failed' ? (
              <p className="agents__presence-note" role="status" data-testid="agents-presence-error">
                Could not load the other agents at work here; showing jeryu runs only.{' '}
                <button type="button" onClick={() => void presence.refetch()}>
                  Retry
                </button>
              </p>
            ) : null}
            <section
              className="page__section agents__list-pane"
              aria-labelledby="agents-list"
            >
              <h2 className="page__section-title" id="agents-list">
                Runs
              </h2>
              {runs.isPending ? (
                <LoadingState variant="message" title="Loading agent runs." />
              ) : runs.isError ? (
                <ErrorState
                  title="Could not load agent runs."
                  error={runs.error}
                  onRetry={() => void runs.refetch()}
                  testId="agents-runs-error"
                />
              ) : items.length === 0 ? (
                <EmptyState
                  title="No agent session on this repository yet."
                  description="Start one with New Session."
                  testId="agents-empty"
                />
              ) : (
                <ul className="agents__list" data-testid="agents-list">
                  {items.map((run: RepoAgentSummary) => (
                    <AgentRow
                      key={run.run_id}
                      run={run}
                      onSelect={() => onSelectRun(run)}
                      active={activePanes.some((p) => p.runId === run.run_id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {queueRuns.length > 0 ? (
          <section
            className="page__section agents__queue-pane"
            aria-labelledby="agents-queue"
            data-testid="agents-queue"
          >
            <h2 className="page__section-title" id="agents-queue">
              Queue runs
            </h2>
            <ul className="agents__list" data-testid="agents-queue-list">
              {queueRuns.map((run) => (
                <QueueRow key={run.key} run={run} />
              ))}
            </ul>
          </section>
        ) : null}

        {showTerminalPane ? (
        <section className="agents__terminal-pane" aria-label="Agent terminal">
          {activePanes.length > 0 ? (
            <div className="agents__split-terminals">
              {/* Top: 1–3 agent terminals side by side */}
              <div className="agents__split-top" data-testid="agent-terminal-pane">
                {activePanes.map((pane, i) => (
                  <React.Fragment key={pane.runId}>
                    {i > 0 && <div className="agents__col-divider" />}
                    <div className="agents__agent-col">
                      <AgentTerminal
                        runId={pane.runId}
                        label={pane.label}
                      />
                    </div>
                  </React.Fragment>
                ))}
              </div>

              <div className="agents__split-divider" />

              {/* Bottom: companion shell */}
              <div className="agents__split-bottom" data-testid="shell-terminal-pane">
                {shellRunId ? (
                  <AgentTerminal
                    runId={shellRunId}
                    label="Shell · free-form"
                  />
                ) : (
                  <EmptyState title="No companion shell available." />
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Choose a run to open its live terminal."
              testId="agents-no-selection"
            />
          )}
        </section>
        ) : null}
      </div>
    </div>
  );
}

/** The presence list: one row per agent at work here, live ones first. */
function PresencePane({
  rows,
  host,
  repo,
  now,
  openRuns,
  onOpenRun,
}: {
  rows: PresenceRow[];
  host: string;
  repo: string;
  now: number;
  openRuns: ReadonlySet<string>;
  onOpenRun: (row: PresenceRow) => void;
}): JSX.Element {
  const live = livePresenceCount(rows.map((row) => row.item));
  return (
    <section
      className="page__section agents__presence-pane"
      aria-labelledby="agents-presence"
      data-testid="agents-presence"
    >
      <h2 className="page__section-title" id="agents-presence">
        Agents at work
        {live > 0 ? (
          <span className="agents__presence-count" data-testid="agents-presence-live">
            {live} live
          </span>
        ) : null}
      </h2>
      {rows.length === 0 ? (
        <EmptyState
          title="No agents are active on this repository."
          description="Start one with New Session."
          testId="agents-empty"
        />
      ) : (
        <PresenceList
          rows={rows}
          host={host}
          repo={repo}
          now={now}
          openRuns={openRuns}
          onOpenRun={onOpenRun}
        />
      )}
    </section>
  );
}

function AgentRow({
  run,
  onSelect,
  active,
}: {
  run: RepoAgentSummary;
  onSelect: () => void;
  active: boolean;
}): JSX.Element {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`agents__row${active ? ' is-active' : ''}`}
        data-testid={`agent-row-${run.run_id}`}
        aria-pressed={active}
      >
        {run.branch || !run.session_id ? (
          <span className="agents__row-branch">
            <GitBranch size={13} aria-hidden="true" /> {run.branch}
          </span>
        ) : (
          <span
            className="agents__row-branch agents__row-session"
            title={run.started_by ? `started by ${run.started_by}` : undefined}
          >
            <SquareTerminal size={13} aria-hidden="true" /> {run.session_id}
          </span>
        )}
        <span className="agents__row-runner">
          <Server size={13} aria-hidden="true" /> {run.runner}
        </span>
        <span className="agents__row-agent">
          <Bot size={13} aria-hidden="true" /> {run.agent ?? 'agent'}
        </span>
        <span
          className={toneClass('agents__row-status', statusVariant(run.status))}
          data-testid={`agent-status-${run.run_id}`}
        >
          {run.status}
        </span>
        <span
          className={`agents__tty-dot${run.tty_live ? ' is-live' : ''}`}
          data-testid={`agent-tty-${run.run_id}`}
          title={run.tty_live ? 'TTY streaming' : 'No live TTY'}
        >
          <Radio size={12} aria-hidden="true" />
          {run.tty_live ? 'live' : 'idle'}
        </span>
      </button>
    </li>
  );
}

/** One queue attempt, linking to the todo it worked on. */
function QueueRow({ run }: { run: RepoQueueRun }): JSX.Element {
  return (
    <li>
      <Link
        to={todoHref(run.todoId)}
        className="agents__row"
        data-testid={`agent-queue-row-${run.todoId}`}
        title={`${run.title} · started ${run.started}`}
      >
        <span className="agents__row-branch">
          <ListChecks size={13} aria-hidden="true" /> {run.title}
        </span>
        <span className="agents__row-runner">
          <Server size={13} aria-hidden="true" /> {run.worker}
        </span>
        <span className="agents__row-agent">
          <Cpu size={13} aria-hidden="true" /> {run.model}
        </span>
        <span
          className={toneClass('agents__row-status', statusVariant(run.outcome))}
          data-testid={`agent-queue-status-${run.todoId}`}
        >
          {run.outcome}
        </span>
      </Link>
    </li>
  );
}

function statusVariant(status: string): Tone {
  switch (status) {
    case 'running':
    case 'done':
      return 'ok';
    case 'blocked':
    case 'queued':
      return 'warn';
    case 'failed':
    case 'errored':
      return 'failed';
    default:
      return 'unknown';
  }
}
