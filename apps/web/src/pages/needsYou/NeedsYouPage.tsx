// NeedsYouPage.tsx — the landing page (`/needs-you`): everything in the
// pipeline that is waiting on a human, computed by the server from current
// state (`GET /api/v1/attention`), so a row disappears when its cause is fixed.
//
// Built to be read in a glance. A row is a title, one line of reason, and
// exactly one thing to do: a link to where to act, or the command to copy
// when the act happens off-site, under one muted line saying on which machine
// and in which directory to run it. Red is reserved for rows where a person is
// the next step; `watch` rows stay neutral, folded behind a count. When
// nothing is waiting, one sentence says so and a single line shows what the
// system is doing, so calm reads as alive rather than broken.

import { CircleCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { FamilyStrip } from '../../components/family/FamilyPills';
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
import { AttentionRow, useRepoFamilies, type FamilyProps } from './AttentionRow';
import {
  groupSubjects,
  familyCounts,
  familyOf,
  filterByFamily,
  severityTone,
  systemPulse,
  type SubjectGroup,
} from './needsYouModel';

import '../page.css';
import './NeedsYou.css';

export function NeedsYouPage(): JSX.Element {
  const attention = useAttention();
  usePipelineNudge(attention.isSuccess, ATTENTION_QUERY_KEY);
  // `?family=` keeps one family's rows: a pill on any row, or in the strip above,
  // sets it, so "everything waiting on me for jeryu" is one click and a link.
  const [searchParams, setSearchParams] = useSearchParams();
  const family = searchParams.get('family') ?? '';
  const repoFamilies = useRepoFamilies();
  const setFamily = (next: string): void => {
    const params = new URLSearchParams(searchParams);
    if (next && next !== family) params.set('family', next);
    else params.delete('family');
    setSearchParams(params, { replace: true });
  };
  const allItems = attention.data?.items ?? [];
  const counts = familyCounts(
    allItems.filter((item) => item.severity !== 'watch'),
    repoFamilies
  );
  const groups = groupSubjects(filterByFamily(allItems, family, repoFamilies));
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
          {counts.length > 1 || family ? (
            <FamilyStrip counts={counts} family={family} onPick={setFamily} />
          ) : null}
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
            urgent.map((group) => (
              <AttentionSection
                key={group.severity}
                group={group}
                now={now}
                familyFor={(item) => familyOf(item, repoFamilies)}
                onPick={setFamily}
                picked={family}
              />
            ))
          )}
          {watch ? (
            <details className="needs-you__watch" data-testid="needs-you-watch">
              <summary>
                {watch.subjects.length} thing{watch.subjects.length === 1 ? '' : 's'} worth a look, none
                waiting on you
              </summary>
              <AttentionList
                group={watch}
                now={now}
                familyFor={(item) => familyOf(item, repoFamilies)}
                onPick={setFamily}
                picked={family}
              />
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}

function AttentionSection({
  group,
  now,
  ...familyProps
}: { group: SubjectGroup; now: Date } & FamilyProps): JSX.Element {
  return (
    <section
      className="needs-you__group"
      aria-label={group.label}
      data-testid={`needs-you-${group.severity}`}
    >
      <h2 className="page__section-title">
        <span className="page__pill page__pill--danger">{group.subjects.length}</span>{' '}
        {group.label}
      </h2>
      <AttentionList group={group} now={now} {...familyProps} />
    </section>
  );
}

function AttentionList({
  group,
  now,
  ...familyProps
}: { group: SubjectGroup; now: Date } & FamilyProps): JSX.Element {
  const tone = severityTone(group.severity);
  return (
    <ul className="needs-you__list">
      {group.subjects.map((subject) => (
        <AttentionRow key={subject.key} subject={subject} tone={tone} now={now} {...familyProps} />
      ))}
    </ul>
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
