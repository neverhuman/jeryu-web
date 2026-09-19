// NeedsYouPage.tsx — the landing page (`/needs-you`): everything in the
// pipeline that is waiting on a human, computed by the server from current
// state (`GET /api/v1/attention`), so a row disappears when its cause is fixed.
//
// Rows are grouped by severity. Critical and action rows are red: a person is
// the next step. When the act happens off-site (a deploy), the row carries the
// exact command with a copy control.

import { CircleCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { AttentionItem } from '../../api/types';
import { CopyCommand } from '../../components/copy/CopyCommand';
import { EmptyState, LoadingState, PipelineQueryState } from '../../components/state';
import { useAttention, usePipelineNudge } from '../../hooks/usePipeline';
import { formatAgo } from '../shift/shiftModel';
import {
  groupAttention,
  kindLabel,
  safeHref,
  severityTone,
  type AttentionGroup,
} from './needsYouModel';

import '../page.css';
import './NeedsYou.css';

export function NeedsYouPage(): JSX.Element {
  const attention = useAttention();
  usePipelineNudge(attention.isSuccess);
  const items = attention.data?.items ?? [];
  const groups = groupAttention(items);
  const now = new Date();

  return (
    <div className="page page--wide" data-testid="needs-you-page">
      <header className="page__header">
        <h1 className="page__title">Needs you</h1>
        <p className="page__subtitle">
          Every place the pipeline is waiting on a person: blocked todos, reviews
          and merges, failed queue entries, releases ready to deploy. Rows come
          from current state and clear themselves when the cause is fixed.
        </p>
      </header>

      {attention.isPending ? (
        <LoadingState title="Checking what needs you…" variant="message" />
      ) : attention.isError ? (
        <PipelineQueryState what="the Needs you list" error={attention.error} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nothing needs you."
          description={`Checked ${formatAgo(attention.data.generated_at, now)} (${attention.data.generated_at}).`}
        />
      ) : (
        <>
          <p className="needs-you__checked" role="status">
            {items.length} item{items.length === 1 ? '' : 's'} · checked{' '}
            {formatAgo(attention.data.generated_at, now)}
          </p>
          {groups.map((group) => (
            <AttentionSection key={group.severity} group={group} now={now} />
          ))}
        </>
      )}
    </div>
  );
}

function AttentionSection({ group, now }: { group: AttentionGroup; now: Date }): JSX.Element {
  const tone = severityTone(group.severity);
  return (
    <section
      className={`needs-you__group needs-you__group--${tone}`}
      aria-label={group.label}
      data-testid={`needs-you-${group.severity}`}
    >
      <h2 className="page__section-title">
        <span className={`page__pill page__pill--${tone}`}>{group.items.length}</span>{' '}
        {group.label}
      </h2>
      <ul className="needs-you__list">
        {group.items.map((item) => (
          <AttentionRow key={item.id} item={item} tone={tone} now={now} />
        ))}
      </ul>
    </section>
  );
}

function AttentionRow({
  item,
  tone,
  now,
}: {
  item: AttentionItem;
  tone: 'danger' | 'warning';
  now: Date;
}): JSX.Element {
  const href = safeHref(item.href);
  const label = item.action?.label ?? 'Open';
  return (
    <li className={`needs-you__row needs-you__row--${tone}`} data-testid={`needs-you-item-${item.id}`}>
      <div className="needs-you__main">
        <span className="needs-you__title">{item.title}</span>
        {item.reason ? <p className="needs-you__reason">{item.reason}</p> : null}
        <span className="needs-you__chips">
          <span className={`page__pill page__pill--${tone}`}>{kindLabel(item.kind)}</span>
          {item.family ? <span className="page__pill">{item.family}</span> : null}
          {item.repo ? (
            <span className="page__pill">
              {item.repo}
              {item.pr ? `#${item.pr}` : ''}
            </span>
          ) : null}
          {item.shift ? <span className="page__pill">{item.shift}</span> : null}
          {item.since ? (
            <time className="needs-you__age" dateTime={item.since} title={item.since}>
              {formatAgo(item.since, now)}
            </time>
          ) : null}
        </span>
        {item.action?.command ? (
          <CopyCommand command={item.action.command} label={`command for ${item.title}`} />
        ) : null}
      </div>
      {href ? (
        <Link className="needs-you__open" to={href} aria-label={`${label}: ${item.title}`}>
          {label} →
        </Link>
      ) : null}
    </li>
  );
}
