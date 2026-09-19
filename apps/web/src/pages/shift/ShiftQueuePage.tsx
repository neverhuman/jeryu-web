// ShiftQueuePage.tsx — Work → Queue (`/work/shift`).
//
// The todoq queue of one family: a Shifts panel (each bulletshift/nightshift
// branch with its repos, ahead/behind, todo count and review PR) above a
// filterable table of todos. A row expands to the body, note and attempt
// history. Admins get release / block / priority / now-night row actions and
// "Open review PR" on each shift.

import { GitBranch, Inbox } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import type { ShiftBranch, ShiftFamily, ShiftTodo } from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { EmptyState, LoadingState } from '../../components/state';
import { useAuth } from '../../hooks/useAuth';
import {
  useOpenShiftPr,
  useShiftFamilies,
  useShiftShifts,
  useShiftTodoAction,
  useShiftTodos,
} from '../../hooks/useShift';
import { FamilyPicker, ShiftError, useSelectedFamily } from './shiftCommon';
import {
  DEFAULT_QUEUE_FILTERS,
  SHIFT_MODES,
  SHIFT_PRIORITIES,
  SHIFT_STATUSES,
  filterShiftTodos,
  formatAgo,
  formatCost,
  todoCost,
  isLastNight,
  latestWorker,
  ownerOf,
  queueOptions,
  repoPath,
  shortSha,
  slotLabel,
  sortShifts,
  statusTone,
  type QueueFilters,
} from './shiftModel';
import { SHIFT_ADD_PATH, WorkTabs } from './WorkTabs';

import '../page.css';
import './Shift.css';

export function ShiftQueuePage(): JSX.Element {
  const families = useShiftFamilies();
  const list = families.data?.families ?? [];
  const { family, setFamily } = useSelectedFamily(list);

  return (
    <div className="page page--wide" data-testid="shift-queue-page">
      <header className="page__header">
        <h1 className="page__title">Work</h1>
        <p className="page__subtitle">
          Todos queued for worker slots. <code>now</code> todos land on today&apos;s
          bulletshift, <code>night</code> todos on tonight&apos;s nightshift; each
          shift reaches main as one review PR per repo.
        </p>
      </header>
      <WorkTabs />

      {families.isPending ? (
        <LoadingState title="Loading shift families…" variant="message" />
      ) : families.isError ? (
        <ShiftError title="Could not load shift families." error={families.error} />
      ) : !family ? (
        <EmptyState
          icon={Inbox}
          title="No shift queues yet."
          description="A family appears here once its <family>-todo repo has a queue branch with a family.toml."
        />
      ) : (
        <FamilyQueue
          family={family}
          families={list}
          onFamily={setFamily}
        />
      )}
    </div>
  );
}

