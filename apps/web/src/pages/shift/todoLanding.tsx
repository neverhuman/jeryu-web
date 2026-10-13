import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { ShiftTodo, ShiftTodoLanding } from '../../api/types';
import { useCommitCheckRuns } from '../../hooks/useCommitCheckRuns';
import { checkPageUrl } from '../../components/merge/ChecksPanel';
import { repoUrl } from '../repoBrowserModel';
import type { RepoRefs } from './shiftModel';
import { shortSha, todoPrHref } from './shiftModel';

function LandingRow({ entry, refs, todo }: { entry: ShiftTodoLanding; refs: RepoRefs; todo: ShiftTodo }): JSX.Element {
  const ref = refs(entry.repo);
  const run = useCommitCheckRuns(ref?.owner ?? '', ref?.name ?? '', entry.rescue_sha ?? '', Boolean(entry.check && ref && entry.rescue_sha));
  const check = entry.check ? run.data?.check_runs?.find((candidate) => candidate.name === entry.check) : undefined;
  const checkHref = check ? checkPageUrl({ name: check.name ?? '', status: check.conclusion ?? '', conclusion: check.conclusion ?? null, details_url: check.details_url ?? null } as never) : null;
  const commitHref = (sha: string): string | null => ref ? repoUrl(ref, 'commit', encodeURIComponent(sha)) : null;
  const todoPr = todo.pr && (todo.pr.repo === entry.repo || todo.pr.repo.endsWith(`/${entry.repo}`)) ? todo.pr : null;
  const prNumber = entry.pr ?? todoPr?.number;
  const prHref = entry.pr && ref ? repoUrl(ref, 'pulls', String(entry.pr)) : todoPr ? todoPrHref({ pr: todoPr }, refs) : null;
  if (entry.status === 'pending') return <li className="shift-landing__row shift__muted">{entry.repo}: not landed yet</li>;
  if (entry.status === 'landed') return <li className="shift-landing__row"><Check aria-hidden="true" /> <strong>{entry.repo}</strong> {entry.sha && commitHref(entry.sha) ? <Link to={commitHref(entry.sha)!}>{shortSha(entry.sha)}</Link> : entry.sha ? shortSha(entry.sha) : null}{prHref ? <> · <Link to={prHref}>PR #{prNumber}</Link></> : null}</li>;
  const event = entry.status === 'gate_failed' ? `gate failed after rebasing onto ${entry.target ?? 'the target'}` : entry.status === 'conflict' ? `could not land because of a conflict with ${entry.target ?? 'the target'}` : entry.status === 'push_race' ? 'push raced with another update' : 'work was kept for later';
  const tests = entry.tests ?? [];
  const rescueHref = ref && entry.rescue_branch ? repoUrl(ref, 'commits', encodeURIComponent(entry.rescue_branch)) : null;
  const result = check?.conclusion;
  return <li className="shift-landing__row"><strong>{entry.repo}</strong>: {event}. {rescueHref ? <Link className="shift-landing__link" to={rescueHref}>{entry.commits_not_on_main ?? 0} commits not on main</Link> : null}{tests.length ? <span> · failing tests: {tests.slice(0, 3).join(', ')}{tests.length > 3 ? ` +${tests.length - 3} more` : ''}</span> : null}{entry.check ? <span> · {checkHref ? <a className="shift-landing__link" href={checkHref}>{entry.check}: {result ?? 'loading'}</a> : `${entry.check}: ${result ?? 'loading'}`}</span> : null}</li>;
}

export function LandingSection({ todo, refs }: { todo: ShiftTodo; refs: RepoRefs }): JSX.Element {
  return <section className="shift-landing" aria-label="Landing"><h2>Landing</h2><ul>{todo.landing?.map((entry, index) => <LandingRow key={`${entry.repo}-${index}`} entry={entry} refs={refs} todo={todo} />)}</ul></section>;
}
