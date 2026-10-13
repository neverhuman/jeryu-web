// StageChanges.tsx — inside a stage's detail: what this stage is still
// missing (the commits main holds that it does not: what you are not testing
// here yet, and what promoting would bring) and what its recent moves brought
// (what just became available here). Each commit links to the repository and,
// when it belongs to a work item, to that item's /work page.

import { Link } from 'react-router-dom';

import type {
  BoardChange,
  BoardStageChanges,
  BoardStageMove,
} from '../../api/types/releaseBoard';
import { When } from '../../format/When';
import { useForgeHost } from '../../hooks/useForgeHost';
import { repoRefOf, repoUrl } from '../repoBrowserModel';
import { todoHref } from '../shift/workPaths';

export function StageChanges({
  stageName,
  missing,
  arrived,
}: {
  stageName: string;
  missing?: BoardStageChanges;
  arrived?: readonly BoardStageMove[];
}): JSX.Element | null {
  const host = useForgeHost();
  if (!missing && (!arrived || arrived.length === 0)) return null;
  return (
    <div className="release-board__changes" data-testid="release-board-stage-changes">
      {missing ? (
        <section aria-label={`Not in ${stageName} yet`}>
          <p className="release-board__label">
            {missing.total === 0
              ? `Nothing missing: ${stageName} holds everything on ${missing.from}`
              : `Not in ${stageName} yet: ${countText(missing.total)} on ${missing.from}`}
          </p>
          <ChangeList changes={missing} hostOf={host} />
        </section>
      ) : null}
      {arrived && arrived.length > 0 ? (
        <section aria-label={`New in ${stageName}`}>
          <p className="release-board__label">New in {stageName}</p>
          {arrived.map((moved) => (
            <div key={`${moved.at}-${moved.to}`} className="release-board__move">
              <p className="release-board__muted">
                <When at={moved.at} /> · <code>{moved.from}</code> → <code>{moved.to}</code> ·{' '}
                {countText(moved.total)}
              </p>
              <ChangeList changes={moved} hostOf={host} />
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function ChangeList({
  changes,
  hostOf,
}: {
  changes: BoardStageChanges | BoardStageMove;
  hostOf: (fullName?: string) => string;
}): JSX.Element | null {
  if (changes.changes.length === 0) return null;
  const ref = repoRefOf(hostOf(changes.repo), changes.repo);
  const more = changes.total - changes.changes.length;
  return (
    <ul className="release-board__list">
      {changes.changes.map((change: BoardChange) => (
        <li key={change.sha}>
          <Link to={repoUrl(ref, 'commit', change.sha)}>
            <code>{change.sha}</code>
          </Link>{' '}
          {change.subject}
          {change.todo ? (
            <>
              {' · '}
              <Link to={todoHref(change.todo)} title={change.todo}>
                {change.todo_title ?? change.todo}
              </Link>
            </>
          ) : null}
        </li>
      ))}
      {more > 0 ? <li className="release-board__muted">and {more} more</li> : null}
    </ul>
  );
}

function countText(count: number): string {
  return `${count} change${count === 1 ? '' : 's'}`;
}
