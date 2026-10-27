// AttentionRow.tsx — one "Needs you" row: a title that links to its subject,
// the one next step on the line under it, and exactly one thing to do.
//
// A row is one subject — one pull request, todo or shift — not one item. When
// one cause raised several items (a review hold leaves changes requested, a
// reviewer that could not finish and a failed queue entry on the same pull
// request), the row offers the act of the first by `KIND_PRECEDENCE` and lists
// the rest under "Also", so there is one row and one button per subject.
// Shared by the Needs you page and the "Needs you here" strip at the top of
// Releases, so a row reads the same wherever it appears.
//
// The act is a button when the forge can make the call itself (`action.api`),
// a copyable command when it happens off-site, else the link to where to act.
// Whichever it is, the title still leads to the row's subject. A row about a
// todo also offers admins "Acknowledge until…": the cause is known and the row
// should stay quiet until then (`/api/v1/attention/acks`; the todo is untouched).

import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import type { AttentionItem } from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { ActionPreviewDialog } from '../../components/action/ActionPreviewDialog';
import { FamilyPill } from '../../components/family/FamilyPills';
import { toneClass, type Tone } from '../../components/tone/tone';
import { CopyCommand } from '../../components/shellCommand/CopyCommand';
import { useAttentionAck, useAttentionAction } from '../../hooks/useAttentionAction';
import { LIST_ACTION_PROP, LIST_OPEN_PROP, listRowProps } from '../../hooks/useListKeys';
import { useRepositories } from '../../hooks/useRepositories';
import { untilInputDefault, untilRfc3339 } from '../shift/shiftModel';
import { When } from '../../format/When';
import { SeverityMark } from './SeverityMark';
import {
  acknowledgeTarget,
  alsoLine,
  attentionContext,
  ownerDecision,
  primaryAction,
  repoFamilyMap,
  rowDetail,
  rowTitle,
  attentionHref,
  type AttentionSubject,
  type DecisionAnswer,
  type OwnerDecision,
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
  subject,
  tone,
  now,
  familyFor,
  onPick,
  picked,
}: {
  subject: AttentionSubject;
  tone: Tone;
  now: Date;
} & FamilyProps): JSX.Element {
  const item = subject.primary;
  // A row that asks the owner a question offers that question's Yes and No,
  // and nothing else: its one step is theirs to take.
  const decision = ownerDecision(item);
  const action = decision ? null : primaryAction(item);
  const family = familyFor(item);
  const detail = rowDetail(item);
  const to = attentionHref(item);
  // Only an admin ever sees a row: `/api/v1/attention` is admin-only.
  const target = acknowledgeTarget(item);
  return (
    <li
      className={toneClass('needs-you__row', tone)}
      data-testid={`needs-you-item-${item.id}`}
      data-list-key={item.id}
      {...listRowProps}
    >
      <FamilyPill family={family} picked={picked} onPick={onPick} />
      <div className="needs-you__main">
        <p className="needs-you__title-line">
          {to ? (
            <Link className="needs-you__title" to={to} {...LIST_OPEN_PROP}>
              <SeverityMark severity={subject.severity} />
              {rowTitle(item)}
            </Link>
          ) : (
            <span className="needs-you__title">
              <SeverityMark severity={subject.severity} />
              {rowTitle(item)}
            </span>
          )}
          <span className="needs-you__context">
            {attentionContext(item)}
            {/* Who has the todo. The key is absent both when nobody has it and
                on a server that predates assignees, so absence says nothing. */}
            {item.assignee ? (
              <span data-testid={`needs-you-assignee-${item.id}`}>
                {' · '}
                {item.assignee} has it
              </span>
            ) : null}
            {subject.since ? (
              <>
                {' · '}
                <When at={subject.since} now={now} />
              </>
            ) : null}
          </span>
        </p>
        {detail ? (
          <p className="needs-you__reason">
            {/* Only the message is cut to one line; its link stays in view. */}
            <span className="needs-you__reason-text" title={detail.title}>
              {detail.text}
            </span>
            {detail.to ? (
              <span className="needs-you__reason-open">
                <span aria-hidden="true">·</span>
                <Link to={detail.to} aria-label={`Open: ${item.title}`}>
                  open
                </Link>
              </span>
            ) : null}
          </p>
        ) : null}
        {subject.also.length > 0 ? (
          <ul className="needs-you__also" aria-label={`Also waiting on ${item.title}`}>
            {subject.also.map((other) => (
              <Also key={other.id} item={other} />
            ))}
          </ul>
        ) : null}
      </div>
      {decision ? (
        <Decide item={item} decision={decision} />
      ) : action?.type === 'api' ? (
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
          {...LIST_ACTION_PROP}
          to={action.to}
          aria-label={`${action.label}: ${item.title}`}
          title={item.reason ?? undefined}
        >
          {action.label} →
        </Link>
      ) : null}
      {target ? <Acknowledge subject={subject} target={target} /> : null}
    </li>
  );
}

