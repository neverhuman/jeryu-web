// ShiftQueuePage.tsx — Work (`/work`): one page for the todoq shift queue.
//
// Top to bottom, in the order the work flows: add work (a one-row composer that
// opens to the full form), who is working (one line that opens to the workers
// panel), then the queue of EVERY family: live todos first, what needs a human
// on top, finished todos and finished shifts folded away. Each row wears its
// family at the far left; the pill filters the whole page to that family
// (`?family=`), and pressing it again, or All, shows every family. A row expands
// to the body, note and attempt history. Admins get release / block / priority /
// now-night row actions and "Open review PR" on each shift.

import { GitBranch, Inbox } from 'lucide-react';
import { Fragment, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import type { ShiftBranch, ShiftFamily, ShiftTodo } from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { FamilyPill, FamilyStrip } from '../../components/family/FamilyPills';
import { EmptyState, LoadingState } from '../../components/state';
import { useAuth } from '../../hooks/useAuth';
import {
  useOpenShiftPr,
  useShiftFamilies,
  useShiftShiftsByFamily,
  useShiftTodoAction,
  useShiftTodos,
} from '../../hooks/useShift';
import { ShiftError } from './shiftCommon';
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
  isLongNote,
  latestWorker,
  repoOwners,
  repoCodeHref,
  splitFinished,
  splitShifts,
  canOpenReviewPr,
  type RepoOwners,
  queueOptions,
  shortSha,
  slotLabel,
  sortShifts,
  statusTone,
  todoPrHref,
  todoTrace,
  traceSummary,
  type QueueFilters,
} from './shiftModel';
import { WorkComposer } from './WorkComposer';
import { WorkersStrip } from './WorkersStrip';
import { groupLive, liveFamilyCounts, todoFamily, todosOfFamily } from './workPageModel';

import '../page.css';
import './Shift.css';

type OwnersFor = (family: string) => RepoOwners;

const NO_OWNER: RepoOwners = () => null;

export function ShiftQueuePage(): JSX.Element {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const families = useShiftFamilies();
  const list = useMemo(() => families.data?.families ?? [], [families.data]);
  const [params, setParams] = useSearchParams();
  // `?family=` filters the whole page; anything that is not a family means all.
  const wanted = params.get('family') ?? '';
  const family = list.some((f) => f.name === wanted) ? wanted : '';
  const setFamily = (name: string): void => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (name && name !== family) next.set('family', name);
        else next.delete('family');
        next.delete('todo');
        return next;
      },
      { replace: true }
    );
  };
  const onFiled = (filedFamily: string, todos: ShiftTodo[]): void => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        // Keep a family filter pointed at where the new todos went.
        if (family && family !== filedFamily) next.set('family', filedFamily);
        next.set('todo', todos.map((todo) => todo.id).join(','));
        return next;
      },
      { replace: true }
    );
  };
  const todos = useShiftTodos(undefined);
  const all = useMemo(() => todos.data?.todos ?? [], [todos.data]);

  return (
    <div className="page page--wide" data-testid="shift-queue-page">
      <header className="page__header">
        <h1 className="page__title">Work</h1>
        <p className="page__subtitle">
          Add work, see who is working, and follow every family&apos;s queue to main.
        </p>
      </header>

      {families.isPending ? (
        <LoadingState title="Loading shift families…" variant="message" />
      ) : families.isError ? (
        <ShiftError title="Could not load shift families." error={families.error} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No shift queues yet."
          description="A family appears here once its <family>-todo repo has a queue branch with a family.toml."
        />
      ) : (
        <>
          <WorkComposer families={list} family={family} isAdmin={isAdmin} onFiled={onFiled} />
          <WorkersStrip todos={all} />
          <FamilyQueue
            families={list}
            family={family}
            onFamily={setFamily}
            todos={todos}
            all={all}
            isAdmin={isAdmin}
          />
        </>
      )}
    </div>
  );
}

