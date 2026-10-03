// TodoPage.tsx — one todo's own page (`/work/<id>`).
//
// Needs you, Activity, the workers line and a queue row's id all land here, so a
// todo has one address to share. It is the queue row opened up: title, family,
// status, why it is stuck, the work trace, what waits on you here, repos,
// commits, then the body,
// note and every attempt, with the admin actions beside them. Ids are unique
// across families; the family scope (`?family=`) only settles the rare id two
// families share, and the pill carries this todo's family to Work.

import { Inbox } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { ShiftTodo } from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { relativeText } from '../../format/when';
import { Breadcrumbs } from '../../components/browser/Breadcrumbs';
import { FamilyPill } from '../../components/family/FamilyPills';
import { sameFamily } from '../../components/family/familyScope';
import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { EmptyState, LoadingState } from '../../components/state';
import { useAuth } from '../../hooks/useAuth';
import { useForgeHost } from '../../hooks/useForgeHost';
import { useShiftFamilies, useShiftTodos } from '../../hooks/useShift';
import { NeedsYouAbout } from '../needsYou';
import { ShiftError } from './shiftCommon';
import {
  attemptSummary,
  commitHref,
  formatCost,
  repoRefs,
  shortSha,
  statusTone,
  todoCost,
  todoPrHref,
  type RepoRefs,
} from './shiftModel';
import { RepoName, TodoActions, TodoDetail, WhyStuck } from './todoParts';
import { WorkTrace } from './WorkTrace';
import { todoFacts, workTrace } from './workTraceModel';
import { WORK_PATH, queueHref, todoHref } from './workPaths';
import { todoFamily } from './workPageModel';
import { usePageTitle } from '../../hooks/usePageTitle';

import '../page.css';
import './Shift.css';

const NO_REFS: RepoRefs = () => null;

export function TodoPage(): JSX.Element {
  const { key = '' } = useParams();
  usePageTitle(key || 'Work');
  const scope = useFamilyScope();
  const family = scope.family;
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  // Every family's todos, the same request Work makes: going back is instant.
  const todos = useShiftTodos(undefined);
  const families = useShiftFamilies();
  const forgeHost = useForgeHost();
  const matches = useMemo(
    () =>
      (todos.data?.todos ?? []).filter(
        (todo) => todo.id === key && (!family || sameFamily(todo.family, family))
      ),
    [todos.data, key, family]
  );
  const refs = useMemo<RepoRefs>(() => {
    const found = families.data?.families.find((f) => f.name === matches[0]?.family);
    return found ? repoRefs(found, forgeHost(found.queue_repo)) : NO_REFS;
  }, [families.data, matches, forgeHost]);

  let body: JSX.Element;
  if (todos.isPending) {
    body = <LoadingState title="Loading the todo…" variant="message" />;
  } else if (todos.isError) {
    body = <ShiftError title="Could not load the queue." error={todos.error} />;
  } else if (matches.length === 0) {
    body = (
      <EmptyState
        icon={Inbox}
        title={`No todo ${key}${family ? ` in ${family}` : ''}.`}
        description="It may have been filed under another id, or its family's queue is not on this forge."
        action={
          <Link to={queueHref(family)}>
            <ActionButton variant="primary">Back to Work</ActionButton>
          </Link>
        }
      />
    );
  } else if (matches.length > 1) {
    body = (
      <div data-testid="todo-page-ambiguous">
        <p>Two families have a todo {key}. Pick one:</p>
        <ul>
          {matches.map((todo) => (
            <li key={todo.family}>
              <Link to={todoHref(todo.id, todo.family)}>
                {todo.family}: {todo.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  } else {
    body = <TodoView todo={matches[0]} refs={refs} isAdmin={isAdmin} />;
  }

  const shown = matches.length === 1 ? matches[0] : null;
  return (
    <div className="page page--wide" data-testid="todo-page">
      <Breadcrumbs
        segments={[
          { label: 'Work', to: WORK_PATH },
          ...(shown ? [{ label: shown.family, to: queueHref(shown.family) }] : []),
          { label: key },
        ]}
      />
      {body}
    </div>
  );
}

function TodoView({
  todo,
  refs,
  isAdmin,
}: {
  todo: ShiftTodo;
  refs: RepoRefs;
  isAdmin: boolean;
}): JSX.Element {
  const scope = useFamilyScope();
  const now = new Date();
  const stuck = todo.status === 'blocked' || todo.status === 'handoff';
  const attempts = attemptSummary(todo);
  const prHref = todoPrHref(todo, refs);
  const commits = Object.entries(todo.commits);
  return (
    <>
      <header className="page__header">
        <h1 className="page__title">{todo.title}</h1>
        <p className="page__subtitle shift-todo-page__meta">
          {/* The pill is this todo's family: pressing it takes the scope with
              it to the queue, so Work opens on the family just read. */}
          <FamilyPill
            family={todoFamily(todo)}
            picked={scope.family}
            onPick={(name) => scope.setFamily(name, { to: WORK_PATH, drop: ['todo'] })}
          />
          <span
            className={`page__pill page__pill--${statusTone(todo.status)}`}
            data-testid="todo-page-status"
          >
            {todo.merged ? 'merged' : todo.status}
          </span>
          <span className="shift__id shift-todo-page__id">
            {todo.id} · P{todo.priority} · {todo.mode}
            {todo.triaged ? '' : ' · untriaged'}
          </span>
        </p>
      </header>

      {stuck && todo.note ? <WhyStuck id={todo.id} note={todo.note} /> : null}
      <WorkTrace
        stages={workTrace(todoFacts(todo))}
        subject={todo.id}
        hrefs={prHref ? { pr: prHref } : {}}
      />
      <NeedsYouAbout subject={{ todoId: todo.id }} />
      {isAdmin ? (
        <p className="shift__actions">
          <TodoActions todo={todo} />
        </p>
      ) : null}

      <dl className="shift-todo-page__facts" aria-label="Facts">
        <dt>Repos</dt>
        <dd className="shift__commits">
          {todo.repos.length > 0
            ? todo.repos.map((repo) => <RepoName key={repo} refs={refs} repo={repo} />)
            : '—'}
        </dd>
        <dt>Attempts</dt>
        <dd>
          {todo.lease_live && todo.lease_until ? `lease ${relativeText(todo.lease_until, now)} · ` : ''}
          {attempts ? attempts.text : '0 attempts'}
        </dd>
        <dt>Cost</dt>
        <dd>{formatCost(todoCost(todo))}</dd>
        {commits.length > 0 ? (
          <>
            <dt>Commits</dt>
            <dd className="shift__commits">
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
            </dd>
          </>
        ) : null}
      </dl>

      <section className="shift__section shift__detail" aria-label="Details">
        <TodoDetail todo={todo} isAdmin={isAdmin} showNote={!stuck} />
      </section>
    </>
  );
}
