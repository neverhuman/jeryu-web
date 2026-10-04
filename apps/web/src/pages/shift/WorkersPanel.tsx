// WorkersPanel.tsx — everything about the worker slots, shown when the
// workers strip on the Work page is opened.
//
// Live table of worker-slot heartbeats (healthy = seen within 120 s), a
// 24h / 7d swim-lane timeline per slot, and an hourly capacity chart of
// planned vs busy slots and queue depth.

import { Activity, ServerCog } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { ShiftWorker } from '../../api/types';
import { EmptyState, LoadingState } from '../../components/state';
import { useShiftWorkers, useShiftWorkersHistory } from '../../hooks/useShift';
import { ShiftError } from './shiftCommon';
import { ShiftCapacityChart, ShiftTimeline } from './ShiftCharts';
import { splitWorkers } from './shiftModel';
import { When } from '../../format/When';
import { splitSupervisors } from './workersModel';
import { todoHref } from './workPaths';

import '../page.css';
import './Shift.css';

const RANGES = [
  { hours: 24, label: '24h' },
  { hours: 168, label: '7d' },
] as const;

export function WorkersPanel(): JSX.Element {
  const workers = useShiftWorkers();
  const [hours, setHours] = useState<number>(24);
  const history = useShiftWorkersHistory(hours);
  const all = workers.data?.workers ?? [];
  const [showStale, setShowStale] = useState(false);
  // Slots unseen for over an hour are ghosts of old runs: hidden until asked for.
  const { shown, hidden } = splitWorkers(all, new Date());
  const [showSupervisors, setShowSupervisors] = useState(false);
  // A supervisor starts and stops workers and never carries a todo: folded away.
  const current = splitSupervisors(showStale ? all : shown);
  const list = showSupervisors ? [...current.workers, ...current.supervisors] : current.workers;
  const healthy = list.filter((w) => w.healthy).length;

  return (
    <div className="work-workers__panel" data-testid="shift-workers-panel">
      <section className="shift__section" aria-label="Live workers">
        <div className="shift__toolbar">
          <h2 className="page__section-title">
            Live · {healthy} of {list.length} healthy
          </h2>
          {current.supervisors.length > 0 ? (
            <button
              type="button"
              className="action-button action-button--ghost"
              aria-pressed={showSupervisors}
              onClick={() => setShowSupervisors((v) => !v)}
            >
              {showSupervisors ? 'Hide' : 'Show'} {current.supervisors.length} supervisor
              {current.supervisors.length === 1 ? '' : 's'}
            </button>
          ) : null}
          {hidden.length > 0 ? (
            <button
              type="button"
              className="action-button action-button--ghost"
              aria-pressed={showStale}
              onClick={() => setShowStale((v) => !v)}
            >
              {showStale ? 'Hide' : 'Show'} {hidden.length} stale slot{hidden.length === 1 ? '' : 's'} (unseen
              over 1 h)
            </button>
          ) : null}
        </div>
        {workers.isPending ? (
          <LoadingState title="Loading workers…" variant="message" />
        ) : workers.isError ? (
          <ShiftError title="Could not load workers." error={workers.error} />
        ) : all.length === 0 ? (
          <EmptyState
            icon={ServerCog}
            title="No worker has sent a heartbeat."
            description="Start todoq supervisor on a machine; its slots appear here within 30 seconds."
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={ServerCog}
            title="No worker slot has been seen in the last hour."
            description="Every known slot is stale. Check the todoq supervisors, or show the stale slots."
          />
        ) : (
          <WorkersTable workers={list} />
        )}
      </section>

      <section className="shift__section" aria-label="Timeline">
        <div className="shift__toolbar">
          <h2 className="page__section-title">Timeline</h2>
          <span className="shift__actions" role="group" aria-label="Time range">
            {RANGES.map((range) => (
              <button
                key={range.hours}
                type="button"
                className={`action-button action-button--${hours === range.hours ? 'primary' : 'ghost'}`}
                aria-pressed={hours === range.hours}
                onClick={() => setHours(range.hours)}
              >
                {range.label}
              </button>
            ))}
          </span>
        </div>
        {history.isPending ? (
          <LoadingState title="Loading history…" variant="message" />
        ) : history.isError ? (
          <ShiftError title="Could not load worker history." error={history.error} />
        ) : history.data.slots.length === 0 ? (
          <EmptyState icon={Activity} title="No worker activity in this window." />
        ) : (
          <ShiftTimeline
            from={history.data.from}
            to={history.data.to}
            slots={
              showSupervisors ? history.data.slots : splitSupervisors(history.data.slots).workers
            }
          />
        )}
      </section>

      <section className="shift__section" aria-label="Capacity">
        <h2 className="page__section-title">Capacity</h2>
        {history.isPending ? (
          <LoadingState title="Loading capacity…" variant="message" />
        ) : history.isError ? null : history.data.capacity.length === 0 ? (
          <EmptyState icon={Activity} title="No capacity samples in this window." />
        ) : (
          <ShiftCapacityChart points={history.data.capacity} />
        )}
      </section>
    </div>
  );
}

function WorkersTable({ workers }: { workers: ShiftWorker[] }): JSX.Element {
  const now = new Date();
  const sorted = [...workers].sort(
    (a, b) =>
      a.family.localeCompare(b.family) ||
      a.host.localeCompare(b.host) ||
      a.slot.localeCompare(b.slot, undefined, { numeric: true })
  );
  return (
    <div className="table-scroll">
      <table className="shift__table">
        <thead>
          <tr>
            <th scope="col">Health</th>
            <th scope="col">Operator</th>
            <th scope="col">Host</th>
            <th scope="col">Slot</th>
            <th scope="col">Family</th>
            <th scope="col">State</th>
            <th scope="col">Todo</th>
            <th scope="col">Lease</th>
            <th scope="col">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((w) => (
            <tr
              key={`${w.operator}/${w.host}/${w.slot}/${w.family}`}
              data-testid={`shift-worker-${w.host}-${w.slot}`}
            >
              <td>
                <span className={`shift-health${w.healthy ? ' is-healthy' : ''}`} aria-hidden="true" />
                {w.healthy ? 'healthy' : <span className="page__pill page__pill--warning">stale</span>}
              </td>
              <td>{w.operator}</td>
              <td>{w.host}</td>
              <td>{w.slot}</td>
              <td>{w.family}</td>
              <td>
                {w.state}
                {w.stage ? ` · ${w.stage}` : ''}
              </td>
              <td>
                {w.todo_id ? <Link to={todoHref(w.todo_id)}>{w.todo_id}</Link> : '—'}
              </td>
              <td>{w.lease_until ? <When at={w.lease_until} now={now} /> : '—'}</td>
              <td><When at={w.last_seen} now={now} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