function FamilyQueue({
  families,
  family,
  onFamily,
  todos,
  all,
  isAdmin,
}: {
  families: ShiftFamily[];
  /** The family filter; '' shows every family. */
  family: string;
  onFamily: (name: string) => void;
  todos: ReturnType<typeof useShiftTodos>;
  all: ShiftTodo[];
  isAdmin: boolean;
}): JSX.Element {
  const [params, setParams] = useSearchParams();
  const focusIds = useMemo(
    () => (params.get('todo') ?? '').split(',').filter(Boolean),
    [params]
  );
  const [localFilters, setFilters] = useState<QueueFilters>(DEFAULT_QUEUE_FILTERS);
  // `?repo=` is the repository filter, so other pages can link to one repo's work.
  const repo = params.get('repo') || 'all';
  const filters = useMemo(() => ({ ...localFilters, repo }), [localFilters, repo]);
  const scoped = useMemo(() => todosOfFamily(all, family), [all, family]);
  const counts = useMemo(() => liveFamilyCounts(all), [all]);
  const options = useMemo(() => {
    const found = queueOptions(scoped);
    // A linked repo with nothing queued still shows as the filter in use.
    return repo === 'all' || found.repos.includes(repo)
      ? found
      : { ...found, repos: [...found.repos, repo].sort() };
  }, [scoped, repo]);
  const filtered = useMemo(() => {
    const shown = filterShiftTodos(scoped, filters);
    return focusIds.length > 0 ? shown.filter((t) => focusIds.includes(t.id)) : shown;
  }, [scoped, filters, focusIds]);
  const ownersFor = useMemo<OwnersFor>(() => {
    const byFamily = new Map(families.map((f) => [f.name, repoOwners(f)]));
    return (name) => byFamily.get(name) ?? NO_OWNER;
  }, [families]);
  const waiting = useMemo(() => countNeedsHuman(scoped), [scoped]);
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
  const inScope = family ? families.filter((f) => f.name === family) : families;

  const set = (key: keyof QueueFilters) => (value: string) => {
    if (key !== 'repo') {
      setFilters((current) => ({ ...current, [key]: value }));
      return;
    }
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === 'all') next.delete('repo');
        else next.set('repo', value);
        return next;
      },
      { replace: true }
    );
  };
  const tableProps = { ownersFor, isAdmin, focusIds, picked: family, onPick: onFamily };

  return (
    <>
      <section className="shift__section" aria-label="Queue">
        {families.length > 1 || family ? (
          <FamilyStrip counts={counts} family={family} onPick={onFamily} />
        ) : null}
        <div className="shift__toolbar" role="group" aria-label="Queue filters">
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
            <Link
              to={family ? `?family=${encodeURIComponent(family)}` : '?'}
              className="shift__muted"
            >
              Showing {focusIds.length} filed todo{focusIds.length === 1 ? '' : 's'} · show all
            </Link>
          ) : null}
        </div>

        {asked ? <h2 className="page__section-title">Todos · {live.length}</h2> : null}
        {todos.isPending ? (
          <LoadingState title="Loading todos…" variant="message" />
        ) : todos.isError ? (
          <ShiftError title="Could not load the queue." error={todos.error} />
        ) : scoped.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={family ? `The ${family} queue is empty.` : 'The queue is empty.'}
            description="File a todo with the box at the top of this page, or with todoq add."
          />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Inbox} title="No todos match the current filters." />
        ) : (
          <>
            {live.length === 0 ? (
              <p className="shift__muted" data-testid="shift-nothing-live">
                Nothing is queued, being worked or waiting on anyone.
              </p>
            ) : asked ? (
              <TodoTable todos={live} {...tableProps} />
            ) : (
              // Queued is not in progress: each stands under its own heading.
              groupLive(live).map((group) => (
                <Fragment key={group.key}>
                  <h2 className="page__section-title" data-testid={`shift-live-${group.key}`}>
                    {group.title} · {group.todos.length}
                  </h2>
                  <TodoTable todos={group.todos} {...tableProps} />
                </Fragment>
              ))
            )}
            {finished.length > 0 ? (
              <details className="shift__finished" open={showFinished || undefined} data-testid="shift-finished-todos">
                <summary>
                  {finished.length} finished todo{finished.length === 1 ? '' : 's'}
                </summary>
                <TodoTable todos={finished} {...tableProps} />
              </details>
            ) : null}
          </>
        )}
      </section>

      <ShiftsPanel
        families={inScope}
        ownersFor={ownersFor}
        isAdmin={isAdmin}
        showFinished={showFinished}
        picked={family}
        onPick={onFamily}
      />
    </>
  );
}

