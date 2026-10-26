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
//
// Two tabs: Mine (the default) keeps the rows about todos the viewer filed or
// holds; All (`?view=all`, once its own page at `/blocked`) is every row the
// pipeline is waiting on a person for. The family is the header's scope.

import { CircleCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { ScopedEmptyState } from '../../components/family/ScopedEmptyState';
import { PageHeader, queryFreshness } from '../../components/pageHeader';
import { PageTabs } from '../../components/pageTabs';
import { pillClass } from '../../components/tone/tone';
import { LoadingState, PipelineQueryState } from '../../components/state';
import { useControlPlaneRunners } from '../../hooks/useControlPlaneRunners';
import {
  ATTENTION_QUERY_KEY,
  useAttention,
  usePipelineEvents,
  usePipelineNudge,
} from '../../hooks/usePipeline';
import { useShiftWorkers } from '../../hooks/useShift';
import { relativeText } from '../../format/when';
import { AttentionRow, useRepoFamilies, type FamilyProps } from './AttentionRow';
import {
  groupSubjects,
  NEEDS_YOU_PATH,
  personalAttention,
  familyOf,
  filterByFamily,
  severityTone,
  systemPulse,
  type SubjectGroup,
} from './needsYouModel';
import { useListKeys } from '../../hooks/useListKeys';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useAuth } from '../../hooks/useAuth';

import '../page.css';
import './NeedsYou.css';

/** The tab that shows every row, not only the viewer's. */
export const ALL_VIEW = 'all';

export function NeedsYouPage(): JSX.Element {
  const [params] = useSearchParams();
  const all = params.get('view') === ALL_VIEW;
  const title = 'Needs you';
  usePageTitle(all ? 'Needs you · All' : title);
  const { user, isPending: authPending } = useAuth();
  const isAdmin = user?.role === 'admin';
  const attention = useAttention(isAdmin);
  usePipelineNudge(attention.isSuccess, ATTENTION_QUERY_KEY);
  // The shell's family scope keeps one family's rows: the header's family
  // control, or a pill on any row, sets it, so "everything waiting on me for
  // one family" is a link (`?family=`) and the scope every page after this opens with.
  const scope = useFamilyScope();
  const family = scope.family;
  const repoFamilies = useRepoFamilies();
  const setFamily = (next: string): void => {
    scope.setFamily(next === family ? '' : next);
  };
  const data = all ? attention.data : personalAttention(attention.data, user?.login);
  const allItems = data?.items ?? [];
  const groups = groupSubjects(filterByFamily(allItems, family, repoFamilies));
  const urgent = groups.filter((group) => group.severity !== 'watch');
  const watch = groups.find((group) => group.severity === 'watch');
  // The one number this page is about, next to its title, so the nav badge,
  // each page's strip and this header are visibly the same count.
  const waiting = urgent.reduce((total, group) => total + group.subjects.length, 0);
  const now = new Date();
  // Every row on the page — red groups and the folded `watch` list — is one
  // `j`/`k` list, in the order it is read.
  const rows = useListKeys<HTMLDivElement>();

  if (authPending) return <LoadingState title="Checking access…" variant="message" />;
  if (!isAdmin) {
    return <p role="alert">Only admins can see the {title} list.</p>;
  }

  return (
    <div className="page page--wide" data-testid="needs-you-page" ref={rows}>
      <PageHeader
        title={title}
        testId="needs-you-header"
        freshness={queryFreshness(attention)}
        badges={
          waiting > 0 ? (
            <span className={pillClass('human')} data-testid="needs-you-count">
              {waiting}
            </span>
          ) : null
        }
      />
      <PageTabs
        label="Whose rows"
        testId="needs-you-tabs"
        current={all ? ALL_VIEW : 'mine'}
        tabs={[
          { id: 'mine', label: 'Mine', to: scope.scopedPath(NEEDS_YOU_PATH) },
          { id: ALL_VIEW, label: 'All', to: scope.scopedPath(`${NEEDS_YOU_PATH}?view=${ALL_VIEW}`) },
        ]}
      />

      {attention.isPending ? (
        <LoadingState title="Checking what needs you…" variant="message" />
      ) : attention.isError ? (
        <PipelineQueryState what="the Needs you list" error={attention.error} />
      ) : (
        <>
          {urgent.length === 0 ? (
            <>
              <ScopedEmptyState
                icon={CircleCheck}
                title={all ? 'Nothing is blocked.' : 'Nothing needs you.'}
                description={`Checked ${relativeText(attention.data.generated_at, now)}.`}
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
                blocked
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
        <span className={pillClass(severityTone(group.severity))}>
          {group.subjects.length}
        </span>{' '}
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
    (iso) => relativeText(iso, now)
  );
  if (!line) return null;
  return (
    <p className="needs-you__pulse" role="status" data-testid="needs-you-pulse">
      Right now: {line}.{' '}
      <Link to="/activity">Activity</Link>
    </p>
  );
}
