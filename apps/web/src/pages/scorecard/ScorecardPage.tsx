import { HypothesisOutcomes } from './HypothesisOutcomes';
// ScorecardPage.tsx — outcome delivery scorecard at `/scorecard`.

import { BarChart3, ServerOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import type { ScorecardMetric, ScorecardWindow } from '../../api/types';
import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { PageHeader, queryFreshness } from '../../components/pageHeader';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '../../components/state';
import { usePageTitle } from '../../hooks/usePageTitle';
import { isPipelineForbidden, isPipelineUnavailable, isPipelineUnreachable } from '../../hooks/usePipeline';
import { useScorecard } from '../../hooks/useScorecard';
import {
  DEFAULT_SCORECARD_WINDOW,
  HEADLINE_TILES,
  SCORECARD_REPO_PARAM,
  SCORECARD_TAB_PARAM,
  SCORECARD_WINDOW_PARAM,
  SCORECARD_WINDOWS,
  SECTIONS,
  drilldownHref,
  formatDelta,
  formatMetricValue,
  metric,
  parseTab,
  parseWindow,
  sparklinePoints,
  unknownText,
  windowLabel,
  type MetricKind,
  type ScorecardTab,
  type TileSpec,
} from './scorecardModel';

import '../page.css';
import './Scorecard.css';

export function ScorecardPage(): JSX.Element {
  usePageTitle('Scorecard');
  const [params, setParams] = useSearchParams();
  const scope = useFamilyScope();
  const window = parseWindow(params);
  const tab = parseTab(params);
  const repo = params.get(SCORECARD_REPO_PARAM)?.trim() ?? '';
  const query = useMemo(
    () => ({ window, ...(scope.family ? { family: scope.family } : {}), ...(repo ? { repo } : {}) }),
    [scope.family, window, repo]
  );
  const report = useScorecard(query);
  const { data, isPending, isError, error } = report;

  const setParam = (name: string, value: string, fallback = ''): void => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(name);
    else next.set(name, value);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="page page--wide scorecard" data-testid="scorecard-page">
      <PageHeader
        title="Scorecard"
        testId="scorecard-header"
        freshness={queryFreshness(report)}
        subtitle="Delivery outcomes across speed, quality, recovery, economics and capacity."
      />

      <ScorecardControls
        key={repo}
        window={window}
        tab={tab}
        repo={repo}
        onWindow={(value) => setParam(SCORECARD_WINDOW_PARAM, value, DEFAULT_SCORECARD_WINDOW)}
        onTab={(value) => setParam(SCORECARD_TAB_PARAM, value === 'outcomes' ? value : '', '')}
        onRepo={(value) => setParam(SCORECARD_REPO_PARAM, value.trim(), '')}
      />

      {isPending ? (
        <LoadingState title="Loading scorecard…" variant="message" />
      ) : isError ? (
        <ScorecardQueryState error={error} onRetry={() => void report.refetch()} />
      ) : tab === 'outcomes' ? (
        <OutcomesTab metrics={data.metrics} window={window} family={scope.family} repo={repo} />
      ) : (
        <ScorecardBody data={data.metrics} window={window} family={scope.family} repo={repo} />
      )}
    </div>
  );
}

function ScorecardControls({
  window,
  tab,
  repo,
  onWindow,
  onTab,
  onRepo,
}: {
  window: ScorecardWindow;
  tab: ScorecardTab;
  repo: string;
  onWindow: (value: string) => void;
  onTab: (value: ScorecardTab) => void;
  onRepo: (value: string) => void;
}): JSX.Element {
  const [repoDraft, setRepoDraft] = useState(repo);
  return (
    <div className="scorecard__controls" data-testid="scorecard-controls">
      <div className="scorecard__segmented" role="group" aria-label="Window">
        {SCORECARD_WINDOWS.map((value) => (
          <button
            key={value}
            type="button"
            className="scorecard__segment"
            aria-pressed={value === window}
            onClick={() => onWindow(value)}
          >
            {windowLabel(value)}
          </button>
        ))}
      </div>
      <form className="scorecard__repo-filter" onSubmit={(event) => {
        event.preventDefault();
        onRepo(repoDraft.trim());
      }}>
        <label>
          <span>Repository</span>
          <input
            className="form-input"
            value={repoDraft}
            placeholder="owner/repo"
            onChange={(event) => setRepoDraft(event.target.value)}
          />
        </label>
        <button type="submit" className="scorecard__segment">Apply</button>
      </form>
      <div className="scorecard__tabs" role="tablist" aria-label="Scorecard view">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'scorecard'}
          className="scorecard__tab"
          onClick={() => onTab('scorecard')}
        >
          Scorecard
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'outcomes'}
          className="scorecard__tab"
          onClick={() => onTab('outcomes')}
        >
          Outcomes
        </button>
      </div>
    </div>
  );
}