interface RowFamilyProps {
  ownersFor: OwnersFor;
  picked: string;
  onPick: (family: string) => void;
}

function TodoTable({
  todos,
  ownersFor,
  isAdmin,
  focusIds,
  picked,
  onPick,
}: {
  todos: ShiftTodo[];
  isAdmin: boolean;
  focusIds: string[];
} & RowFamilyProps): JSX.Element {
  // Todos carry commits only once they land: a column of dashes says nothing.
  const showCommits = todos.some((todo) => Object.keys(todo.commits).length > 0);
  return (
    <div className="shift__table-wrap">
      <table className="shift__table">
        <thead>
          <tr>
            <th scope="col">Family</th>
            <th scope="col">Todo</th>
            <th scope="col">Status</th>
            <th scope="col">Repos</th>
            <th scope="col">Attempts</th>
            <th scope="col">Cost</th>
            {showCommits ? <th scope="col">Commits</th> : null}
            {isAdmin ? <th scope="col">Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {todos.map((todo) => (
            <TodoRow
              key={`${todo.family}/${todo.id}`}
              todo={todo}
              owners={ownersFor(todo.family)}
              isAdmin={isAdmin}
              initiallyOpen={focusIds.includes(todo.id)}
              showCommits={showCommits}
              picked={picked}
              onPick={onPick}
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
  showCommits,
  picked,
  onPick,
}: {
  todo: ShiftTodo;
  owners: RepoOwners;
  isAdmin: boolean;
  initiallyOpen: boolean;
  showCommits: boolean;
  picked: string;
  onPick: (family: string) => void;
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
        <td className="shift__family-cell">
          <FamilyPill family={todoFamily(todo)} picked={picked} onPick={onPick} />
        </td>
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
          {stuck && todo.note ? <WhyStuck id={todo.id} note={todo.note} /> : null}
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
        {showCommits ? (
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
        ) : null}
        {isAdmin ? (
          <td>
            <TodoPrimaryAction todo={todo} />
          </td>
        ) : null}
      </tr>
      {open ? (
        <tr className="shift__detail" id={detailId}>
          <td colSpan={6 + (showCommits ? 1 : 0) + (isAdmin ? 1 : 0)}>
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

/**
 * Why a todo is stuck, inline. A worker's note can run to twenty lines, which
 * pushed every other row off the screen: four lines show, the rest unfolds.
 */
function WhyStuck({ id, note }: { id: string; note: string }): JSX.Element {
  const [full, setFull] = useState(false);
  const long = isLongNote(note);
  const noteId = `shift-why-text-${id}`;
  return (
    <div className="shift__why-wrap">
      <p
        id={noteId}
        className={`shift__why${long && !full ? ' shift__why--clamped' : ''}`}
        data-testid={`shift-why-${id}`}
      >
        {note}
      </p>
      {long ? (
        <button
          type="button"
          className="shift__why-toggle"
          aria-expanded={full}
          aria-controls={noteId}
          onClick={() => setFull((v) => !v)}
        >
          {full ? 'Show less' : 'Show full note'}
        </button>
      ) : null}
    </div>
  );
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
          // Outlined, never filled: the page's one filled action is "Open review PR".
          variant={todo.status === 'claimed' ? 'ghost' : 'default'}
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
  families,
  ownersFor,
  isAdmin,
  showFinished,
  picked,
  onPick,
}: {
  /** The families on the page: one when filtered, else every family. */
  families: ShiftFamily[];
  isAdmin: boolean;
  showFinished: boolean;
} & RowFamilyProps): JSX.Element {
  const names = useMemo(() => families.map((f) => f.name), [families]);
  const shifts = useShiftShiftsByFamily(names);
  const { live, finished } = useMemo(() => {
    // A branch carries no family, and families share branch names: split each
    // family's branches on their own, then list them together, newest first.
    const tagged = shifts.data.map((entry) => {
      const split = splitShifts(sortShifts(entry.shifts));
      const tag = (shift: ShiftBranch): FamilyShift => ({ family: entry.family, shift });
      return { live: split.live.map(tag), finished: split.finished.map(tag) };
    });
    const newestFirst = (a: FamilyShift, b: FamilyShift): number =>
      b.shift.date.localeCompare(a.shift.date) ||
      a.family.localeCompare(b.family) ||
      a.shift.branch.localeCompare(b.shift.branch);
    return {
      live: tagged.flatMap((t) => t.live).sort(newestFirst),
      finished: tagged.flatMap((t) => t.finished).sort(newestFirst),
    };
  }, [shifts.data]);
  const now = new Date();
  const tzOf = (name: string): string =>
    families.find((f) => f.name === name)?.shift_tz ?? 'UTC';
  const cards = (list: FamilyShift[]): JSX.Element => (
    <ul className="shift-branches">
      {list.map(({ family, shift }) => (
        <ShiftCard
          key={`${family}:${shift.branch}`}
          shift={shift}
          family={family}
          owners={ownersFor(family)}
          isAdmin={isAdmin}
          lastNight={isLastNight(shift, now, tzOf(family))}
          picked={picked}
          onPick={onPick}
        />
      ))}
    </ul>
  );
  return (
    <section className="shift__section" aria-label="Shifts">
      <h2 className="page__section-title">Shifts in review · {live.length}</h2>
      {shifts.isPending && shifts.data.length === 0 ? (
        <LoadingState title="Loading shifts…" variant="message" />
      ) : shifts.error && shifts.data.length === 0 ? (
        <ShiftError title="Could not load shift branches." error={shifts.error} />
      ) : live.length + finished.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No shift branches yet."
          description="A branch is cut from main when the first todo of a shift lands."
        />
      ) : (
        <>
          {shifts.error ? (
            <p className="shift__muted" role="status">
              One family&apos;s shift branches could not be loaded: {shifts.error.message}
            </p>
          ) : null}
          {live.length === 0 ? (
            <p className="shift__muted">Every shift&apos;s work has reached the base branch.</p>
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

interface FamilyShift {
  family: string;
  shift: ShiftBranch;
}

function ShiftCard({
  shift,
  family,
  owners,
  isAdmin,
  lastNight,
  picked,
  onPick,
}: {
  shift: ShiftBranch;
  family: string;
  owners: RepoOwners;
  isAdmin: boolean;
  lastNight: boolean;
  picked: string;
  onPick: (family: string) => void;
}): JSX.Element {
  const openPr = useOpenShiftPr();
  // Only when a review PR would carry something: a branch level with its base,
  // or one whose work already reached it, has nothing to review.
  const offerPr = canOpenReviewPr(shift);
  return (
    <li
      className={`shift-branch${lastNight ? ' is-last-night' : ''}`}
      data-testid={`shift-branch-${shift.branch}`}
      aria-label={`${family} ${shift.branch}${lastNight ? ' (last night)' : ''}`}
    >
      <span>
        <FamilyPill family={family} picked={picked} onPick={onPick} />{' '}
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
