// ShiftQueuePage.tsx — Work (`/work`): one page for the todoq shift queue.
//
// Top to bottom, in the order the work flows: add work (a one-row composer that
// opens to the full form), who is working (one line that opens to the workers
// panel), then the queue of EVERY family: live todos first, what needs a human
// on top, finished todos and finished shifts folded away. Each row wears its
// family at the far left; the pill filters the whole page to that family
// (`?family=`), and pressing it again, or All, shows every family. A row expands
// to the body, note and attempt history; its id opens the todo's own page.
// Admins get release / block / priority / now-night row actions and "Open review
// PR" on each shift. What waits on a person is the Work share of Needs you —
// the same strip every other page shows, plus a red count of it labelled "in
// Work" — never a second answer computed from the queue's own rows.

import { GitBranch, Inbox } from 'lucide-react';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import type { ShiftBranch, ShiftFamily, ShiftTodo } from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { relativeText } from '../../format/when';
import { FamilyPill, FamilyStrip } from '../../components/family/FamilyPills';
import { EmptyState, LoadingState } from '../../components/state';
import { useAuth } from '../../hooks/useAuth';
import { useForgeHost } from '../../hooks/useForgeHost';
import {
  useOpenShiftPr,
  useShiftFamilies,
  useShiftShiftsByFamily,
  useShiftTodos,
} from '../../hooks/useShift';
import { ShiftError } from './shiftCommon';
import { canonicalFamily, sameFamily } from '../../components/family/familyScope';
import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { ScopedEmptyState } from '../../components/family/ScopedEmptyState';
import {
  DEFAULT_QUEUE_FILTERS,
  SHIFT_MODES,
  SHIFT_STATUSES,
  attemptSummary,
  commitHref,
  filterShiftTodos,
  formatCost,
  todoCost,
  isLastNight,
  repoRefs,
  splitFinished,
  splitShifts,
  canOpenReviewPr,
  type RepoRefs,
  queueOptions,
  shortSha,
  sortShifts,
  statusTone,
  unmergedTodosNote,
  type QueueFilters,
} from './shiftModel';
import { RepoName, TodoActions, TodoDetail, TodoTrace, WhyStuck } from './todoParts';
import { WorkComposer } from './WorkComposer';
import { todoHref } from './workPaths';
import { WorkersStrip } from './WorkersStrip';
import { NeedsYouHere } from '../needsYou/NeedsYouHere';
import { AREA_LABEL } from '../needsYou/needsYouModel';
import { useNeedsYou } from '../needsYou/useNeedsYou';
import { groupLive, liveFamilyCounts, todoFamily, todosOfFamily } from './workPageModel';
import { usePageTitle } from '../../hooks/usePageTitle';

import '../page.css';
import './Shift.css';

type RefsFor = (family: string) => RepoRefs;

const NO_REFS: RepoRefs = () => null;