function FamilyQueue({
  family,
  families,
  onFamily,
}: {
  family: ShiftFamily;
  families: ShiftFamily[];
  onFamily: (name: string) => void;
}): JSX.Element {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [params] = useSearchParams();
  const focusIds = useMemo(
    () => (params.get('todo') ?? '').split(',').filter(Boolean),
    [params]
  );
  const [filters, setFilters] = useState<QueueFilters>(DEFAULT_QUEUE_FILTERS);
  const todos = useShiftTodos(family.name);
  const all = useMemo(() => todos.data?.todos ?? [], [todos.data]);
  const options = useMemo(() => queueOptions(all), [all]);
  const filtered = useMemo(() => {
    const shown = filterShiftTodos(all, filters);
    return focusIds.length > 0 ? shown.filter((t) => focusIds.includes(t.id)) : shown;
  }, [all, filters, focusIds]);
  const owner = ownerOf(family.queue_repo);

  const set = (key: keyof QueueFilters) => (value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <>
      <section className="shift__toolbar" aria-label="Queue filters">
        {families.length > 1 ? (
          <FamilyPicker families={families} value={family.name} onChange={onFamily} />
        ) : null}
        <FilterSelect label="Status" value={filters.status} options={[...SHIFT_STATUSES]} onChange={set('status')} />
        <FilterSelect label="Mode" value={filters.mode} options={[...SHIFT_MODES]} onChange={set('mode')} />
        <FilterSelect label="Repo" value={filters.repo} options={options.repos} onChange={set('repo')} />
        <FilterSelect label="Requested by" value={filters.requested_by} options={options.requesters} onChange={set('requested_by')} />
        <FilterSelect label="Worked by" value={filters.worked_by} options={options.workers} onChange={set('worked_by')} />
        <FilterSelect label="Shift" value={filters.shift} options={options.shifts} onChange={set('shift')} />
        {focusIds.length > 0 ? (
          <Link to={`?family=${encodeURIComponent(family.name)}`} className="shift__muted">
            Showing {focusIds.length} filed todo{focusIds.length === 1 ? '' : 's'} · show all
          </Link>
        ) : null}
      </section>

      <ShiftsPanel family={family} owner={owner} isAdmin={isAdmin} />

      <section className="shift__section" aria-label="Todos">
        <h2 className="page__section-title">
          Todos · {filtered.length}
          {filtered.length !== all.length ? ` of ${all.length}` : ''}
        </h2>
        {todos.isPending ? (
          <LoadingState title="Loading todos…" variant="message" />
        ) : todos.isError ? (
          <ShiftError title="Could not load the queue." error={todos.error} />
        ) : all.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="The queue is empty."
            description="File a todo from the Add tab or with todoq add."
            action={isAdmin ? <Link to={`${SHIFT_ADD_PATH}?family=${encodeURIComponent(family.name)}`}>Add todos</Link> : undefined}
          />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Inbox} title="No todos match the current filters." />
        ) : (
          <div className="shift__table-wrap">
            <table className="shift__table">
              <thead>
                <tr>
                  <th scope="col">Todo</th>
                  <th scope="col">Status</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Repos</th>
                  <th scope="col">Requested by</th>
                  <th scope="col">Worker</th>
                  <th scope="col">Lease / attempts</th>
                  <th scope="col">Cost</th>
                  <th scope="col">Commits</th>
                  {isAdmin ? <th scope="col">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    owner={owner}
                    isAdmin={isAdmin}
                    initiallyOpen={focusIds.includes(todo.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option || '(none)'}
          </option>
        ))}
      </select>
    </label>
  );
}