function ScorecardQueryState({ error, onRetry }: { error: unknown; onRetry: () => void }): JSX.Element {
  if (isPipelineUnavailable(error)) {
    return (
      <EmptyState
        icon={ServerOff}
        title="Not available on this server version."
        description="The scorecard appears once the forge is released with the scorecard API."
      />
    );
  }
  if (isPipelineForbidden(error)) {
    return (
      <PermissionDeniedState
        title="Only admins can see the scorecard."
        description="The scorecard joins work, pull requests, outcomes and cost data across repositories."
      />
    );
  }
  if (isPipelineUnreachable(error)) {
    return (
      <ErrorState
        title="Cannot reach the forge."
        description="The request for the scorecard did not arrive."
        onRetry={onRetry}
      />
    );
  }
  return <ErrorState title="Could not load the scorecard." error={error} onRetry={onRetry} />;
}

function ScorecardBody({
  data,
  window,
  family,
  repo,
}: {
  data: Record<string, ScorecardMetric>;
  window: ScorecardWindow;
  family: string;
  repo: string;
}): JSX.Element {
  return (
    <div className="scorecard__body" data-testid="scorecard-body">
      <section className="page__section" aria-labelledby="scorecard-headline">
        <h2 className="page__section-title" id="scorecard-headline">
          Headline
        </h2>
        <div className="scorecard__headline" data-testid="scorecard-headline-strip">
          {HEADLINE_TILES.map((tile) => (
            <MetricTile
              key={tile.id}
              spec={tile}
              metric={metric(data, tile.id)}
              window={window}
              family={family}
              repo={repo}
              supplement={tile.id === 'lead_time_p50' ? metric(data, 'lead_time_p85') : undefined}
            />
          ))}
        </div>
      </section>

      <section className="page__section" aria-labelledby="scorecard-stations">
        <h2 className="page__section-title" id="scorecard-stations">
          Flow stations
        </h2>
        <StationBreakdown metric={metric(data, 'station_breakdown')} />
        <WipStrip metric={metric(data, 'wip_by_station')} />
      </section>

      {SECTIONS.map((section) => (
        <section
          key={section.title}
          className="page__section"
          aria-labelledby={`scorecard-${section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
        >
          <h2
            className="page__section-title"
            id={`scorecard-${section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          >
            {section.title}
          </h2>
          <div
            className={section.title === 'Volume' ? 'scorecard__tiles scorecard__tiles--paired' : 'scorecard__tiles'}
            data-testid={section.title === 'Volume' ? 'scorecard-volume-pairs' : undefined}
          >
            {section.tiles.map((tile) => (
              <MetricTile
                key={`${section.title}-${tile.id}`}
                spec={tile}
                metric={metric(data, tile.id)}
                window={window}
                family={family}
                repo={repo}
                testId={`scorecard-tile-${section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${tile.id}`}
                context={section.title === 'Volume' && (tile.id === 'completed_work_items_per_day' || tile.id === 'releases_per_day' || tile.id === 'surviving_net_lines_per_day')}
              />
            ))}
          </div>
          {section.title === 'Volume' ? (
            <div className="scorecard__context" data-testid="scorecard-volume-context">
              <SmallMetric label="PRs/day" metric={metric(data, 'prs_merged_per_day')} kind="count" />
              <SmallMetric label="Raw lines/day" metric={metric(data, 'raw_net_lines_per_day')} kind="count" />
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function MetricTile({
  spec,
  metric: m,
  window,
  family,
  repo,
  supplement,
  context = false,
  testId,
}: {
  spec: TileSpec;
  metric: ScorecardMetric;
  window: ScorecardWindow;
  family: string;
  repo: string;
  supplement?: ScorecardMetric;
  context?: boolean;
  testId?: string;
}): JSX.Element {
  const unknown = m.value === null;
  const points = sparklinePoints(m.daily);
  return (
    <article
      className={`scorecard-tile${context ? ' scorecard-tile--context' : ''}${unknown ? ' scorecard-tile--unknown' : ''}`}
      data-testid={testId ?? `scorecard-tile-${spec.id}`}
    >
      <div className="scorecard-tile__top">
        <h3>{spec.label}</h3>
        <BarChart3 aria-hidden="true" size={18} />
      </div>
      <p className="scorecard-tile__value">
        {unknown ? unknownText(m) : formatMetricValue(m.value, spec.kind)}
      </p>
      {supplement && supplement.value !== null ? (
        <p className="scorecard-tile__sub">p85 {formatMetricValue(supplement.value, spec.kind)}</p>
      ) : null}
      <p className="scorecard-tile__delta">{formatDelta(m.value, m.previous, spec.kind)}</p>
      <svg className="scorecard-tile__spark" viewBox="0 0 100 32" role="img" aria-label={`${spec.label} trend`}>
        <line x1="0" x2="100" y1="28" y2="28" />
        {points ? <polyline points={points} /> : null}
      </svg>
      <div className="scorecard-tile__meta">
        <span>{m.sample_size} samples</span>
        <Link to={drilldownHref(spec.id, window, family, repo)}>{spec.rowLink}</Link>
      </div>
      <details className="scorecard-tile__measure">
        <summary>How measured</summary>
        <p>{m.source}</p>
        {m.detail ? <pre>{JSON.stringify(m.detail, null, 2)}</pre> : null}
      </details>
    </article>
  );
}

function SmallMetric({ label, metric: m, kind }: { label: string; metric: ScorecardMetric; kind: MetricKind }): JSX.Element {
  return (
    <div className="scorecard__small-metric">
      <span>{label}</span>
      <strong>{m.value === null ? unknownText(m) : formatMetricValue(m.value, kind)}</strong>
    </div>
  );
}

function StationBreakdown({ metric: m }: { metric: ScorecardMetric }): JSX.Element {
  if (m.value === null || typeof m.value !== 'object') {
    return <p className="scorecard__unknown-line">{unknownText(m)}</p>;
  }
  const entries = Object.entries(m.value as Record<string, { total_p50_s?: number; queue_p50_s?: number; process_p50_s?: number }>);
  const max = Math.max(1, ...entries.map(([, station]) => station.total_p50_s ?? 0));
  return (
    <div className="scorecard-stations" data-testid="scorecard-station-breakdown">
      {entries.map(([name, station]) => {
        const queue = station.queue_p50_s ?? 0;
        const process = station.process_p50_s ?? 0;
        return (
          <div key={name} className="scorecard-stations__row">
            <span className="scorecard-stations__label">{name}</span>
            <span className="scorecard-stations__bar">
              <span className="scorecard-stations__queue" style={{ flexGrow: queue, maxWidth: `${Math.max(4, (queue / max) * 100)}%` }} />
              <span className="scorecard-stations__process" style={{ flexGrow: process, maxWidth: `${Math.max(4, (process / max) * 100)}%` }} />
            </span>
            <span className="scorecard-stations__time">{formatMetricValue(station.total_p50_s ?? null, 'duration')}</span>
          </div>
        );
      })}
    </div>
  );
}

function WipStrip({ metric: m }: { metric: ScorecardMetric }): JSX.Element {
  if (m.value === null || typeof m.value !== 'object') {
    return <p className="scorecard__unknown-line">{unknownText(m)}</p>;
  }
  const entries = Object.entries(m.value as Record<string, { waiting?: number; active?: number; held?: number }>);
  return (
    <Link className="scorecard-wip" to="/work" data-testid="scorecard-wip-strip">
      {entries.map(([name, counts]) => {
        const total = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.held ?? 0);
        return (
          <span key={name} className="scorecard-wip__station">
            <span>{name}</span>
            <strong>{total}</strong>
          </span>
        );
      })}
    </Link>
  );
}

function OutcomesTab({
  metrics,
  window,
  family,
  repo,
}: {
  metrics: Record<string, ScorecardMetric>;
  window: ScorecardWindow;
  family: string;
  repo: string;
}): JSX.Element {
  const hypotheses = metric(metrics, 'hypotheses_checked_and_met');
  const monthly = !!hypotheses.value && typeof hypotheses.value === 'object' && 'month' in hypotheses.value;
  return (
    <section className="page__section" aria-labelledby="scorecard-outcomes" data-testid="scorecard-outcomes">
      <h2 className="page__section-title" id="scorecard-outcomes">
        Outcomes
      </h2>
      <HypothesisOutcomes metric={metric(metrics, 'hypotheses_checked_and_met')} />
      <div className="scorecard__tiles">
        {monthly ? null : <MetricTile
          spec={{ id: 'hypotheses_checked_and_met', label: 'Hypotheses checked and met', kind: 'object', rowLink: 'Rows' }}
          metric={hypotheses}
          window={window}
          family={family}
          repo={repo}
        />}
        <MetricTile
          spec={{ id: 'successful_changes', label: 'Successful changes', kind: 'count', rowLink: 'Todos' }}
          metric={metric(metrics, 'successful_changes')}
          window={window}
          family={family}
          repo={repo}
        />
      </div>
    </section>
  );
}
