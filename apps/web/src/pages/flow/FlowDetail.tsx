import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { FlowReport } from '../../api/types';
import type { FlowHistoryItem } from '../../api/types/flow';
import { runnersHref } from '../releaseBoard/links';
import { FlowPolicy } from './FlowPolicy';
import { FlowLots } from './FlowLots';
import { STATION_GUIDE } from './stationGuide';
import { useFlowHistory, useFlowLayout } from './useFlowDetail';

export const STATE_LABELS: Record<string, string> = {
  arrived: 'Arrived',
  started: 'Started',
  passed: 'Passed forward',
  rework: 'Returned for fixes',
  held: 'Entered hold',
  released: 'Hold released',
  failed: 'Execution failed'
};
const OUTCOMES = ['passed', 'rework', 'held', 'failed', 'released'];
import { safeFlowHref, safeFlowLogHref } from './flowModel';

interface Props {
  report: FlowReport;
  station: string;
  repo: string;
  days: number;
  family?: string;
  now: Date;
  onJourney: (keys: string[]) => void;
}
export function FlowDetail({
  report,
  station,
  repo,
  days,
  family,
  now,
  onJourney
}: Props) {
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState('outcomes');
  const day = params.get('day') ?? '';
  const state = params.get('state') ?? '';
  const lot = params.get('lot') ?? '';
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  const history = useFlowHistory({
    station,
    days,
    ...(family ? { family } : {}),
    ...(repo ? { repo } : {}),
    ...(day ? { day } : {}),
    ...(state ? { state } : {}),
    offset
  });
  const journey = useFlowHistory(
    { days: 90, ...(family ? { family } : {}), ...(lot ? { lot } : {}) },
    Boolean(lot)
  );
  const layout = useFlowLayout();
  const guide = STATION_GUIDE[station];
  const label = report.stations.find((s) => s.id === station)?.label ?? station;
  const tools =
    layout.data?.stations.find((s) => s.id === station)?.tools ?? [];
  const states = mode === 'arrivals' ? ['arrived', 'started'] : OUTCOMES;
  const entries = Object.entries(history.data?.daily ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const maximum = Math.max(
    1,
    ...entries.map(([, counts]) =>
      states.reduce((sum, s) => sum + (counts[s] ?? 0), 0)
    )
  );
  const change = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    next.delete('offset');
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true, preventScrollReset: true });
  };
  useEffect(() => {
    onJourney(
      lot
        ? (journey.data?.items ?? []).map((i) => `${i.repo ?? ''}/${i.station}`)
        : []
    );
  }, [lot, journey.data, onJourney]);
  if (!guide) return null;
  return (
    <section
      className="flow-detail"
      data-testid="flow-detail"
      aria-label={`${label} details`}
    >
      <header>
        <p className="flow-detail__eyebrow">
          Selected station · {repo || 'whole family'}
        </p>
        <h2>{label}</h2>
        <p>{guide.purpose}</p>
      </header>
      <FlowPolicy repo={repo} />
      <p className="flow__footnote">
        The guide below describes the step when enabled. Current repository
        rules determine whether it runs, passes through, or waits for a person.
      </p>
      <dl className="flow-detail__guide">
        <div>
          <dt>Responsible</dt>
          <dd>{guide.automation}</dd>
        </div>
        <div>
          <dt>Starts when</dt>
          <dd>{guide.trigger}</dd>
        </div>
        <div>
          <dt>Success →</dt>
          <dd>{guide.success}</dd>
        </div>
        <div>
          <dt>Failure ↩</dt>
          <dd>{guide.failure}</dd>
        </div>
        <div>
          <dt>Waiting / held ⏸</dt>
          <dd>{guide.hold}</dd>
        </div>
      </dl>
      <div className="flow-detail__services">
        <h3>Responsible services and runner pool</h3>
        {layout.isPending ? (
          <p>Loading service status…</p>
        ) : layout.isError ? (
          <p>
            Service status unavailable.{' '}
            <button onClick={() => void layout.refetch()}>Retry</button>
          </p>
        ) : tools.length ? (
          <ul>
            {tools.map((t) => (
              <li key={t.runnerId}>
                <Link to={runnersHref([t.runnerId])}>{t.runnerId}</Link> ·{' '}
                {t.host} · {t.online} · {t.load}
                {t.code?.version ? ` · ${t.code.version}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>No corresponding service heartbeat is recorded.</p>
        )}
        <Link to="/runners">All runners and automation</Link>
        <p className="flow__footnote">
          These are reporting services. A particular execution is assigned only
          when its evidence names a runner.
        </p>
      </div>
      <FlowLots
        report={report}
        station={station}
        now={now}
        onInspect={(id) => change({ lot: id })}
        repo={repo}
      />
      <div className="flow-detail__history">
        <h3>Daily activity · UTC</h3>
        <div
          className="flow__segmented"
          role="group"
          aria-label="Chart measure"
        >
          <button
            aria-pressed={mode === 'arrivals'}
            onClick={() => {
              setMode('arrivals');
              change({ state: '', day: '' });
            }}
          >
            Arrivals and starts
          </button>
          <button
            aria-pressed={mode === 'outcomes'}
            onClick={() => {
              setMode('outcomes');
              change({ state: '', day: '' });
            }}
          >
            Outcomes and holds
          </button>
        </div>
        <p className="flow__footnote">
          One bar per UTC day. Counts are recorded transitions, not distinct
          items. An item can fail and later pass. Today is incomplete.
        </p>
        {history.isPending ? (
          <p role="status">Loading station history…</p>
        ) : history.isError ? (
          <p role="alert">
            Station history is unavailable.{' '}
            <button onClick={() => void history.refetch()}>
              Retry history
            </button>
          </p>
        ) : (
          <>
            <div className="flow-chart__legend">
              {states.map((s) => (
                <span key={s}>
                  <i className={`flow-state--${s}`} />
                  {STATE_LABELS[s]}
                </span>
              ))}
            </div>
            <p className="flow__footnote">
              Scale: 0–{maximum} transitions per day
            </p>
            <div
              className="flow-chart"
              data-testid="flow-daily-chart"
              role="group"
              aria-label="Daily station transitions"
            >
              {entries.map(([date, counts]) => (
                <div
                  key={date}
                  className={`flow-chart__day${date === day ? ' is-active' : ''}`}
                >
                  <div className="flow-chart__stack">
                    {states.map((s) =>
                      (counts[s] ?? 0) > 0 ? (
                        <button
                          key={s}
                          className={`flow-chart__segment flow-state--${s}`}
                          style={{
                            height: `${((counts[s] ?? 0) / maximum) * 100}%`
                          }}
                          title={`${date}: ${STATE_LABELS[s]} ${counts[s]}`}
                          aria-label={`${date}: ${STATE_LABELS[s]} ${counts[s]}`}
                          aria-pressed={date === day && s === state}
                          onClick={() => change({ day: date, state: s })}
                        />
                      ) : null
                    )}
                  </div>
                  <button
                    className="flow-chart__date"
                    title={date}
                    aria-label={`All transitions on ${date}`}
                    onClick={() => change({ day: date, state: '' })}
                  >
                    {date.slice(5)}
                  </button>
                </div>
              ))}
            </div>
            <p className="flow__footnote">
              Detailed hold and execution evidence starts{' '}
              {history.data?.detailed_since}. Earlier bars contain only
              recoverable arrival, start, and exit records.
            </p>
            <div className="flow-detail__filter">
              <strong>
                {history.data?.total ?? 0} transitions{day ? ` on ${day}` : ''}
                {state ? ` · ${STATE_LABELS[state] ?? state}` : ''}
              </strong>
              {(day || state) && (
                <button onClick={() => change({ day: '', state: '' })}>
                  Clear chart filter
                </button>
              )}
            </div>
            <ol className="flow-evidence">
              {history.data?.items.map((item) => (
                <Evidence
                  key={`${item.event_seq}-${item.lot_id}-${item.station}-${item.state}`}
                  item={item}
                  onInspect={() => change({ lot: item.lot_id })}
                />
              ))}
            </ol>
            {history.data?.total === 0 && (
              <p>No recorded transitions match this selection.</p>
            )}
            <div className="flow__segmented">
              <button
                disabled={offset === 0}
                onClick={() =>
                  change({ offset: String(Math.max(0, offset - 100)) })
                }
              >
                Previous 100
              </button>
              <button
                disabled={offset + 100 >= (history.data?.total ?? 0)}
                onClick={() => change({ offset: String(offset + 100) })}
              >
                Next 100
              </button>
            </div>
          </>
        )}
      </div>
      {lot && (
        <section
          className="flow-detail__journey"
          data-testid="flow-item-journey"
          aria-label="Item journey"
        >
          <h3>{lot} · recorded journey</h3>
          <button onClick={() => change({ lot: '' })}>Close journey</button>
          <p>
            Station evidence highlights the map. Last 90 days; up to 100 most
            recent transitions.
          </p>
          {journey.isPending ? (
            <p>Loading journey…</p>
          ) : journey.isError ? (
            <p>
              Journey evidence unavailable.{' '}
              <button onClick={() => void journey.refetch()}>
                Retry journey
              </button>
            </p>
          ) : (
            <>
              <ol className="flow-evidence">
                {journey.data?.items.map((item) => (
                  <Evidence
                    key={`${item.event_seq}-${item.station}-${item.state}`}
                    item={item}
                  />
                ))}
              </ol>
              {journey.data?.deliveries.map((d, i) => (
                <p key={i}>
                  <Link to="/releases">
                    {d.release ?? d.revision.slice(0, 12)}
                  </Link>{' '}
                  · {d.kind} · {d.repo}@{d.revision.slice(0, 12)} · {d.ts}
                </p>
              ))}
              {Boolean(journey.data?.related_items?.length) && (
                <div>
                  <h4>Other changes carried by these release events</h4>
                  <ul>
                    {journey.data?.related_items?.map((item) => (
                      <li key={item.lot_id}>
                        <button onClick={() => change({ lot: item.lot_id })}>
                          {item.lot_id}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!journey.data?.deliveries.length && (
                <p>No verified release membership is recorded for this item.</p>
              )}
            </>
          )}
        </section>
      )}
    </section>
  );
}
function Evidence({
  item,
  onInspect
}: {
  item: FlowHistoryItem;
  onInspect?: () => void;
}) {
  const href = safeFlowHref(item.href);
  return (
    <li>
      <div className="flow-evidence__head">
        <time>{item.ts.replace('T', ' ').replace('Z', ' UTC')}</time>
        <span className={`flow-evidence__state flow-state--${item.state}`}>
          {STATE_LABELS[item.state] ?? item.state}
        </span>
        <span>{item.station}</span>
      </div>
      <div>
        {href ? (
          <Link to={href}>{item.lot_id}</Link>
        ) : (
          <span>{item.lot_id}</span>
        )}{' '}
        {onInspect && <button onClick={onInspect}>Inspect journey</button>}
      </div>
      {item.title && <strong>{item.title}</strong>}
      <p>
        {item.summary ??
          'Historical station record; execution description was not retained.'}
      </p>
      <small>
        {item.repo}
        {item.sha
          ? ` · revision ${item.sha.slice(0, 12)}`
          : ' · revision not recorded'}{' '}
        ·{' '}
        {item.runner ? (
          <Link to={runnersHref([item.runner])}>Runner {item.runner}</Link>
        ) : (
          'runner not recorded'
        )}
      </small>
      {safeFlowLogHref(item.log_url) && (
        <a
          href={safeFlowLogHref(item.log_url)!}
          target="_blank"
          rel="noopener noreferrer"
        >
          Execution logs
        </a>
      )}
    </li>
  );
}
