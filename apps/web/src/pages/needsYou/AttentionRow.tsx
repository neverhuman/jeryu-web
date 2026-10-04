// AttentionRow.tsx — one "Needs you" row: a title, one line of reason, and
// exactly one thing to do. Shared by the Needs you page and the "Needs you
// here" strip at the top of Releases, so a row reads the same wherever it
// appears. A row about a todo also offers admins "Acknowledge until…": the
// cause is known and the row should stay quiet until then.

import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import type { AttentionItem } from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { FamilyPill } from '../../components/family/FamilyPills';
import { CopyCommand } from '../../components/shellCommand/CopyCommand';
import { useRepositories } from '../../hooks/useRepositories';
import { useShiftTodoAction } from '../../hooks/useShift';
import { formatAgo, untilInputDefault, untilRfc3339 } from '../shift/shiftModel';
import {
  acknowledgeTarget,
  attentionContext,
  primaryAction,
  repoFamilyMap,
} from './needsYouModel';

/** `owner/name` → family, for rows whose server payload names only the repository. */
export function useRepoFamilies(): ReadonlyMap<string, string> {
  const repositories = useRepositories({});
  return useMemo(() => repoFamilyMap(repositories.data?.repositories ?? []), [repositories.data]);
}

export interface FamilyProps {
  familyFor: (item: AttentionItem) => string;
  onPick: (family: string) => void;
  picked: string;
}

export function AttentionRow({
  item,
  tone,
  now,
  familyFor,
  onPick,
  picked,
}: {
  item: AttentionItem;
  tone: 'danger' | 'neutral';
  now: Date;
} & FamilyProps): JSX.Element {
  const action = primaryAction(item);
  const family = familyFor(item);
  // Only an admin ever sees a row: `/api/v1/attention` is admin-only.
  const target = acknowledgeTarget(item);
  return (
    <li className={`needs-you__row needs-you__row--${tone}`} data-testid={`needs-you-item-${item.id}`}>
      <FamilyPill family={family} picked={picked} onPick={onPick} />
      <div className="needs-you__main">
        <p className="needs-you__title-line">
          <span className="needs-you__title">{item.title}</span>
          <span className="needs-you__context">
            {attentionContext(item)}
            {item.since ? (
              <>
                {' · '}
                <time dateTime={item.since} title={item.since}>
                  {formatAgo(item.since, now)}
                </time>
              </>
            ) : null}
          </span>
        </p>
        {item.reason ? (
          <p className="needs-you__reason" title={item.reason}>
            {item.reason}
          </p>
        ) : null}
      </div>
      {action?.type === 'command' ? (
        <CopyCommand
          command={action.command}
          where={action.where}
          label={`${action.label} command for ${item.title}`}
        />
      ) : action?.type === 'link' ? (
        // One link, stretched over the row (CSS): the whole row leads there,
        // and there is still exactly one thing to activate.
        <Link
          className="needs-you__open"
          to={action.to}
          aria-label={`${action.label}: ${item.title}`}
          title={item.reason ?? undefined}
        >
          {action.label} →
        </Link>
      ) : null}
      {target ? <Acknowledge item={item} target={target} /> : null}
    </li>
  );
}

/**
 * "Acknowledge until…": the row's cause is known and waiting on something
 * dated, so it goes quiet until that date instead of being read again every
 * morning. It parks the todo behind the row, which is what the queue reads.
 */
function Acknowledge({
  item,
  target,
}: {
  item: AttentionItem;
  target: { family: string; id: string };
}): JSX.Element {
  const action = useShiftTodoAction();
  const [until, setUntil] = useState(() => untilInputDefault(new Date()));
  const at = untilRfc3339(until);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (at) action.mutate({ ...target, action: 'acknowledge', until: at });
  };
  return (
    <details className="needs-you__more">
      <summary aria-label={`More for ${item.title}`}>More</summary>
      <form className="needs-you__ack" onSubmit={submit} aria-label={`Acknowledge ${target.id}?`}>
        <label>
          Acknowledge until{' '}
          <input
            type="datetime-local"
            value={until}
            onChange={(event) => setUntil(event.target.value)}
            aria-label={`Acknowledge ${target.id} until`}
          />
        </label>
        <ActionButton variant="default" type="submit" disabled={action.isPending || at === null}>
          Acknowledge
        </ActionButton>
        {action.error ? (
          <span className="needs-you__error" role="alert">
            {action.error.message}
          </span>
        ) : null}
      </form>
    </details>
  );
}
