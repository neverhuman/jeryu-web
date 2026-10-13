// YieldPage.tsx — spend against what reached main, at `/yield`.
//
// The agent factory records what every attempt, review and triage costs. This
// page turns that into one headline, what a merged change cost, and explains
// it underneath: how much of the spend reached main, what review added, what
// the routing experiment's arms do side by side, how the cost moves week by
// week, and which todos cost the most. Family comes from the shell's scope;
// the window and the breakdown's cut live in the address (`?days=`, `?by=`).

import { Coins, ServerOff } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import type {
  YieldBy,
  YieldExperiment,
  YieldReport,
  YieldRow,
  YieldTodoRef,
} from '../../api/types';
import { FamilyStrip } from '../../components/family/FamilyPills';
import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { useFamilyNames } from '../../components/family/useFamilyNames';
import { ScopedEmptyState } from '../../components/family/ScopedEmptyState';
import { PageHeader, queryFreshness } from '../../components/pageHeader';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PermissionDeniedState,
} from '../../components/state';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  isPipelineForbidden,
  isPipelineUnavailable,
  isPipelineUnreachable,
} from '../../hooks/usePipeline';
import { useYield } from '../../hooks/useYield';
import { UseThisWhen } from '../../layout/UseThisWhen';
import { pillClass } from '../../components/tone/tone';
import { todoHref } from '../shift/workPaths';
import { YieldFunnelBar } from './YieldFunnel';
import { YieldTrendChart } from './YieldTrendChart';
import {
  BY_PARAM,
  DEFAULT_BY,
  DEFAULT_WINDOW_DAYS,
  WINDOW_PARAM,
  YIELD_BYS,
  YIELD_WINDOWS,
  armLabel,
  armShare,
  formatCi,
  formatRate,
  formatUsd,
  groupLabel,
  outcomeSegments,
  parseBy,
  parseWindow,
  priceSourcesNote,
  sourceSegments,
  spendSummary,
  todoRefMeta,
  todoRefStatus,
  windowDates,
  yieldKpis,
} from './yieldModel';

import '../page.css';
import './Yield.css';

