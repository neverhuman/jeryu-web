// NeedsYouPage.tsx — the landing page (`/needs-you`): everything in the
// pipeline that is waiting on a human, computed by the server from current
// state (`GET /api/v1/attention`), so a row disappears when its cause is fixed.
//
// Built to be read in a glance. A row is a title, one line of reason, and
// exactly one thing to do: a link to where to act, or the command to copy
// when the act happens off-site. Red is reserved for rows where a person is
// the next step; `watch` rows stay neutral, folded behind a count. When
// nothing is waiting, one sentence says so and a single line shows what the
// system is doing, so calm reads as alive rather than broken.

import { CircleCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { AttentionItem } from '../../api/types';
import { CopyCommand } from '../../components/shellCommand/CopyCommand';
import { EmptyState, LoadingState, PipelineQueryState } from '../../components/state';
import { useControlPlaneRunners } from '../../hooks/useControlPlaneRunners';
import {
  ATTENTION_QUERY_KEY,
  useAttention,
  usePipelineEvents,
  usePipelineNudge,
} from '../../hooks/usePipeline';
import { useShiftWorkers } from '../../hooks/useShift';
import { formatAgo } from '../shift/shiftModel';
import {
  attentionContext,
  groupAttention,
  primaryAction,
  severityTone,
  systemPulse,
  type AttentionGroup,
} from './needsYouModel';

import '../page.css';
import './NeedsYou.css';

export function NeedsYouPage(): JSX.Element {
  const attention = useAttention();
  usePipelineNudge(attention.isSuccess, ATTENTION_QUERY_KEY);
  const groups = groupAttention(attention.data?.items ?? []);
  const urgent = groups.filter((group) => group.severity !== 'watch');
  const watch = groups.find((group) => group.severity === 'watch');
  const now = new Date();

  return (
    <div className="page page--wide" data-testid="needs-you-page">
      <header className="page__header">
        <h1 className="page__title">Needs you</h1>
        <p className="page__subtitle">
          Where the pipeline is waiting on a person. Rows clear themselves when
          the cause is fixed.
        </p>
      </header>

      {attention.isPending ? (
        <LoadingState title="Checking what needs you…" variant="message" />
      ) : attention.isError ? (
        <PipelineQueryState what="the Needs you list" error={attention.error} />
      ) : (
        <>
          {urgent.length === 0 ? (
            <>
              <EmptyState
                icon={CircleCheck}
                title="Nothing needs you."
                description={`Checked ${formatAgo(attention.data.generated_at, now)}.`}
              />
              <SystemPulse now={now} />
            </>
          ) : (
            urgent.map((group) => <AttentionSection key={group.severity} group={group} now={now} />)
          )}
          {watch ? (
            <details className="needs-you__watch" data-testid="needs-you-watch">
              <summary>
                {watch.items.length} thing{watch.items.length === 1 ? '' : 's'} worth a look, none
                waiting on you
              </summary>
              <AttentionList group={watch} now={now} />
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}

function AttentionSection({ group, now }: { group: AttentionGroup; now: Date }): JSX.Element {
  return (
    <section
      className="needs-you__group"
      aria-label={group.label}
      data-testid={`needs-you-${group.severity}`}
    >
      <h2 className="page__section-title">
        <span className="page__pill page__pill--danger">{group.items.length}</span> {group.label}
      </h2>
      <AttentionList group={group} now={now} />
    </section>
  );
}

function AttentionList({ group, now }: { group: AttentionGroup; now: Date }): JSX.Element {
  const tone = severityTone(group.severity);
  return (
    <ul className="needs-you__list">
      {group.items.map((item) => (
        <AttentionRow key={item.id} item={item} tone={tone} now={now} />
      ))}
    </ul>
  );
}

function AttentionRow({
  item,
  tone,
  now,
}: {
  item: AttentionItem;
  tone: 'danger' | 'neutral';
  now: Date;
}): JSX.Element {
  const action = primaryAction(item);
  return (
    <li className={`needs-you__row needs-you__row--${tone}`} data-testid={`needs-you-item-${item.id}`}>
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
        <CopyCommand command={action.command} label={`${action.label} command for ${item.title}`} />
      ) : action?.type === 'link' ? (
        <Link className="needs-you__open" to={action.to} aria-label={`${action.label}: ${item.title}`}>
          {action.label} →
        </Link>
      ) : null}
    </li>
  );
}

/** What the system is doing right now; every part is optional. */
function SystemPulse({ now }: { now: Date }): JSX.Element | null {
  const workers = useShiftWorkers();
  const runners = useControlPlaneRunners();
  const last = usePipelineEvents({ limit: 1 }, { refetchInterval: 15_000 });
  const event = last.data?.events[0];
  const line = systemPulse(
    {
      workers: workers.data?.workers,
      runners: runners.data?.local,
      lastEvent: event ? { ts: event.ts, summary: event.summary } : undefined,
    },
    (iso) => formatAgo(iso, now)
  );
  if (!line) return null;
  return (
    <p className="needs-you__pulse" role="status" data-testid="needs-you-pulse">
      Right now: {line}.{' '}
      <Link to="/activity">Activity</Link>
    </p>
  );
}