/**
 * One of the subject's other items: named, with what it asks for, and a link
 * to it. Never a button — the row's one act is the primary item's.
 */
function Also({ item }: { item: AttentionItem }): JSX.Element {
  const line = alsoLine(item);
  return (
    <li className="needs-you__also-item" data-testid={`needs-you-also-${item.id}`}>
      <span className="needs-you__also-kind">
        {line.to ? <Link to={line.to}>{line.label}</Link> : line.label}
      </span>{' '}
      {line.detail}
    </li>
  );
}

/**
 * The one question only the owner can answer, as the two buttons that answer
 * it. Each is confirmed first, in the forge's own words, and a refusal is
 * worded on the row rather than thrown away. Nothing here answers for them:
 * both calls are the owner's, and the forge refuses either from anybody else.
 */
function Decide({
  item,
  decision,
}: {
  item: AttentionItem;
  decision: OwnerDecision;
}): JSX.Element {
  const run = useAttentionAction();
  const [confirming, setConfirming] = useState<DecisionAnswer | null>(null);
  const button = (answer: DecisionAnswer, first: boolean): JSX.Element => (
    <ActionButton
      variant={first ? 'primary' : 'default'}
      {...(first ? LIST_ACTION_PROP : {})}
      disabled={run.isPending}
      aria-label={`${answer.label}: ${decision.question}`}
      onClick={() => {
        run.reset();
        setConfirming(answer);
      }}
    >
      {answer.label}
    </ActionButton>
  );
  return (
    <div className="needs-you__act needs-you__decide">
      {button(decision.yes, true)}
      {button(decision.no, false)}
      {run.error ? (
        <span className="needs-you__error" role="alert">
          {run.error.message}
        </span>
      ) : null}
      <ActionPreviewDialog
        open={confirming !== null}
        title={`${confirming?.label ?? ''}: ${decision.question}`}
        description={confirming?.confirm}
        confirmLabel={confirming?.label ?? ''}
        confirmDisabled={run.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const answer = confirming;
          setConfirming(null);
          if (!answer) return;
          // A refusal lands in `run.error`, which the row words above.
          run.mutate({ method: answer.method, path: answer.path, body: answer.body });
        }}
      />
      <span className="needs-you__decide-note" aria-hidden="true">
        {item.sha ? <>on <code>{item.sha.slice(0, 12)}</code></> : null}
      </span>
    </div>
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
        {...LIST_ACTION_PROP}
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
 * morning. It acknowledges every item of the row by id; the todo behind it,
 * which is what the queue reads, is left as it is.
 */
function Acknowledge({
  subject,
  target,
}: {
  subject: AttentionSubject;
  target: { family: string; id: string };
}): JSX.Element {
  const item = subject.primary;
  const action = useAttentionAck();
  const [until, setUntil] = useState(() => untilInputDefault(new Date()));
  const at = untilRfc3339(until);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (at) action.mutate({ itemIds: [item.id, ...subject.also.map((also) => also.id)], until: at });
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
