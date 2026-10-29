// FlowPage.tsx — where the work in progress is stuck right now.
//
// It leads with how the factory is doing over the yield report's own window --
// lead time, how often a person was needed, how often a change went bad -- for
// a reader the admin-only yield report answers; the strip below names the nine stations
// with one number each and marks the bottleneck; under it, the station picked in
// the address (the bottleneck by default) lists its work in progress, newest
// first, a page at a time. The family comes from the header's family scope. What
// is in progress does not depend on a window, so the page reads the server's
// default one.

import { Route as RouteIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { FlowReport } from '../../api/types';
import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { ScopedEmptyState } from '../../components/family/ScopedEmptyState';
import { HeadlineTiles } from '../../components/headline/HeadlineTiles';
import { PageHeader, queryFreshness } from '../../components/pageHeader';
import { LoadingState } from '../../components/state';
import { useFlow, useFlowStation } from '../../hooks/useFlow';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useYield } from '../../hooks/useYield';
import { FlowQueryState } from './FlowQueryState';
import { StationWipList } from './StationWipList';
import { WipStrip } from './WipStrip';
import { ExternalTaskPlan } from './ExternalTaskPlan';
import { scopedExternalWork } from './externalWorkModel';
import { lineSummary, selectedStation, stationSearch, stationSummaries, stationWip } from './flowModel';

import '../page.css';
import './Flow.css';

export function FlowPage(): JSX.Element {
  usePageTitle('Flow');
  const [params] = useSearchParams();
  const scope = useFamilyScope();
  const report = useFlow(scope.family ? { family: scope.family } : {});
  // The three factory numbers ride the yield report, which is admin-only and
  // absent on a server that predates it: a read that is refused or answers
  // without the block simply shows no block, and the rest of the page is a
  // reader's whatever their role.
  const headline = useYield(scope.family ? { family: scope.family } : {});
  const { data, isPending, isError, error } = report;
  // Every age is read against one instant, so the list agrees with itself.
  const now = useMemo(() => new Date(), [data]);

  return (
    <div className="page page--wide" data-testid="flow-page">
      <PageHeader
        title="Flow"
        testId="flow-header"
        freshness={queryFreshness(report)}
        subtitle="Where the work in progress is stuck right now."
      />

      {headline.data?.headline ? (
        <section className="page__section" aria-labelledby="flow-headline">
          <h2 className="page__section-title" id="flow-headline">
            How the factory is doing
          </h2>
          <HeadlineTiles headline={headline.data.headline} testId="flow-headline-tiles" />
        </section>
      ) : null}

      {isPending ? (
        <LoadingState title="Loading the delivery line…" variant="message" />
      ) : isError ? (
        <FlowQueryState error={error} onRetry={() => void report.refetch()} />
      ) : (
        <FlowBody report={data} family={scope.family} params={params} now={now} />
      )}
    </div>
  );
}

function FlowBody({
  report,
  family,
  params,
  now,
}: {
  report: FlowReport;
  family: string | null;
  params: URLSearchParams;
  now: Date;
}): JSX.Element {
  const stations = stationSummaries(report);
  const station = selectedStation(params, report);
  const label = stations.find((candidate) => candidate.id === station)?.label ?? station ?? '';
  const empty = stations.every((candidate) => !candidate.total);
  const external = scopedExternalWork(report.external_work?.snapshots ?? [], family ?? '');
  if (empty && external.length > 0) {
    return <div className="flow__body" data-testid="flow-body">
      {external.map((snapshot) => <ExternalTaskPlan key={snapshot.source_repo} snapshot={snapshot} />)}
      {(report.external_work?.problems ?? []).map((problem) => <p role="status" key={problem}>{problem}</p>)}
    </div>;
  }
  return (
    <div className="flow__body" data-testid="flow-body">
      <WipStrip
        stations={stations}
        selected={station}
        searchFor={(id) => stationSearch(params, id)}
      />

      <p className="flow__coverage" data-testid="flow-coverage">
        {lineSummary(report)}
      </p>
      {external.map((snapshot) => <ExternalTaskPlan key={snapshot.source_repo} snapshot={snapshot} />)}
      {(report.external_work?.problems ?? []).map((problem) => <p role="status" key={problem}>{problem}</p>)}

      {empty ? (
        <ScopedEmptyState
          icon={RouteIcon}
          title="Nothing is in progress."
          description="No station has work at it right now."
        />
      ) : station ? (
        <StationPages key={station} family={family} station={station} label={label} now={now} />
      ) : null}
    </div>
  );
}

/** The picked station's own read, newest first, one page more per ask. */
function StationPages({
  family,
  station,
  label,
  now,
}: {
  family: string | null;
  station: string;
  label: string;
  now: Date;
}): JSX.Element {
  const pages = useFlowStation(family ? { family, station } : { station });
  if (pages.isPending) return <LoadingState title={`Loading ${label}…`} variant="message" />;
  if (!pages.data) {
    return <FlowQueryState error={pages.error} onRetry={() => void pages.refetch()} />;
  }
  return (
    <StationWipList
      station={station}
      label={label}
      wip={stationWip(pages.data.pages, station, now)}
      more={pages.isFetchingNextPage ? 'loading' : pages.isFetchNextPageError ? 'failed' : 'idle'}
      onMore={() => void pages.fetchNextPage()}
    />
  );
}
