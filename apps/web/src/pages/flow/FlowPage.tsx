// FlowPage.tsx — `/flow`: where work sits on the delivery line.
//
// Live mode lays the line out as stations, left to right: what is at each one
// now, how long it waits there against how long the step itself takes, where
// work loops back, and which station holds the most waiting. The strip at the
// top is the whole line in one row — the same component Activity carries — and
// says the cycle time, the X-factor (how many times longer the work took than
// the work itself) and the WIP. Clicking a station lists its lots, oldest
// first, with an estimate; a lot opens its own page, where its trace is.
//
// Family comes from the shell's scope; the window and the picked station live
// in the address (`?days=`, `?station=`, `?mode=`), so a screen can be sent to
// somebody else as a link. Changing a filter is not a new page: the previous
// answer stays up, dimmed, until the next one lands.
//
// Contract: jeryu-deploy `docs/flow.md`, ADR 0004. Nothing here is a fixture:
// a number the flow ledger cannot support says so.

import { Route as RouteIcon, ServerOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { FamilyStrip } from '../../components/family/FamilyPills';
import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { useFamilyNames } from '../../components/family/useFamilyNames';
import { LineStrip } from '../../components/flow/LineStrip';
import { PageHeader, queryFreshness } from '../../components/pageHeader';
import { ScopedEmptyState } from '../../components/family/ScopedEmptyState';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PermissionDeniedState,
} from '../../components/state';
import { pillClass } from '../../components/tone/tone';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  isPipelineForbidden,
  isPipelineUnavailable,
  isPipelineUnreachable,
} from '../../hooks/usePipeline';
import { useFlow } from '../../hooks/useFlow';
import { UseThisWhen } from '../../layout/UseThisWhen';
import { FlowLots } from './FlowLots';
import { FlowStations } from './FlowStations';
import {
  DEFAULT_WINDOW_DAYS,
  FLOW_WINDOWS,
  STATION_PARAM,
  WINDOW_PARAM,
  bottleneck,
  parseMode,
  parseStation,
  parseWindow,
} from './flowModel';

import '../page.css';
import './Flow.css';

