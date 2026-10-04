// PullRequestWork.tsx — the Work section of the PR page: where this change
// stands, which todos it carries, and what waits on a person here.
//
// A shift PR is the review end of the queue: one commit per todo, each with a
// `Todo:` trailer. The rail is the same twelve-stage work trace a todo's own
// page shows, from the same model, so the two pages never disagree about the
// same change; the carried todos link back to their pages.

import { Workflow } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import type { PullRequestSummary, ShiftTodo } from '../api/types';
import { queueEntryFor } from '../components/merge/mergeQueueModel';
import { useRepoMergeQueue } from '../hooks/useMergeQueue';
import { useShiftTodos } from '../hooks/useShift';
import { NeedsYouAbout } from './needsYou';
import { carriedTodoIds, type PullCommit } from './pullCommitsModel';
import { WorkTrace } from './shift/WorkTrace';
import { todoHref } from './shift/workPaths';
import { pullFacts, workTrace } from './shift/workTraceModel';

import './page.css';
import './shift/Shift.css';

export interface PullRequestWorkProps {
  summary: PullRequestSummary;
  commits: PullCommit[] | undefined;
  repoId: string | null;
  repoFullName: string;
  prNumber: string | null;
}

export function PullRequestWork({
  summary,
  commits,
  repoId,
  repoFullName,
  prNumber,
}: PullRequestWorkProps): JSX.Element {
  const ids = useMemo(() => carriedTodoIds(commits), [commits]);
  // The whole queue, the same request Work makes; a forge without one answers
  // an error and the ids below stand on their own.
  const todos = useShiftTodos(undefined);
  const carried = useMemo<ShiftTodo[]>(() => {
    const byId = new Map((todos.data?.todos ?? []).map((todo) => [todo.id, todo]));
    return ids.map((id) => byId.get(id)).filter((todo): todo is ShiftTodo => Boolean(todo));
  }, [ids, todos.data]);

  const queue = useRepoMergeQueue(repoId, summary.state === 'open');
  const entry = queueEntryFor(queue.data, prNumber);
  const stages = workTrace(
    pullFacts({
      state: summary.state,
      draft: summary.draft,
      checks: summary.checks,
      review: summary.review,
      inQueue: Boolean(entry),
      queueFailed: entry?.state === 'failed' || entry?.state === 'dequeued',
      carries: carried,
    })
  );
  const subject = `${repoFullName}#${summary.number}`;

  return (
    <section className="pr-work" data-testid="pr-work" aria-label="Work">
      <h2 className="pr-commits__title">
        <Workflow aria-hidden="true" size={14} />
        Work
      </h2>
      <WorkTrace stages={stages} subject={subject} testId="pr-work-trace" />
      {ids.length === 0 ? (
        <p className="pr-work__empty" data-testid="pr-work-empty">
          No commit on this pull request names a todo.
        </p>
      ) : (
        <ul className="pr-work__carries" data-testid="pr-work-carries">
          {ids.map((id) => {
            const todo = carried.find((candidate) => candidate.id === id);
            return (
              <li className="pr-work__carry" key={id} data-testid={`pr-work-carry-${id}`}>
                carries todo <Link to={todoHref(id, todo?.family ?? '')}>{id}</Link>
                {todo ? ` — ${todo.title}` : ''}
              </li>
            );
          })}
        </ul>
      )}
      <NeedsYouAbout
        subject={{ repo: repoFullName, pr: summary.number }}
        testId="needs-you-about-pr"
      />
    </section>
  );
}