function TodoRow({
  todo,
  owner,
  isAdmin,
  initiallyOpen,
}: {
  todo: ShiftTodo;
  owner: string;
  isAdmin: boolean;
  initiallyOpen: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(initiallyOpen);
  const now = new Date();
  const detailId = `shift-todo-detail-${todo.id}`;
  const commits = Object.entries(todo.commits);
  const worker = latestWorker(todo);

  return (
    <Fragment>
      <tr data-testid={`shift-todo-${todo.id}`}>
        <td>
          <button
            type="button"
            className="shift__row-toggle"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen((v) => !v)}
          >
            {todo.title}
          </button>
          <span className="shift__id">
            {todo.id} · P{todo.priority}
            {todo.triaged ? '' : ' · untriaged'}
          </span>
        </td>
        <td>
          <span className={`page__pill page__pill--${statusTone(todo.status)}`}>
            {todo.merged ? 'merged' : todo.status}
          </span>
        </td>
        <td>{todo.mode}</td>
        <td>{todo.repos.length > 0 ? todo.repos.join(', ') : '—'}</td>
        <td>{todo.requested_by || '—'}</td>
        <td>{worker ?? '—'}</td>
        <td>
          {todo.lease_live && todo.lease_until
            ? `lease ${formatAgo(todo.lease_until, now)}`
            : `${todo.attempts} attempt${todo.attempts === 1 ? '' : 's'}`}
        </td>
        <td className="shift__cost">{formatCost(todoCost(todo))}</td>
        <td>
          {commits.length === 0 ? (
            '—'
          ) : (
            <span className="shift__commits">
              {commits.map(([repo, sha]) => (
                <Link key={repo} to={`${repoPath(owner, repo)}/code`} title={`${repo}@${sha}`}>
                  {repo}@{shortSha(sha)}
                </Link>
              ))}
            </span>
          )}
        </td>
        {isAdmin ? (
          <td>
            <TodoActions todo={todo} />
          </td>
        ) : null}
      </tr>
      {open ? (
        <tr className="shift__detail" id={detailId}>
          <td colSpan={isAdmin ? 10 : 9}>
            <TodoDetail todo={todo} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function TodoDetail({ todo }: { todo: ShiftTodo }): JSX.Element {
  return (
    <div data-testid={`shift-todo-detail-${todo.id}`}>
      <pre>{todo.body || '(no body)'}</pre>
      {todo.note ? <p><strong>Note:</strong> {todo.note}</p> : null}
      <p className="shift__muted">
        Filed {todo.filed_at}
        {todo.shift ? ` · shift ${todo.shift}` : ''}
        {todo.blocked_by.length > 0 ? ` · blocked by ${todo.blocked_by.join(', ')}` : ''}
        {todo.change_set ? ` · change set ${todo.change_set}` : ''}
      </p>
      {todo.worked_by.length === 0 ? (
        <p className="shift__muted">No attempts yet.</p>
      ) : (
        <table className="shift__table" aria-label={`Attempts for ${todo.id}`}>
          <thead>
            <tr>
              <th scope="col">Worker</th>
              <th scope="col">Model</th>
              <th scope="col">Started</th>
              <th scope="col">Ended</th>
              <th scope="col">Outcome</th>
              <th scope="col">Cost</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {todo.worked_by.map((attempt, i) => (
              <tr key={`${attempt.started}-${i}`}>
                <td>
                  {slotLabel(attempt.by, attempt.host, attempt.slot)}
                </td>
                <td>{attempt.model}</td>
                <td>{attempt.started}</td>
                <td>{attempt.ended ?? '—'}</td>
                <td>{attempt.outcome}</td>
                <td>{formatCost(attempt.cost_usd)}</td>
                <td>{attempt.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TodoActions({ todo }: { todo: ShiftTodo }): JSX.Element {
  const action = useShiftTodoAction();
  const base = { family: todo.family, id: todo.id };
  const block = (): void => {
    const note = window.prompt(`Why block ${todo.id}?`, '');
    if (note === null) return;
    action.mutate({ ...base, action: 'block', note });
  };
  const otherMode = todo.mode === 'now' ? 'night' : 'now';
  return (
    <span className="shift__actions">
      {todo.status === 'claimed' || todo.status === 'blocked' || todo.status === 'handoff' ? (
        <ActionButton
          variant="ghost"
          disabled={action.isPending}
          onClick={() => action.mutate({ ...base, action: 'release' })}
          aria-label={`Release ${todo.id}`}
        >
          Release
        </ActionButton>
      ) : null}
      {todo.status !== 'blocked' && todo.status !== 'done' ? (
        <ActionButton
          variant="ghost"
          disabled={action.isPending}
          onClick={block}
          aria-label={`Block ${todo.id}`}
        >
          Block
        </ActionButton>
      ) : null}
      <select
        aria-label={`Priority for ${todo.id}`}
        value={todo.priority}
        disabled={action.isPending}
        onChange={(event) =>
          action.mutate({ ...base, action: 'priority', value: Number(event.target.value) })
        }
      >
        {SHIFT_PRIORITIES.map((p) => (
          <option key={p} value={p}>
            P{p}
          </option>
        ))}
      </select>
      <ActionButton
        variant="ghost"
        disabled={action.isPending || todo.status === 'done'}
        onClick={() => action.mutate({ ...base, action: 'mode', value: otherMode })}
        aria-label={`Move ${todo.id} to ${otherMode}`}
      >
        → {otherMode}
      </ActionButton>
      {action.error ? (
        <span className="shift__error" role="alert">
          {action.error.message}
        </span>
      ) : null}
    </span>
  );
}

function ShiftsPanel({
  family,
  owner,
  isAdmin,
}: {
  family: ShiftFamily;
  owner: string;
  isAdmin: boolean;
}): JSX.Element {
  const shifts = useShiftShifts(family.name);
  const list = useMemo(() => sortShifts(shifts.data?.shifts ?? []), [shifts.data]);
  const now = new Date();
  return (
    <section className="shift__section" aria-label="Shifts">
      <h2 className="page__section-title">Shifts · {list.length}</h2>
      {shifts.isPending ? (
        <LoadingState title="Loading shifts…" variant="message" />
      ) : shifts.isError ? (
        <ShiftError title="Could not load shift branches." error={shifts.error} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No shift branches yet."
          description="A branch is cut from main when the first todo of a shift lands."
        />
      ) : (
        <ul className="shift-branches">
          {list.map((shift) => (
            <ShiftCard
              key={shift.branch}
              shift={shift}
              family={family.name}
              owner={owner}
              isAdmin={isAdmin}
              lastNight={isLastNight(shift, now, family.shift_tz)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ShiftCard({
  shift,
  family,
  owner,
  isAdmin,
  lastNight,
}: {
  shift: ShiftBranch;
  family: string;
  owner: string;
  isAdmin: boolean;
  lastNight: boolean;
}): JSX.Element {
  const openPr = useOpenShiftPr();
  const prs = shift.repos.filter((repo) => repo.pr);
  const missingPr = shift.repos.some((repo) => !repo.pr && repo.ahead > 0);
  return (
    <li
      className={`shift-branch${lastNight ? ' is-last-night' : ''}`}
      data-testid={`shift-branch-${shift.branch}`}
      aria-label={`${shift.branch}${lastNight ? ' (last night)' : ''}`}
    >
      <span>
        <span className="shift-branch__name">{shift.branch}</span>{' '}
        {lastNight ? <span className="page__pill page__pill--success">last night</span> : null}
      </span>
      <span className="shift__muted">
        {shift.todo_ids.length} todo{shift.todo_ids.length === 1 ? '' : 's'} ·{' '}
        {shift.repos.length} repo{shift.repos.length === 1 ? '' : 's'}
      </span>
      <ul className="shift-branch__repos">
        {shift.repos.map((repo) => (
          <li key={repo.repo}>
            <Link to={`${repoPath(owner, repo.repo)}/code`}>{repo.repo}</Link> · +{repo.ahead} / −
            {repo.behind}
            {repo.pr ? (
              <>
                {' · '}
                <a href={repo.pr.url}>
                  PR #{repo.pr.number} ({repo.pr.state})
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {isAdmin && (missingPr || prs.length === 0) ? (
        <span className="shift__actions">
          <ActionButton
            variant="primary"
            disabled={openPr.isPending}
            onClick={() => openPr.mutate({ family, branch: shift.branch })}
            aria-label={`Open review PR for ${shift.branch}`}
          >
            {openPr.isPending ? 'Opening…' : 'Open review PR'}
          </ActionButton>
        </span>
      ) : null}
      {openPr.data ? (
        <span className="shift__muted" role="status">
          {openPr.data.prs.map((pr) => (
            <span key={pr.repo}>
              <a href={pr.url}>
                {pr.repo}#{pr.number}
              </a>{' '}
              {pr.created ? 'opened' : 'already open'}{' '}
            </span>
          ))}
        </span>
      ) : null}
      {openPr.error ? (
        <span className="shift__error" role="alert">
          {openPr.error.message}
        </span>
      ) : null}
    </li>
  );
}