export function FlowPage(): JSX.Element {
  usePageTitle('Flow');
  const [params, setParams] = useSearchParams();
  const scope = useFamilyScope();
  const days = parseWindow(params);
  const mode = parseMode(params);
  const report = useFlow({ ...(scope.family ? { family: scope.family } : {}), days });
  const { data, isPending, isError, error, isPlaceholderData } = report;
  // While a new window loads, the old answer stays up: label it with the
  // window it was read for, not the one just picked.
  const [settledDays, setSettledDays] = useState(days);
  useEffect(() => {
    if (data && !isPlaceholderData) setSettledDays(days);
  }, [data, isPlaceholderData, days]);
  const shownDays = isPlaceholderData ? settledDays : days;
  const station = parseStation(params, data);
  // The lots' ages are read against one instant, so a list does not disagree
  // with itself row by row.
  const now = useMemo(() => new Date(), [data]);

  const setParam = (name: string, value: string, fallback: string): void => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(name);
    else next.set(name, value);
    // A filter is not a new page: keep the reader where they are on the page.
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const held = data ? bottleneck(data) : null;

  return (
    <div className="page page--wide" data-testid="flow-page">
      <PageHeader
        title="Flow"
        testId="flow-header"
        freshness={queryFreshness(report)}
        subtitle="Where work sits on the delivery line, how long it waits at each step, where it loops back, and which step is the bottleneck."
        badges={
          held ? (
            <span className={pillClass('warn')} data-testid="flow-bottleneck-badge">
              {held.label} holds the most waiting
            </span>
          ) : null
        }
      >
        <UseThisWhen id="nav.flow" />
      </PageHeader>

      <FlowControls
        days={days}
        onDays={(value) => setParam(WINDOW_PARAM, String(value), String(DEFAULT_WINDOW_DAYS))}
      />

      {mode === 'layout' ? (
        <EmptyState
          icon={RouteIcon}
          title="Layout is not on this page yet."
          description="Live mode is here: the stations, their waits and the bottleneck. The tools serving each station are on Runners until Layout lands."
          action={<Link to="/runners">Runners</Link>}
        />
      ) : isPending ? (
        <LoadingState title="Loading the delivery line…" variant="message" />
      ) : isError ? (
        <FlowQueryState error={error} onRetry={() => void report.refetch()} />
      ) : (
        <div
          className={isPlaceholderData ? 'flow__body flow__body--updating' : 'flow__body'}
          aria-busy={isPlaceholderData}
          data-testid="flow-body"
        >
          {isPlaceholderData ? (
            <p className="flow__updating" role="status">
              {shownDays === days
                ? 'Updating…'
                : `Updating… showing the last ${shownDays} days until the ${days}-day read lands.`}
            </p>
          ) : null}

          <LineStrip
            report={data}
            totals
            {...(scope.family ? { family: scope.family } : {})}
            activeStation={station}
            onStation={(id) => setParam(STATION_PARAM, id === station ? '' : id, '')}
          />

          {data.line.wip === 0 && data.line.finished === 0 ? (
            <ScopedEmptyState
              icon={RouteIcon}
              title="No work on the line in this window."
              description={`Nothing entered or left a station between ${data.window.since} and ${data.window.until}. Pick a longer window, or come back once work is moving.`}
            />
          ) : null}

          <section className="page__section" aria-labelledby="flow-stations-title">
            <h2 className="page__section-title" id="flow-stations-title">
              Stations · last {shownDays} days
            </h2>
            <FlowStations
              report={data}
              active={station}
              onStation={(id) => setParam(STATION_PARAM, id === station ? '' : id, '')}
            />
          </section>

          {station ? (
            <FlowLots report={data} station={station} now={now} />
          ) : (
            <p className="flow__hint" data-testid="flow-lots-hint">
              Pick a station to list the work waiting at it, oldest first.
            </p>
          )}

          <p className="flow__footnote" data-testid="flow-footnote">
            Read from the flow ledger, projected from the pipeline event log. Window{' '}
            {data.window.since} to {data.window.until}.
          </p>
        </div>
      )}
    </div>
  );
}

function FlowControls({
  days,
  onDays,
}: {
  days: number;
  onDays: (days: number) => void;
}): JSX.Element {
  const scope = useFamilyScope();
  const families = useFamilyNames();
  return (
    <div className="flow__controls" data-testid="flow-controls">
      {families.names.length > 1 || scope.family ? (
        <FamilyStrip
          counts={families.names.map((name) => ({ family: name }))}
          family={scope.family}
          onPick={(name) => scope.setFamily(name)}
        />
      ) : null}
      <div className="flow__segmented" role="group" aria-label="Window">
        {FLOW_WINDOWS.map((value) => (
          <button
            key={value}
            type="button"
            className="flow__segment"
            aria-pressed={value === days}
            onClick={() => onDays(value)}
          >
            {value} d
          </button>
        ))}
      </div>
    </div>
  );
}

/** The non-data states: older server, not an admin, unreachable, failed. */
function FlowQueryState({ error, onRetry }: { error: unknown; onRetry: () => void }): JSX.Element {
  if (isPipelineUnavailable(error)) {
    return (
      <EmptyState
        icon={ServerOff}
        title="Not available on this server version."
        description="This server does not report the delivery line yet. It appears once the forge is released with the flow API."
      />
    );
  }
  if (isPipelineForbidden(error)) {
    return (
      <PermissionDeniedState
        title="Only admins can see the delivery line."
        description="The line is read from every family's events, so it is admin-only for now."
      />
    );
  }
  if (isPipelineUnreachable(error)) {
    return (
      <ErrorState
        title="Cannot reach the forge."
        description="The request for the delivery line did not arrive. The forge may be restarting, or this browser may be offline."
        onRetry={onRetry}
      />
    );
  }
  return <ErrorState title="Could not load the delivery line." error={error} onRetry={onRetry} />;
}
