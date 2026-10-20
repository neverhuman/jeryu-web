// Flow maps repository decisions and immutable item evidence (Deploy ADR 0013).

import { Route as RouteIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { FamilyStrip } from '../../components/family/FamilyPills';
import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { useFamilyNames } from '../../components/family/useFamilyNames';
import { FlowMap } from './FlowMap';
import { LineStrip } from '../../components/flow/LineStrip';
import { FlowDetail } from './FlowDetail';
import { FlowClosures } from './FlowClosures';
import { FlowLayoutView } from './FlowLayout';
import { FlowQueryState } from './FlowQueryState';
import { PageHeader, queryFreshness } from '../../components/pageHeader';
import { ScopedEmptyState } from '../../components/family/ScopedEmptyState';
import { LoadingState } from '../../components/state';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useFlow } from '../../hooks/useFlow';
import { UseThisWhen } from '../../layout/UseThisWhen';
import {
  DEFAULT_MODE,
  DEFAULT_WINDOW_DAYS,
  FLOW_MODES,
  FLOW_WINDOWS,
  MODE_PARAM,
  WINDOW_PARAM,
  parseMode,
  type FlowMode,
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
  const selectedRepo = params.get("repo") ?? "";
  const [journey, setJourney] = useState<string[]>([]);
  const report = useFlow({ ...(scope.family ? { family: scope.family } : {}), ...(selectedRepo ? { repo: selectedRepo } : {}), days });
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

  const pickStation = (id: string, repo = '') => {
    const next = new URLSearchParams(params);
    next.set('station', id);
    if (repo) next.set('repo', repo); else next.delete('repo');
    for (const key of ['day', 'state', 'offset', 'lot']) next.delete(key);
    setJourney([]);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="page page--wide" data-testid="flow-page">
      <PageHeader
        title="Flow"
        testId="flow-header"
        freshness={queryFreshness(report)}
        subtitle="Follow changes across repositories, decisions, review, checks, and release. Pick a station to inspect its work and daily history."

      >
        <UseThisWhen id="nav.flow" />
      </PageHeader>

      <FlowControls
        days={days}
        mode={mode}
        onMode={(value) => setParam(MODE_PARAM, value, DEFAULT_MODE)}
        onDays={(value) => setParam(WINDOW_PARAM, String(value), String(DEFAULT_WINDOW_DAYS))}
      />

      {mode === 'layout' ? (
        <FlowLayoutView report={data} />
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

          <LineStrip report={data} activeStation={station} onStation={pickStation} />

          <div className="flow-summary"><strong>{data.line.wip} recorded work in progress</strong><span>{data.line.finished} verified completions in {shownDays} days</span><span>Parallel visits overlap. Uncorrelated work remains unresolved.</span></div>

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
            <FlowMap report={data} active={station} repo={selectedRepo} onStation={pickStation} journey={journey} />
          </section>
          <FlowClosures report={data} station={station} onInspect={(lot, at) => {
            const next = new URLSearchParams(params);
            next.set('station', at); next.set('lot', lot);
            for (const key of ['day', 'state', 'offset']) next.delete(key);
            setParams(next, { replace: true, preventScrollReset: true });
          }} />
          {station ? <FlowDetail key={`${scope.family ?? ''}-${selectedRepo}-${station}`} report={data} station={station} repo={selectedRepo} days={shownDays} now={now} {...(scope.family ? { family: scope.family } : {})} onJourney={setJourney} /> : <p className="flow__hint" data-testid="flow-lots-hint">Pick a station for its purpose, services, current work, and daily activity.</p>}

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
  mode,
  onMode,
  onDays,
}: {
  days: number;
  mode: FlowMode;
  onMode: (mode: FlowMode) => void;
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
      <div className="flow__segmented" role="group" aria-label="Mode">
        {FLOW_MODES.map((value) => (
          <button
            key={value}
            type="button"
            className="flow__segment"
            aria-pressed={value === mode}
            data-testid={`flow-mode-${value}`}
            onClick={() => onMode(value)}
          >
            {value === 'live' ? 'Live' : 'Layout'}
          </button>
        ))}
      </div>
      {mode === 'layout' ? null : (
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
      )}
    </div>
  );
}