export function YieldPage(): JSX.Element {
  usePageTitle('Yield');
  const [params, setParams] = useSearchParams();
  const scope = useFamilyScope();
  const days = parseWindow(params);
  const by = parseBy(params);
  const dates = useMemo(() => windowDates(days, new Date()), [days]);
  const report = useYield({ ...(scope.family ? { family: scope.family } : {}), ...dates, by });
  const { data, isPending, isError, error, isPlaceholderData } = report;
  // While a new window loads, the old answer stays up: label it with the window
  // it was read for, not the one just picked.
  const [settledDays, setSettledDays] = useState(days);
  useEffect(() => {
    if (data && !isPlaceholderData) setSettledDays(days);
  }, [data, isPlaceholderData, days]);
  const shownDays = isPlaceholderData ? settledDays : days;

  const setParam = (name: string, value: string, fallback: string): void => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(name);
    else next.set(name, value);
    // A filter is not a new page: keep the reader where they are on the page.
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="page page--wide" data-testid="yield-page">
      <PageHeader
        title="Yield"
        testId="yield-header"
        freshness={queryFreshness(report)}
        subtitle="What the agents' work cost against what reached main: cost per merged change first, then where the rest of the spend went."
      >
        <UseThisWhen id="nav.yield" />
      </PageHeader>

      <YieldControls
        days={days}
        onDays={(value) => setParam(WINDOW_PARAM, String(value), String(DEFAULT_WINDOW_DAYS))}
      />

      {isPending ? (
        <LoadingState title="Loading what the work cost…" variant="message" />
      ) : isError ? (
        <YieldQueryState error={error} onRetry={() => void report.refetch()} />
      ) : (
        <div
          className={isPlaceholderData ? 'yield__body yield__body--updating' : 'yield__body'}
          aria-busy={isPlaceholderData}
          data-testid="yield-body"
        >
          {isPlaceholderData ? (
            <p className="yield__updating" role="status">
              {shownDays === days
                ? 'Updating…'
                : `Updating… showing the last ${shownDays} days until the ${days}-day read lands.`}
            </p>
          ) : null}
          {data.totals.todos === 0 ? (
            <ScopedEmptyState
              icon={Coins}
              title="No work in this window."
              description={`No attempt started between ${data.window.since} and ${data.window.until}. Pick a longer window, or come back once agents have worked.`}
            />
          ) : (
            <YieldBody
              data={data}
              days={shownDays}
              by={by}
              onBy={(value) => setParam(BY_PARAM, value, DEFAULT_BY)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function YieldControls({
  days,
  onDays,
}: {
  days: number;
  onDays: (days: number) => void;
}): JSX.Element {
  const scope = useFamilyScope();
  const families = useFamilyNames();
  return (
    <div className="yield__controls" data-testid="yield-controls">
      {families.names.length > 1 || scope.family ? (
        <FamilyStrip
          counts={families.names.map((name) => ({ family: name }))}
          family={scope.family}
          onPick={(name) => scope.setFamily(name)}
        />
      ) : null}
      <div className="yield__segmented" role="group" aria-label="Window">
        {YIELD_WINDOWS.map((value) => (
          <button
            key={value}
            type="button"
            className="yield__segment"
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
function YieldQueryState({ error, onRetry }: { error: unknown; onRetry: () => void }): JSX.Element {
  if (isPipelineUnavailable(error)) {
    return (
      <EmptyState
        icon={ServerOff}
        title="Not available on this server version."
        description="This server does not report spend yet. It appears once the forge is released with the yield API."
      />
    );
  }
  if (isPipelineForbidden(error)) {
    return (
      <PermissionDeniedState
        title="Only admins can see what the work cost."
        description="Spend is read from every family's todos and reviews, so it is admin-only for now."
      />
    );
  }
  if (isPipelineUnreachable(error)) {
    return (
      <ErrorState
        title="Cannot reach the forge."
        description="The request for spend did not arrive. The forge may be restarting, or this browser may be offline."
        onRetry={onRetry}
      />
    );
  }
  return <ErrorState title="Could not load what the work cost." error={error} onRetry={onRetry} />;
}

function YieldBody({
  data,
  days,
  by,
  onBy,
}: {
  data: YieldReport;
  days: number;
  by: YieldBy;
  onBy: (by: YieldBy) => void;
}): JSX.Element {
  const kpis = yieldKpis(data.totals);
  return (
    <>
      <section className="page__section" aria-labelledby="yield-kpis">
        <h2 className="page__section-title" id="yield-kpis">
          Last {days} days
        </h2>
        <div className="yield__tiles">
          {kpis.map((kpi, index) => (
            <article
              key={kpi.id}
              className={`yield__tile${index === 0 ? ' yield__tile--headline' : ''}`}
              data-testid={`yield-kpi-${kpi.id}`}
            >
              <div className="yield__tile-label">{kpi.label}</div>
              <div className="yield__tile-value">{kpi.value}</div>
              <div className="yield__tile-detail">{kpi.detail}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="page__section" aria-labelledby="yield-funnel">
        <h2 className="page__section-title" id="yield-funnel">
          Where the spend went
        </h2>
        <p className="yield__summary" data-testid="yield-spend-summary">
          {spendSummary(data.totals, days)}
        </p>
        <YieldFunnelBar
          label="By outcome"
          segments={outcomeSegments(data.totals)}
          testId="yield-funnel-outcome"
        />
        <YieldFunnelBar
          label="By work"
          segments={sourceSegments(data.totals)}
          testId="yield-funnel-source"
        />
      </section>

      <section className="page__section" aria-labelledby="yield-experiments">
        <h2 className="page__section-title" id="yield-experiments">
          Experiment arms
        </h2>
        {data.experiments.length === 0 ? (
          <p className="yield__summary" data-testid="yield-experiments-none">
            No routing experiment drew an arm in this window.
          </p>
        ) : (
          data.experiments.map((experiment) => (
            <ExperimentTable key={experiment.experiment} experiment={experiment} />
          ))
        )}
      </section>

      <section className="page__section" aria-labelledby="yield-trend-title">
        <h2 className="page__section-title" id="yield-trend-title">
          Cost per merged change, by week
        </h2>
        <YieldTrendChart weekly={data.weekly} order={data.groups.map((group) => group.group)} />
      </section>

      <section className="page__section" aria-labelledby="yield-breakdown">
        <div className="yield__section-head">
          <h2 className="page__section-title" id="yield-breakdown">
            Breakdown
          </h2>
          <div className="yield__segmented" role="group" aria-label="Break down by">
            {YIELD_BYS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="yield__segment"
                aria-pressed={option.id === by}
                onClick={() => onBy(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <BreakdownTable data={data} />
      </section>

      <div className="yield__lists">
        <TodoList
          id="yield-costliest"
          title="Costliest todos"
          refs={data.costliest}
          empty="No todo cost anything in this window."
        />
        <TodoList
          id="yield-scrap"
          title="Costliest scrap"
          refs={data.scrap}
          empty="Nothing was scrapped in this window."
        />
      </div>

      <p className="yield__footnote" data-testid="yield-price-sources">
        {priceSourcesNote(data.price_sources)} Window {data.window.since} to {data.window.until}{' '}
        (UTC).
      </p>
    </>
  );
}

/** The four rate columns of a row, shared by the arm and breakdown tables. */
function RateCells({ row }: { row: YieldRow }): JSX.Element {
  const ci = formatCi(row.usd_per_merged_ci95);
  return (
    <>
      <td className="yield__num">
        {formatUsd(row.usd_per_merged)}
        {ci ? <span className="yield__sub">{ci}</span> : null}
      </td>
      <td className="yield__num">{formatRate(row.yield)}</td>
      <td className="yield__num">{formatRate(row.first_pass_rate)}</td>
    </>
  );
}

function RateHeads(): JSX.Element {
  return (
    <>
      <th scope="col" className="yield__num">
        Cost per merged
      </th>
      <th scope="col" className="yield__num">
        Yield
      </th>
      <th scope="col" className="yield__num">
        First pass
      </th>
    </>
  );
}

/**
 * A table that scrolls sideways on a narrow screen. It is focusable, so the
 * columns past the edge can be reached and read without a mouse.
 */
function ScrollTable({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

function ExperimentTable({ experiment }: { experiment: YieldExperiment }): JSX.Element {
  return (
    <ScrollTable label={`Arms of ${experiment.experiment}`}>
      <table
        className="yield__table"
        data-testid={`yield-experiment-${experiment.experiment}`}
      >
        <caption className="yield__caption">{experiment.experiment}</caption>
        <thead>
          <tr>
            <th scope="col">Arm</th>
            <th scope="col" className="yield__num">
              Drawn
            </th>
            <th scope="col" className="yield__num">
              Todos
            </th>
            <th scope="col" className="yield__num">
              Merged
            </th>
            <th scope="col" className="yield__num">Reworked</th>
            <th scope="col" className="yield__num">Rework spend</th>
            <RateHeads />
            <th scope="col" className="yield__num">
              Spend
            </th>
          </tr>
        </thead>
        <tbody>
          {experiment.arms.map((arm) => (
            <tr key={`${arm.agent}:${arm.model}`} data-testid={`yield-arm-${arm.agent}-${arm.model}`}>
              <th scope="row">{armLabel(arm)}</th>
              <td className="yield__num">{armShare(arm)}</td>
              <td className="yield__num">{arm.row.todos}</td>
              <td className="yield__num">{arm.row.merged}</td>
              <td className="yield__num">{arm.row.reworked}</td>
              <td className="yield__num">{formatUsd(arm.row.rework_usd)}</td>
              {arm.enough_data ? (
                <RateCells row={arm.row} />
              ) : (
                <td colSpan={3} className="yield__not-enough">
                  Not enough data yet
                </td>
              )}
              <td className="yield__num">{formatUsd(arm.row.spend_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}

function BreakdownTable({ data }: { data: YieldReport }): JSX.Element {
  const cut = YIELD_BYS.find((option) => option.id === data.by)?.label ?? data.by;
  return (
    <ScrollTable label={`Spend by ${cut.toLowerCase()}`}>
      <table className="yield__table" data-testid="yield-breakdown-table">
        <thead>
          <tr>
            <th scope="col">{cut}</th>
            <th scope="col" className="yield__num">
              Todos
            </th>
            <th scope="col" className="yield__num">
              Merged
            </th>
            <RateHeads />
            <th scope="col" className="yield__num">
              Spend
            </th>
          </tr>
        </thead>
        <tbody>
          {data.groups.map((group) => (
            <tr key={group.group} data-testid={`yield-group-${group.group}`}>
              <th scope="row">{groupLabel(data.by, group.group)}</th>
              <td className="yield__num">{group.todos}</td>
              <td className="yield__num">{group.merged}</td>
              <RateCells row={group} />
              <td className="yield__num">{formatUsd(group.spend_usd)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr data-testid="yield-group-total">
            <th scope="row">All</th>
            <td className="yield__num">{data.totals.todos}</td>
            <td className="yield__num">{data.totals.merged}</td>
            <RateCells row={data.totals} />
            <td className="yield__num">{formatUsd(data.totals.spend_usd)}</td>
          </tr>
        </tfoot>
      </table>
    </ScrollTable>
  );
}

function TodoList({
  id,
  title,
  refs,
  empty,
}: {
  id: string;
  title: string;
  refs: YieldTodoRef[];
  empty: string;
}): JSX.Element {
  return (
    <section className="page__section yield__list" aria-labelledby={id} data-testid={id}>
      <h2 className="page__section-title" id={id}>
        {title}
      </h2>
      {refs.length === 0 ? (
        <p className="yield__summary">{empty}</p>
      ) : (
        <ol className="yield__todos">
          {refs.map((ref) => {
            const status = todoRefStatus(ref);
            return (
              <li key={ref.id} className="yield__todo">
                <div className="yield__todo-main">
                  <Link to={todoHref(ref.id)} className="yield__todo-title">
                    {ref.title || ref.id}
                  </Link>
                  <span className="yield__sub">
                    <span
                      className={pillClass(status.tone)}
                      title={status.hint || undefined}
                      data-testid={`yield-todo-status-${ref.id}`}
                    >
                      {status.label}
                    </span>{' '}
                    {todoRefMeta(ref)}
                    {ref.rework ? ' · rework' : ''}
                  </span>
                </div>
                <span className="yield__todo-spend">{formatUsd(ref.spend_usd)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
