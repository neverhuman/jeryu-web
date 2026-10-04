// AttentionRow.tsx — one "Needs you" row: a title that links to its subject,
// the one next step on the line under it, and exactly one thing to do.
// Shared by the Needs you page and the "Needs you here" strip at the top of
// Releases, so a row reads the same wherever it appears.
//
// The act is a button when the forge can make the call itself (`action.api`),
// a copyable command when it happens off-site, else the link to where to act.
// Whichever it is, the title still leads to the row's subject. A row about a
// todo also offers admins "Acknowledge until…": the cause is known and the row
// should stay quiet until then.

import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import type { AttentionItem } from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { ActionPreviewDialog } from '../../components/action/ActionPreviewDialog';
import { FamilyPill } from '../../components/family/FamilyPills';
import { CopyCommand } from '../../components/shellCommand/CopyCommand';
import { useAttentionAction } from '../../hooks/useAttentionAction';
import { useRepositories } from '../../hooks/useRepositories';
import { useShiftTodoAction } from '../../hooks/useShift';
import { formatAgo, untilInputDefault, untilRfc3339 } from '../shift/shiftModel';
import {
  acknowledgeTarget,
  attentionContext,
  primaryAction,
  repoFamilyMap,
  rowDetail,
  safeHref,
  type PrimaryAction,
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
  const detail = rowDetail(item);
  const to = safeHref(item.href);
  // Only an admin ever sees a row: `/api/v1/attention` is admin-only.
  const target = acknowledgeTarget(item);
  return (
    <li className={`needs-you__row needs-you__row--${tone}`} data-testid={`needs-you-item-${item.id}`}>
      <FamilyPill family={family} picked={picked} onPick={onPick} />
      <div className="needs-you__main">
        <p className="needs-you__title-line">
          {to ? (
            <Link className="needs-you__title" to={to}>
              {item.title}
            </Link>
          ) : (
            <span className="needs-you__title">{item.title}</span>
          )}
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
        {detail ? (
          <p className="needs-you__reason" title={detail.title}>
            {detail.text}
          </p>
        ) : null}
      </div>
      {action?.type === 'api' ? (
        <RunAction item={item} action={action} />
      ) : action?.type === 'command' ? (
        <CopyCommand
          command={action.command}
          where={action.where}
          label={`${action.label} command for ${item.title}`}
        />
      ) : action?.type === 'link' ? (
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
 * The row's own act: one button that makes the call the server named, behind
 * a confirm step because it changes the pipeline straight away. The forge's
 * refusal is worded on the row rather than thrown away, so a reader learns
 * why nothing happened without opening another page.
 */
function RunAction({
  item,
  action,
}: {
  item: AttentionItem;
  action: Extract<PrimaryAction, { type: 'api' }>;
}): JSX.Element {
  const run = useAttentionAction();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="needs-you__act">
      <ActionButton
        variant="primary"
        disabled={run.isPending}
        aria-label={`${action.label}: ${item.title}`}
        onClick={() => {
          run.reset();
          setConfirming(true);
        }}
      >
        {action.label}
      </ActionButton>
      {run.error ? (
        <span className="needs-you__error" role="alert">
          {run.error.message}
        </span>
      ) : null}
      <ActionPreviewDialog
        open={confirming}
        title={`${action.label}?`}
        description={action.confirm}
        confirmLabel={action.label}
        confirmDisabled={run.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          // A refusal lands in `run.error`, which the row words above.
          run.mutate({ method: action.method, path: action.path, body: action.body });
        }}
      />
    </div>
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
