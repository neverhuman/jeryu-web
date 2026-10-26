// FlowPage.tsx — where the work in progress is stuck right now.
//
// The strip names the nine stations with one number each and marks the
// bottleneck; below it, the station picked in the address (the bottleneck by
// default) lists its work in progress, oldest first. The family comes from the
// header's family scope. What is in progress does not depend on a window, so
// the page reads the server's default one.

import { Route as RouteIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { FlowReport } from '../../api/types';
import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { ScopedEmptyState } from '../../components/family/ScopedEmptyState';
import { PageHeader, queryFreshness } from '../../components/pageHeader';
import { LoadingState } from '../../components/state';
import { useFlow } from '../../hooks/useFlow';
import { usePageTitle } from '../../hooks/usePageTitle';
import { FlowQueryState } from './FlowQueryState';
import { StationWipList } from './StationWipList';
import { WipStrip } from './WipStrip';
import {
  lineCoverage,
  selectedStation,
  stationSearch,
  stationSummaries,
  stationWip,
} from './flowModel';

import '../page.css';
import './Flow.css';

export function FlowPage(): JSX.Element {
  usePageTitle('Flow');
  const [params] = useSearchParams();
  const scope = useFamilyScope();
  const report = useFlow(scope.family ? { family: scope.family } : {});
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

      {isPending ? (
        <LoadingState title="Loading the delivery line…" variant="message" />
      ) : isError ? (
        <FlowQueryState error={error} onRetry={() => void report.refetch()} />
      ) : (
        <FlowBody report={data} params={params} now={now} />
      )}
    </div>
  );
}

function FlowBody({
  report,
  params,
  now,
}: {
  report: FlowReport;
  params: URLSearchParams;
  now: Date;
}): JSX.Element {
  const stations = stationSummaries(report);
  const station = selectedStation(params, report);
  const coverage = lineCoverage(report);
  const label = stations.find((candidate) => candidate.id === station)?.label ?? station ?? '';
  return (
    <div className="flow__body" data-testid="flow-body">
      <WipStrip
        stations={stations}
        selected={station}
        searchFor={(id) => stationSearch(params, id)}
      />

      <p className="flow__coverage" data-testid="flow-coverage">
        {coverage.listed < coverage.total
          ? `${coverage.listed} of ${coverage.total} in progress listed`
          : `${coverage.total} in progress`}
        {report.topology?.families_truncated ? ' · some families are left out of this read' : ''}
      </p>

      {stations.every((candidate) => !candidate.total) ? (
        <ScopedEmptyState
          icon={RouteIcon}
          title="Nothing is in progress."
          description="No station has work at it right now."
        />
      ) : station ? (
        <StationWipList
          key={station}
          station={station}
          label={label}
          wip={stationWip(report, station, now)}
        />
      ) : null}
    </div>
  );
}
