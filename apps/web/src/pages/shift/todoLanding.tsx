import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { ShiftTodo, ShiftTodoLanding } from '../../api/types';
import type { PullRequestCheck } from '../../api/types/pullRequests';
import { useCommitCheckRuns } from '../../hooks/useCommitCheckRuns';
import { checkPageUrl } from '../../components/merge/ChecksPanel';
import { repoUrl } from '../repoBrowserModel';
import type { RepoRefs } from './shiftModel';
import { shortSha, todoPrHref } from './shiftModel';

/** The pull this row may link, with the number and the path taken from the same pull. */
function landingPull(
  entry: ShiftTodoLanding,
  refs: RepoRefs,
  todo: ShiftTodo,
): { number: number; href: string } | null {
  const ref = refs(entry.repo);
  if (entry.pr != null && ref) {
    return { number: entry.pr, href: repoUrl(ref, 'pulls', String(entry.pr)) };
  }
  // An unhosted landing PR has no page here. Do not label it with that number
  // and then link the todo's own pull.
  if (entry.pr != null) return null;
  const todoPr = todo.pr && (todo.pr.repo === entry.repo || todo.pr.repo.endsWith(`/${entry.repo}`)) ? todo.pr : null;
  if (!todoPr) return null;
  const href = todoPrHref({ pr: todoPr }, refs);
  return href ? { number: todoPr.number, href } : null;
}

function checkHrefFor(check: {
  name?: string;
  conclusion?: string | null;
  details_url?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  output?: { summary?: string | null } | null;
}): string | null {
  const shaped: PullRequestCheck = {
    id: check.name ?? 'check',
    name: check.name ?? 'check',
    status: check.conclusion ?? 'pending',
    conclusion: check.conclusion ?? null,
    details_url: check.details_url ?? null,
    description: check.output?.summary ?? null,
    started_at: check.started_at ?? null,
    completed_at: check.completed_at ?? null,
  };
  return checkPageUrl(shaped);
}

function CheckPageLink({ href, children }: { href: string; children: string }): JSX.Element {
  if (href.startsWith('/')) {
    return (
      <Link className="shift-landing__link" to={href}>
        {children}
      </Link>
    );
  }
  return (
    <a className="shift-landing__link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function LandingRow({ entry, refs, todo }: { entry: ShiftTodoLanding; refs: RepoRefs; todo: ShiftTodo }): JSX.Element {
  const ref = refs(entry.repo);
  const run = useCommitCheckRuns(ref?.owner ?? '', ref?.name ?? '', entry.rescue_sha ?? '', Boolean(entry.check && ref && entry.rescue_sha));
  const check = entry.check ? run.data?.check_runs?.find((candidate) => candidate.name === entry.check) : undefined;
  const checkHref = check ? checkHrefFor(check) : null;
  const commitHref = (sha: string): string | null => ref ? repoUrl(ref, 'commit', encodeURIComponent(sha)) : null;
  const pull = landingPull(entry, refs, todo);
  if (entry.status === 'pending') return <li className="shift-landing__row shift__muted">{entry.repo}: not landed yet</li>;
  if (entry.status === 'landed') return <li className="shift-landing__row"><Check aria-hidden="true" /> <strong>{entry.repo}</strong> {entry.sha && commitHref(entry.sha) ? <Link to={commitHref(entry.sha)!}>{shortSha(entry.sha)}</Link> : entry.sha ? shortSha(entry.sha) : null}{pull ? <> · <Link to={pull.href}>PR #{pull.number}</Link></> : null}</li>;
  const event = entry.status === 'gate_failed' ? `gate failed after rebasing onto ${entry.target ?? 'the target'}` : entry.status === 'conflict' ? `could not land because of a conflict with ${entry.target ?? 'the target'}` : entry.status === 'push_race' ? 'push raced with another update' : 'work was kept for later';
  const tests = entry.tests ?? [];
  const rescueHref = ref && entry.rescue_branch ? repoUrl(ref, 'commits', encodeURIComponent(entry.rescue_branch)) : null;
  const result = check?.conclusion;
  return <li className="shift-landing__row"><strong>{entry.repo}</strong>: {event}. {rescueHref ? <Link className="shift-landing__link" to={rescueHref}>{entry.commits_not_on_main ?? 0} commits not on main</Link> : null}{tests.length ? <span> · failing tests: {tests.slice(0, 3).join(', ')}{tests.length > 3 ? ` +${tests.length - 3} more` : ''}</span> : null}{entry.check ? <span> · {checkHref ? <CheckPageLink href={checkHref}>{`${entry.check}: ${result ?? 'loading'}`}</CheckPageLink> : `${entry.check}: ${result ?? 'loading'}`}</span> : null}</li>;
}

export function LandingSection({ todo, refs }: { todo: ShiftTodo; refs: RepoRefs }): JSX.Element {
  return <section className="shift-landing" aria-label="Landing"><h2>Landing</h2><ul>{todo.landing?.map((entry, index) => <LandingRow key={`${entry.repo}-${index}`} entry={entry} refs={refs} todo={todo} />)}</ul></section>;
}
