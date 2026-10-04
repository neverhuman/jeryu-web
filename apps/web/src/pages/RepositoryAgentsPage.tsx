import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, GitBranch, Server, Bot, Radio, ListChecks, Cpu } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { RepoAgentRunsResponse, RepoAgentSummary } from '../api/types';
import { EmptyState, ErrorState, LoadingState } from '../components/state';
import { AgentTerminal } from '../components/terminal/AgentTerminal';
import { useResolveRepo } from '../hooks/useResolveRepo';
import { useRealtime } from '../hooks/useRealtime';
import { useCreateSession } from '../hooks/useCreateSession';
import { useShiftTodos } from '../hooks/useShift';
import { repoQueueRuns, type RepoQueueRun } from './repoQueueRuns';
import { todoHref } from './shift/workPaths';

import './page.css';
import './RepositoryAgentsPage.css';

const MAX_AGENT_PANES = 3;

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
  const [agentId, setAgentId] = useState('codex');

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
    if (activePanes.length >= MAX_AGENT_PANES) return;
    createSession.mutate(agentId, {
      onSuccess: (created) => {
        setActivePanes((prev) => {
          // Guard against duplicate panes (e.g. server ID counter reset).
          if (prev.some((p) => p.runId === created.run_id)) return prev;
          return [
            ...prev,
            {
              runId: created.run_id,
              shellRunId: created.shell_run_id ?? null,
              label: `${agentId} · ${created.branch ?? created.run_id}`,
            },
          ];
        });
        const agentsBase = location.pathname.replace(/\/agents(?:\/.*)?$/, '/agents');
        navigate(`${agentsBase}/${encodeURIComponent(created.run_id)}`);
      },
    });
  }, [activePanes.length, agentId, createSession, location.pathname, navigate]);

  const runs = useQuery({
    queryKey: ['repo-agent-runs', repoId],
    queryFn: ({ signal }) =>
      apiGet<RepoAgentRunsResponse>(endpoints.repoAgentRuns(repoId as string), {
        signal,
      }),
    enabled: typeof repoId === 'string' && repoId.length > 0,
    staleTime: 10_000,
  });

  const items = runs.data?.items ?? [];

  // Queue runs: a worker attempt on a todo naming this repository is work the
  // operator has running here, and it never shows up under `agent-runs`.
  const queueTodos = useShiftTodos(undefined);
  const repoName = resolved.data?.summary.id.name ?? '';
  const queueRuns = useMemo(
    () => repoQueueRuns(queueTodos.data?.todos ?? [], repoName),
    [queueTodos.data, repoName]
  );

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
            label: `${match.agent ?? 'agent'} · ${match.branch}`,
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

  // Click a row from the list → replace all panes with just that one.
  function onSelectRun(run: RepoAgentSummary): void {
    setActivePanes([{
      runId: run.run_id,
      shellRunId: run.shell_run_id ?? null,
      label: `${run.agent ?? 'agent'} · ${run.branch}`,
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
          <h1 className="page__title">Active agents</h1>
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
  const showTerminalPane = activePanes.length > 0 || items.length > 0;

  return (
    <div className="page page--full agents" data-testid="repo-agents-page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Active agents</h1>
          <p className="page__subtitle">
            {resolved.data.summary.id.owner}/{resolved.data.summary.id.name}
          </p>
        </div>
        <div className="agents__header-actions">
          <label className="agents__agent-pick">
            <span className="sr-only">Agent</span>
            <select
              className="agents__agent-select"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              disabled={createSession.isPending}
              data-testid="new-session-agent"
              aria-label="Agent to launch"
            >
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
              <option value="agy">AntiGravity</option>
              <option value="jekko">Jekko</option>
            </select>
          </label>
          <button
            type="button"
            className="agents__new-session"
            data-testid="new-session-button"
            onClick={onNewSession}
            disabled={createSession.isPending || !repoId || atCapacity}
            aria-busy={createSession.isPending}
            title={atCapacity ? `Max ${MAX_AGENT_PANES} sessions` : undefined}
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
        <span className="agents__row-branch">
          <GitBranch size={13} aria-hidden="true" /> {run.branch}
        </span>
        <span className="agents__row-runner">
          <Server size={13} aria-hidden="true" /> {run.runner}
        </span>
        <span className="agents__row-agent">
          <Bot size={13} aria-hidden="true" /> {run.agent ?? 'agent'}
        </span>
        <span
          className={`agents__row-status agents__row-status--${statusVariant(run.status)}`}
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
          className={`agents__row-status agents__row-status--${statusVariant(run.outcome)}`}
          data-testid={`agent-queue-status-${run.todoId}`}
        >
          {run.outcome}
        </span>
      </Link>
    </li>
  );
}

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'muted' {
  switch (status) {
    case 'running':
    case 'done':
      return 'success';
    case 'blocked':
    case 'queued':
      return 'warning';
    case 'failed':
    case 'errored':
      return 'danger';
    default:
      return 'muted';
  }
}
