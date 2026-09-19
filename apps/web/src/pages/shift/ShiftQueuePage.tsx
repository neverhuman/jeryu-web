// ShiftQueuePage.tsx — Work → Queue (`/work/shift`).
//
// The todoq queue of one family: a Shifts panel (each bulletshift/nightshift
// branch with its repos, ahead/behind, todo count and review PR) above a
// filterable table of todos. A row expands to the body, note and attempt
// history. Admins get release / block / priority / now-night row actions and
// "Open review PR" on each shift.

import { GitBranch, Inbox } from 'lucide-react';
import { Fragment, useMemo, useState, type FormEvent, type ReactNode } from 'react';
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
  attemptSummary,
  commitHref,
  countNeedsHuman,
  filterShiftTodos,
  formatAgo,
  formatCost,
  todoCost,
  isLastNight,
  latestWorker,
  repoOwners,
  repoCodeHref,
  splitFinished,
  splitShifts,
  canOpenReviewPr,
  type RepoOwners,
  queueOptions,
  repoPath,
  shortSha,
  slotLabel,
  sortShifts,
  statusTone,
  todoPrHref,
  todoTrace,
  traceSummary,
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
  const owners = useMemo(() => repoOwners(family), [family]);
  const waiting = useMemo(() => countNeedsHuman(all), [all]);
  const humanOnly = filters.attention === 'human';
  // What is live or waits on someone is the page; what is finished folds away.
  // A todo someone asked for by id, or a status filter, is shown as asked.
  const asked = focusIds.length > 0 || filters.status !== 'all';
  const { live, finished } = useMemo(
    () => (asked ? { live: filtered, finished: [] } : splitFinished(filtered)),
    [asked, filtered]
  );
  const showFinished = params.get('finished') === '1';
  const filtersInUse = Object.entries(filters).some(
    ([key, value]) => key !== 'attention' && value !== 'all'
  );

  const set = (key: keyof QueueFilters) => (value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <>
      <section className="shift__toolbar" aria-label="Queue filters">
        {families.length > 1 ? (
          <FamilyPicker families={families} value={family.name} onChange={onFamily} />
        ) : null}
        {waiting > 0 || humanOnly ? (
          <button
            type="button"
            className={`shift__needs-human${humanOnly ? ' is-active' : ''}`}
            aria-pressed={humanOnly}
            onClick={() => set('attention')(humanOnly ? 'all' : 'human')}
            data-testid="shift-needs-human"
          >
            <span className="page__pill page__pill--danger">{waiting}</span> need
            {waiting === 1 ? 's' : ''} a human
          </button>
        ) : null}
        <details className="shift__more-filters" open={filtersInUse || undefined}>
          <summary>More filters</summary>
          <div className="shift__toolbar">
            <FilterSelect label="Status" value={filters.status} options={[...SHIFT_STATUSES]} onChange={set('status')} />
            <FilterSelect label="Mode" value={filters.mode} options={[...SHIFT_MODES]} onChange={set('mode')} />
            <FilterSelect label="Repo" value={filters.repo} options={options.repos} onChange={set('repo')} />
            <FilterSelect label="Requested by" value={filters.requested_by} options={options.requesters} onChange={set('requested_by')} />
            <FilterSelect label="Worked by" value={filters.worked_by} options={options.workers} onChange={set('worked_by')} />
            <FilterSelect label="Shift" value={filters.shift} options={options.shifts} onChange={set('shift')} />
          </div>
        </details>
        {focusIds.length > 0 ? (
          <Link to={`?family=${encodeURIComponent(family.name)}`} className="shift__muted">
            Showing {focusIds.length} filed todo{focusIds.length === 1 ? '' : 's'} · show all
          </Link>
        ) : null}
      </section>

      <section className="shift__section" aria-label="Todos">
        <h2 className="page__section-title">
          {asked ? 'Todos' : 'In progress'} · {live.length}
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
          <>
            {live.length === 0 ? (
              <p className="shift__muted" data-testid="shift-nothing-live">
                Nothing is queued, being worked or waiting on anyone.
              </p>
            ) : (
              <TodoTable todos={live} owners={owners} isAdmin={isAdmin} focusIds={focusIds} />
            )}
            {finished.length > 0 ? (
              <details className="shift__finished" open={showFinished || undefined} data-testid="shift-finished-todos">
                <summary>
                  {finished.length} finished todo{finished.length === 1 ? '' : 's'}
                </summary>
                <TodoTable todos={finished} owners={owners} isAdmin={isAdmin} focusIds={focusIds} />
              </details>
            ) : null}
          </>
        )}
      </section>

      <ShiftsPanel family={family} owners={owners} isAdmin={isAdmin} showFinished={showFinished} />
    </>
  );
}

