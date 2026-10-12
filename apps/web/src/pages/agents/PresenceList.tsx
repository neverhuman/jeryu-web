// PresenceList.tsx — everyone at work on a repository, one row each.
//
// The Agents page draws the full list: agent and model, what it is doing, who
// started it, where (branch and checkout), what kind of agent it is, its state,
// when it started and was last seen, its spend so far, and links to the pull
// request, the todo and — for jeryu's own runs — the live terminal. A session
// that reaches the repository through its family says so, and two live agents
// on one branch each carry a collision warning.
//
// The family rail draws the compact list: live rows only, one line each.

import { AlertTriangle, Bot, GitBranch, ListChecks, GitPullRequest, Radio, Server, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { isLivePresence, presenceRunId, type AgentPresenceItem, type PresenceRow } from '../../api/agentPresence';
import { toneClass } from '../../components/tone/tone';
import { relativeText } from '../../format/when';

import {
  agentLabel,
  collisionText,
  costText,
  presenceHeadline,
  presencePullHref,
  presenceRepoHref,
  presenceTodoHref,
  pullLinkLabel,
  sourceLabel,
  stateTone,
  todoLabel,
} from './presenceModel';

import './PresenceList.css';

export interface PresenceListProps {
  rows: readonly PresenceRow[];
  /** The forge host the repository lives on, for in-app links. */
  host: string;
  /** `owner/name` of the repository the list is for. */
  repo: string;
  now: number;
  /** Run ids open in the terminal. */
  openRuns: ReadonlySet<string>;
  onOpenRun: (row: PresenceRow) => void;
}

export function PresenceList({ rows, host, repo, now, openRuns, onOpenRun }: PresenceListProps): JSX.Element {
  const byId = useMemo(() => new Map(rows.map((row) => [row.item.id, row.item])), [rows]);
  return (
    <ul className="presence" data-testid="agents-presence-list">
      {rows.map((row) => (
        <PresenceRowView
          key={row.item.id}
          row={row}
          host={host}
          repo={repo}
          now={now}
          byId={byId}
          open={openRuns.has(presenceRunId(row.item) ?? '')}
          onOpenRun={onOpenRun}
        />
      ))}
    </ul>
  );
}

function PresenceRowView({
  row,
  host,
  repo,
  now,
  byId,
  open,
  onOpenRun,
}: {
  row: PresenceRow;
  host: string;
  repo: string;
  now: number;
  byId: ReadonlyMap<string, AgentPresenceItem>;
  open: boolean;
  onOpenRun: (row: PresenceRow) => void;
}): JSX.Element {
  const { item, run } = row;
  const runId = presenceRunId(item);
  const headline = presenceHeadline(item);
  const collision = isLivePresence(item) ? collisionText(item, byId) : null;
  const pullHref = presencePullHref(host, item.links.pr);
  const todoHref = presenceTodoHref(item.links.todo);
  const cost = costText(item.cost_usd);
  const name = (
    <>
      <Bot size={13} aria-hidden="true" />
      <span className="presence__agent">{agentLabel(item)}</span>
      {headline ? <span className="presence__headline">{headline}</span> : null}
    </>
  );

  return (
    <li
      className={`presence__row presence__row--${item.state}${collision ? ' presence__row--collides' : ''}`}
      data-testid={`presence-row-${item.id}`}
      data-state={item.state}
    >
      <div className="presence__head">
        <span
          className={toneClass('presence__state', stateTone(item.state))}
          data-testid={`presence-state-${item.id}`}
        >
          {item.state}
        </span>
        {runId ? (
          <button
            type="button"
            className={`presence__name presence__open${open ? ' is-active' : ''}`}
            onClick={() => onOpenRun(row)}
            aria-pressed={open}
            data-testid={`agent-row-${runId}`}
            title="Open the live terminal"
          >
            {name}
            {run ? <span className="presence__runner">{run.runner}</span> : null}
          </button>
        ) : (
          <span className="presence__name">{name}</span>
        )}
        {item.via === 'family' ? (
          <span className="presence__via" data-testid={`presence-via-family-${item.id}`}>
            via family {item.family ?? ''}
          </span>
        ) : null}
        {run ? (
          <>
            <span
              className="presence__run-status"
              data-testid={`agent-status-${run.run_id}`}
            >
              {run.status}
            </span>
            <span
              className={`presence__tty${run.tty_live ? ' is-live' : ''}`}
              data-testid={`agent-tty-${run.run_id}`}
              title={run.tty_live ? 'Terminal streaming' : 'No live terminal'}
            >
              <Radio size={12} aria-hidden="true" />
              {run.tty_live ? 'live' : 'idle'}
            </span>
          </>
        ) : null}
      </div>

      <p className="presence__meta">
        <span className="presence__fact" data-testid={`presence-source-${item.id}`}>
          {sourceLabel(item.source)}
        </span>
        {item.operator ? (
          <span className="presence__fact">
            <Users size={12} aria-hidden="true" /> {item.operator}
          </span>
        ) : null}
        {/* Without a title the branch is already the headline. */}
        {item.branch && item.title ? (
          <span className="presence__fact presence__mono">
            <GitBranch size={12} aria-hidden="true" /> {item.branch}
          </span>
        ) : null}
        {item.lane ? <span className="presence__fact">checkout {item.lane}</span> : null}
        {item.host ? (
          <span className="presence__fact" data-testid={`presence-host-${item.id}`}>
            <Server size={12} aria-hidden="true" /> {item.host}
          </span>
        ) : null}
        {item.started_at !== null ? (
          <span className="presence__fact">started {relativeText(item.started_at, now)}</span>
        ) : null}
        {item.last_active_at !== null ? (
          <span className="presence__fact">seen {relativeText(item.last_active_at, now)}</span>
        ) : null}
        {cost ? (
          <span className="presence__fact" data-testid={`presence-cost-${item.id}`}>
            {cost} so far
          </span>
        ) : null}
      </p>

      {collision ? (
        <p className="presence__collision" role="note" data-testid={`presence-collision-${item.id}`}>
          <AlertTriangle size={13} aria-hidden="true" /> {collision}
        </p>
      ) : null}

      {pullHref || todoHref ? (
        <p className="presence__links">
          {pullHref ? (
            <Link to={pullHref} data-testid={`presence-pr-${item.id}`}>
              <GitPullRequest size={12} aria-hidden="true" /> {pullLinkLabel(item.links.pr, repo)}
            </Link>
          ) : null}
          {todoHref ? (
            <Link to={todoHref} data-testid={`presence-todo-${item.id}`}>
              <ListChecks size={12} aria-hidden="true" /> {todoLabel(item.links.todo)}
            </Link>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}

export interface CompactPresenceListProps {
  items: readonly AgentPresenceItem[];
  host: string;
  now: number;
}

/** The family rail's list: live agents only, one line each, each opening its repository. */
export function CompactPresenceList({ items, host, now }: CompactPresenceListProps): JSX.Element {
  const live = items.filter(isLivePresence);
  const byId = new Map(items.map((item) => [item.id, item]));
  if (live.length === 0) {
    return (
      <p className="presence-compact__empty" data-testid="family-agents-empty">
        No agents are active in this family.
      </p>
    );
  }
  return (
    <ul className="presence-compact" data-testid="family-agents-list">
      {live.map((item) => {
        const href = presenceRepoHref(host, item);
        const collision = collisionText(item, byId);
        const where = item.repos.length > 0 ? item.repos.join(', ') : item.families.map((f) => `family ${f}`).join(', ');
        const body = (
          <>
            <span className={toneClass('presence__dot', stateTone(item.state))} aria-hidden="true" />
            <span className="presence-compact__agent">{agentLabel(item)}</span>
            {item.operator ? <span className="presence-compact__fact">{item.operator}</span> : null}
            {where ? <span className="presence-compact__fact">{where}</span> : null}
            <span className="presence-compact__fact">{relativeText(item.last_active_at, now)}</span>
            {collision ? (
              <AlertTriangle
                size={12}
                className="presence-compact__warn"
                aria-label={collision}
                data-testid={`family-agent-collision-${item.id}`}
              />
            ) : null}
          </>
        );
        return (
          <li key={item.id} data-testid={`family-agent-${item.id}`} title={presenceHeadline(item) ?? undefined}>
            {href ? (
              <Link to={href} className="presence-compact__row">
                {body}
              </Link>
            ) : (
              <span className="presence-compact__row">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