export function ShiftQueuePage(): JSX.Element {
  usePageTitle('Work');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const families = useShiftFamilies();
  const list = useMemo(() => families.data?.families ?? [], [families.data]);
  const [params, setParams] = useSearchParams();
  // The shell's family scope filters the whole page, and is stated here as
  // `?family=`; a scope on a family this queue does not know means all.
  const scope = useFamilyScope();
  // `acme` and `acme-split` are one family: the queue it names, when this
  // queue knows it at all, and the one key the rows and counts are filed under.
  const queue = list.find((f) => sameFamily(f.name, scope.family));
  const family = queue ? canonicalFamily(queue.name) : '';
  // A family filter is about the whole queue, so the filed-todo focus goes.
  const setFamily = (name: string): void => {
    scope.setFamily(name === family ? '' : name, { drop: ['todo'] });
  };
  const onFiled = (filedFamily: string, todos: ShiftTodo[]): void => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        // Keep a family filter pointed at where the new todos went.
        if (family && !sameFamily(family, filedFamily)) next.set('family', filedFamily);
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

      {/* The rows themselves, as every other page shows them, rather than a
          sentence of this page's own about how many wait. Above the queue's own
          state, so a queue that cannot be read still says what waits on you. */}
      <NeedsYouHere area="work" family={family} onFamily={setFamily} />

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
          {/* The composer files into a queue, so it wants the queue's own
              name; everything else reads the one canonical key. */}
          <WorkComposer
            families={list}
            family={queue?.name ?? ''}
            isAdmin={isAdmin}
            onFiled={onFiled}
          />
          <WorkersStrip todos={all} family={family} />
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
  const forgeHost = useForgeHost();
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
  const refsFor = useMemo<RefsFor>(() => {
    const byFamily = new Map(families.map((f) => [f.name, repoRefs(f, forgeHost(f.queue_repo))]));
    return (name) => byFamily.get(name) ?? NO_REFS;
  }, [families, forgeHost]);
  // What waits on a person is Needs you's answer, not a second one computed
  // here: this is the Work share of that list, counted and listed by the same
  // derivation the nav badge and the strip below use.
  const needsYou = useNeedsYou(family, 'work');
  const waiting = needsYou.count ?? 0;
  // What is live or waits on someone is the page; what is finished folds away.
  // A todo someone asked for by id, or a status filter, is shown as asked.
  const asked = focusIds.length > 0 || filters.status !== 'all';
  const { live, finished } = useMemo(
    () => (asked ? { live: filtered, finished: [] } : splitFinished(filtered)),
    [asked, filtered]
  );
  const showFinished = params.get('finished') === '1';
  const filtersInUse = Object.values(filters).some((value) => value !== 'all');
  const inScope = family ? families.filter((f) => sameFamily(f.name, family)) : families;

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
  const tableProps = { refsFor, isAdmin, focusIds, picked: family, onPick: onFamily };

  return (
    <>
      <section className="shift__section" aria-label="Queue">
        {families.length > 1 || family ? (
          <FamilyStrip counts={counts} family={family} onPick={onFamily} />
        ) : null}
        <div className="shift__toolbar" role="group" aria-label="Queue filters">
          {waiting > 0 ? (
            <Link
              className="shift__needs-human"
              to={needsYou.href}
              data-testid="shift-needs-human"
            >
              <span className="page__pill page__pill--danger">{waiting}</span> in{' '}
              {AREA_LABEL.work} · open Needs you
            </Link>
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
            <Link to={withoutFocus(params)} className="shift__muted">
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
          <ScopedEmptyState
            icon={Inbox}
            title="The queue is empty."
            description="File a todo with the box at the top of this page, or with todoq add."
          />
        ) : filtered.length === 0 ? (
          <ScopedEmptyState icon={Inbox} title="No todos match the current filters." />
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
        refsFor={refsFor}
        isAdmin={isAdmin}
        showFinished={showFinished}
        picked={family}
        onPick={onFamily}
      />
    </>
  );
}

/**
 * The queue without the filed-todo focus, and with everything else the address
 * says — the family among it, so "show all" is about the todos and not the
 * family scope.
 */
function withoutFocus(params: URLSearchParams): string {
  const next = new URLSearchParams(params);
  next.delete('todo');
  const query = next.toString();
  return query ? `?${query}` : '?';
}

interface RowFamilyProps {
  refsFor: RefsFor;
  picked: string;
  onPick: (family: string) => void;
}

function TodoTable({
  todos,
  refsFor,
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
    <div className="table-scroll">
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
              refs={refsFor(todo.family)}
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
  refs,
  isAdmin,
  initiallyOpen,
  showCommits,
  picked,
  onPick,
}: {
  todo: ShiftTodo;
  refs: RepoRefs;
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
            <Link to={todoHref(todo.id)} title="Open this todo's page">
              {todo.id}
            </Link>{' '}
            · P{todo.priority} · {todo.mode}
            {todo.triaged ? '' : ' · untriaged'}
          </span>
          <TodoTrace todo={todo} refs={refs} />
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
                <RepoName key={repo} refs={refs} repo={repo} />
              ))}
            </span>
          ) : (
            '—'
          )}
        </td>
        <td>
          {todo.lease_live && todo.lease_until ? `lease ${relativeText(todo.lease_until, now)}` : null}
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
                  const href = commitHref(todo, refs, repo);
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
            <TodoActions todo={todo} />
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

function ShiftsPanel({
  families,
  refsFor,
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
          refs={refsFor(family)}
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
  refs,
  isAdmin,
  lastNight,
  picked,
  onPick,
}: {
  shift: ShiftBranch;
  family: string;
  refs: RepoRefs;
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
          <ShiftCardRepo key={repo.repo} refs={refs} repo={repo} />
        ))}
      </ul>
      {isAdmin && offerPr ? (
        <span className="shift__actions">
          <ActionButton
            variant="primary"
            disabled={openPr.isPending}
            onClick={() => openPr.mutate({ family, branch: shift.branch })}
            aria-label={`Open review pull request for ${shift.branch}`}
          >
            {openPr.isPending ? 'Opening…' : 'Open review pull request'}
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

/** One repository of a shift: its name, what is not on the base branch yet, its pull request. */
function ShiftCardRepo({ refs, repo }: { refs: RepoRefs; repo: ShiftBranch['repos'][number] }): JSX.Element {
  const note = unmergedTodosNote(repo);
  return (
    <li>
      <RepoName refs={refs} repo={repo.repo} />
      {note ? ` · ${note}` : ''}
      {repo.pr ? (
        <>
          {' · '}
          <PrLink url={repo.pr.url}>
            Pull request #{repo.pr.number} ({repo.pr.state})
          </PrLink>
        </>
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
