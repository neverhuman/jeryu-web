// AttentionRow.tsx — one "Needs you" row: a title, one line of reason, and
// exactly one thing to do. Shared by the Needs you page and the "Needs you
// here" strip at the top of Work, Pull requests and Releases, so a row reads
// the same wherever it appears.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import type { AttentionItem } from '../../api/types';
import { FamilyPill } from '../../components/family/FamilyPills';
import { CopyCommand } from '../../components/shellCommand/CopyCommand';
import { useRepositories } from '../../hooks/useRepositories';
import { formatAgo } from '../shift/shiftModel';
import { attentionContext, primaryAction, repoFamilyMap } from './needsYouModel';

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
    </li>
  );
}