function TodoTable({
  todos,
  owners,
  isAdmin,
  focusIds,
}: {
  todos: ShiftTodo[];
  owners: RepoOwners;
  isAdmin: boolean;
  focusIds: string[];
}): JSX.Element {
  return (
    <div className="shift__table-wrap">
      <table className="shift__table">
        <thead>
          <tr>
            <th scope="col">Todo</th>
            <th scope="col">Status</th>
            <th scope="col">Repos</th>
            <th scope="col">Attempts</th>
            <th scope="col">Cost</th>
            <th scope="col">Commits</th>
            {isAdmin ? <th scope="col">Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {todos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              owners={owners}
              isAdmin={isAdmin}
              initiallyOpen={focusIds.includes(todo.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
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
  owners,
  isAdmin,
  initiallyOpen,
}: {
  todo: ShiftTodo;
  owners: RepoOwners;
  isAdmin: boolean;
  initiallyOpen: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(initiallyOpen);
  const now = new Date();
  const detailId = `shift-todo-detail-${todo.id}`;
  const commits = Object.entries(todo.commits);
  const attempts = attemptSummary(todo);
  const stuck = todo.status === 'blocked' || todo.status === 'handoff';

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
          {/* Why it is stuck is the information; it does not hide behind a click. */}
          {stuck && todo.note ? (
            <p className="shift__why" data-testid={`shift-why-${todo.id}`}>
              {todo.note}
            </p>
          ) : null}
          <span className="shift__id">
            {todo.id} · P{todo.priority} · {todo.mode}
            {todo.triaged ? '' : ' · untriaged'}
          </span>
          <TodoTrace todo={todo} owners={owners} />
        </td>
        <td>
          <span className={`page__pill page__pill--${statusTone(todo.status)}`}>
            {todo.merged ? 'merged' : todo.status}
          </span>
        </td>
        <td>
          {todo.repos.length > 0 ? (
            <span className="shift__commits">
              {todo.repos.map((repo) => (
                <RepoName key={repo} owners={owners} repo={repo} />
              ))}
            </span>
          ) : (
            '—'
          )}
        </td>
        <td>
          {todo.lease_live && todo.lease_until ? `lease ${formatAgo(todo.lease_until, now)}` : null}
          {attempts ? (
            <span className={attempts.failing ? 'shift__attempts is-failing' : 'shift__attempts'}>
              {attempts.text}
            </span>
          ) : todo.lease_live ? null : (
            '0 attempts'
          )}
        </td>
        <td className="shift__cost">{formatCost(todoCost(todo))}</td>
        <td>
          {commits.length === 0 ? (
            '—'
          ) : (
            <span className="shift__commits">
              {commits.map(([repo, sha]) => {
                const href = commitHref(todo, owners, repo);
                const label = `${repo}@${shortSha(sha)}`;
                return href ? (
                  <Link key={repo} to={href} title={`${repo}@${sha}`}>
                    {label}
                  </Link>
                ) : (
                  <span key={repo} title={`${repo}@${sha}`}>
                    {label}
                  </span>
                );
              })}
            </span>
          )}
        </td>
        {isAdmin ? (
          <td>
            <TodoPrimaryAction todo={todo} />
          </td>
        ) : null}
      </tr>
      {open ? (
        <tr className="shift__detail" id={detailId}>
          <td colSpan={isAdmin ? 7 : 6}>
            <TodoDetail todo={todo} isAdmin={isAdmin} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

/** A family repo by name: a link to its code when this forge hosts it. */
function RepoName({ owners, repo }: { owners: RepoOwners; repo: string }): JSX.Element {
  const href = repoCodeHref(owners, repo);
  return href ? <Link to={href}>{repo}</Link> : <span>{repo}</span>;
}

/** Queued > Claimed > Done > PR > Merged > Released, with the PR step linked. */
function TodoTrace({ todo, owners }: { todo: ShiftTodo; owners: RepoOwners }): JSX.Element {
  const steps = todoTrace(todo);
  const prHref = todoPrHref(todo, owners);
  return (
    <ol className="shift-trace" aria-label={`Lifecycle of ${todo.id}: ${traceSummary(steps)}`}>
      {steps.map((step) => (
        <li key={step.key} className={`shift-trace__step is-${step.state}`}>
          {step.key === 'pr' && prHref ? <Link to={prHref}>{step.label}</Link> : step.label}
          {step.state === 'unknown' ? '?' : ''}
        </li>
      ))}
    </ol>
  );
}

function TodoDetail({ todo, isAdmin }: { todo: ShiftTodo; isAdmin: boolean }): JSX.Element {
  const worker = latestWorker(todo);
  return (
    <div data-testid={`shift-todo-detail-${todo.id}`}>
      <pre>{todo.body || '(no body)'}</pre>
      {todo.note ? <p><strong>Note:</strong> {todo.note}</p> : null}
      {isAdmin ? <TodoAdjust todo={todo} /> : null}
      <p className="shift__muted">
        Requested by {todo.requested_by || '—'} · worker {worker ?? '—'} · filed {todo.filed_at}
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

/** The one thing to do with this row: release what is stuck, block what should not run. */
function TodoPrimaryAction({ todo }: { todo: ShiftTodo }): JSX.Element | null {
  const action = useShiftTodoAction();
  const base = { family: todo.family, id: todo.id };
  const [blocking, setBlocking] = useState(false);
  const [note, setNote] = useState('');
  const submitBlock = (event: FormEvent): void => {
    event.preventDefault();
    action.mutate(
      { ...base, action: 'block', note: note.trim() },
      {
        onSuccess: () => {
          setBlocking(false);
          setNote('');
        },
      }
    );
  };
  const releasable =
    todo.status === 'claimed' || todo.status === 'blocked' || todo.status === 'handoff';
  if (todo.status === 'done') return null;
  return (
    <span className="shift__actions">
      {releasable ? (
        <ActionButton
          variant={todo.status === 'claimed' ? 'ghost' : 'primary'}
          disabled={action.isPending}
          onClick={() => action.mutate({ ...base, action: 'release' })}
          aria-label={`Release ${todo.id}`}
        >
          Release
        </ActionButton>
      ) : (
        <ActionButton
          variant="ghost"
          disabled={action.isPending}
          onClick={() => setBlocking((v) => !v)}
          aria-expanded={blocking}
          aria-label={`Block ${todo.id}`}
        >
          Block
        </ActionButton>
      )}
      {blocking ? (
        <form className="shift__block-form" onSubmit={submitBlock} aria-label={`Why block ${todo.id}?`}>
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why? (shown on the todo)"
            aria-label={`Reason for blocking ${todo.id}`}
          />
          <ActionButton variant="danger" type="submit" disabled={action.isPending}>
            Confirm block
          </ActionButton>
          <ActionButton variant="ghost" type="button" onClick={() => setBlocking(false)}>
            Cancel
          </ActionButton>
        </form>
      ) : null}
      {action.error ? (
        <span className="shift__error" role="alert">
          {action.error.message}
        </span>
      ) : null}
    </span>
  );
}

/** Priority and now/night: adjustments, so they live in the opened row. */
function TodoAdjust({ todo }: { todo: ShiftTodo }): JSX.Element | null {
  const action = useShiftTodoAction();
  const base = { family: todo.family, id: todo.id };
  if (todo.status === 'done') return null;
  const otherMode = todo.mode === 'now' ? 'night' : 'now';
  return (
    <p className="shift__actions">
      <label>
        Priority{' '}
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
      </label>
      <ActionButton
        variant="ghost"
        disabled={action.isPending}
        onClick={() => action.mutate({ ...base, action: 'mode', value: otherMode })}
        aria-label={`Move ${todo.id} to ${otherMode}`}
      >
        Move to {otherMode}
      </ActionButton>
      {action.error ? (
        <span className="shift__error" role="alert">
          {action.error.message}
        </span>
      ) : null}
    </p>
  );
}

function ShiftsPanel({
  family,
  owners,
  isAdmin,
  showFinished,
}: {
  family: ShiftFamily;
  owners: RepoOwners;
  isAdmin: boolean;
  showFinished: boolean;
}): JSX.Element {
  const shifts = useShiftShifts(family.name);
  const { live, finished } = useMemo(
    () => splitShifts(sortShifts(shifts.data?.shifts ?? [])),
    [shifts.data]
  );
  const now = new Date();
  const cards = (list: ShiftBranch[]): JSX.Element => (
    <ul className="shift-branches">
      {list.map((shift) => (
        <ShiftCard
          key={shift.branch}
          shift={shift}
          family={family.name}
          owners={owners}
          isAdmin={isAdmin}
          lastNight={isLastNight(shift, now, family.shift_tz)}
        />
      ))}
    </ul>
  );
  return (
    <section className="shift__section" aria-label="Shifts">
      <h2 className="page__section-title">Shifts in review · {live.length}</h2>
      {shifts.isPending ? (
        <LoadingState title="Loading shifts…" variant="message" />
      ) : shifts.isError ? (
        <ShiftError title="Could not load shift branches." error={shifts.error} />
      ) : live.length + finished.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No shift branches yet."
          description="A branch is cut from main when the first todo of a shift lands."
        />
      ) : (
        <>
          {live.length === 0 ? (
            <p className="shift__muted">Every shift's work has reached the base branch.</p>
          ) : (
            cards(live)
          )}
          {finished.length > 0 ? (
            <details className="shift__finished" open={showFinished || undefined} data-testid="shift-finished-shifts">
              <summary>
                {finished.length} finished shift{finished.length === 1 ? '' : 's'}
              </summary>
              {cards(finished)}
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function ShiftCard({
  shift,
  family,
  owners,
  isAdmin,
  lastNight,
}: {
  shift: ShiftBranch;
  family: string;
  owners: RepoOwners;
  isAdmin: boolean;
  lastNight: boolean;
}): JSX.Element {
  const openPr = useOpenShiftPr();
  // Only when a review PR would carry something: a branch level with its base,
  // or one whose work already reached it, has nothing to review.
  const offerPr = canOpenReviewPr(shift);
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
            <RepoName owners={owners} repo={repo.repo} />
            {repo.unmerged_todos && repo.unmerged_todos.length > 0
              ? ` · ${repo.unmerged_todos.length} todo${repo.unmerged_todos.length === 1 ? '' : 's'} not on the base branch`
              : ''}
            {repo.pr ? (
              <>
                {' · '}
                <PrLink url={repo.pr.url}>
                  PR #{repo.pr.number} ({repo.pr.state})
                </PrLink>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {isAdmin && offerPr ? (
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
              <PrLink url={pr.url}>
                {pr.repo}#{pr.number}
              </PrLink>{' '}
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

/** A pull request url from the server: an app path navigates in place, anything else is a plain link. */
function PrLink({ url, children }: { url: string; children: ReactNode }): JSX.Element {
  return url.startsWith('/') && !url.startsWith('//') ? (
    <Link to={url}>{children}</Link>
  ) : (
    <a href={url}>{children}</a>
  );
}
