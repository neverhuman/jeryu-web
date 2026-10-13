// WorkersPanel.tsx — everything about the worker slots, shown when the
// workers strip on the Work page is opened.
//
// Live table of worker-slot heartbeats (healthy = seen within 120 s), a
// 24h / 7d swim-lane timeline per slot, and an hourly capacity chart of
// planned vs busy slots and queue depth.
//
// The panel can be narrowed to one family and a set of hosts (`?family=` and
// `?host=` on /work), which is where "3 workers" on a release-board target
// points: the live table, the pools and the timeline then show those slots
// only, and the filter says so with a way out of it.
//
// The members of an external worker pool are grouped under their family in
// their own block, with the reason behind each state and how loaded each
// member is: they are not queue slots and have no todo or lease to show. A
// family whose queue is empty still has its pool rendered here.

import { Activity, ServerCog } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { ShiftWorker } from '../../api/types';
import { EmptyState, LoadingState } from '../../components/state';
import { useShiftWorkers, useShiftWorkersHistory } from '../../hooks/useShift';
import { SESSIONS_PATH } from '../SessionsPage';
import { ShiftError } from './shiftCommon';
import { ShiftCapacityChart, ShiftTimeline } from './ShiftCharts';
import { splitWorkers } from './shiftModel';
import { When } from '../../format/When';
import {
  type PoolSummary,
  type SlotFilter,
  filterSlots,
  hasSlotFilter,
  poolSummaries,
  slotFilterText,
  splitPools,
  splitSupervisors,
} from './workersModel';
import { todoHref, workersHref } from './workPaths';

import '../page.css';
import './Shift.css';

const RANGES = [
  { hours: 24, label: '24h' },
  { hours: 168, label: '7d' },
] as const;

export function WorkersPanel({
  family = '',
  hosts = [],
}: {
  /** The page's family filter; '' is every family. */
  family?: string;
  /** `?host=` on /work; empty is every host. */
  hosts?: readonly string[];
} = {}): JSX.Element {
  const workers = useShiftWorkers();
  const [hours, setHours] = useState<number>(24);
  const history = useShiftWorkersHistory(hours);
  const filter: SlotFilter = { family, hosts };
  const all = filterSlots(workers.data?.workers ?? [], filter);
  const [showStale, setShowStale] = useState(false);
  // Slots unseen for over an hour are ghosts of old runs: hidden until asked for.
  const { shown, hidden } = splitWorkers(all, new Date());
  const [showSupervisors, setShowSupervisors] = useState(false);
  // A supervisor starts and stops workers and never carries a todo: folded away.
  // Pool members are not queue slots: counting them among them would make a
  // pool-only family read as a queue with slots that carry no todo.
  const queueSlots = splitPools(all).slots;
  const seen = splitPools(showStale ? all : shown);
  const current = splitSupervisors(seen.slots);
  const list = showSupervisors ? [...current.workers, ...current.supervisors] : current.workers;
  const healthy = list.filter((w) => w.healthy).length;
  const pools = poolSummaries(seen.pools);
  // The timeline reads the same filter as the table, so a filtered panel never
  // draws a lane the table above it leaves out.
  const past = filterSlots(history.data?.slots ?? [], filter);
  const lanes = showSupervisors ? past : splitSupervisors(past).workers;

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
          {hasSlotFilter(filter) ? (
            <span className="shift__muted" data-testid="shift-workers-filter">
              {slotFilterText(filter)} · <Link to={workersHref('')}>show every slot</Link>
            </span>
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
        ) : queueSlots.length === 0 ? (
          <EmptyState
            icon={ServerCog}
            title="No queue slot has sent a heartbeat."
            description="Start todoq supervisor on a machine; its slots appear here within 30 seconds."
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={ServerCog}
            title="No queue slot has been seen in the last hour."
            description="Every known slot is stale. Check the todoq supervisors, or show the stale slots."
          />
        ) : (
          <WorkersTable workers={list} />
        )}
      </section>

      {pools.length > 0 ? (
        <section className="shift__section" aria-label="Worker pools" data-testid="shift-pools">
          <h2 className="page__section-title">Pools</h2>
          {pools.map((pool) => (
            <PoolGroup key={pool.family} pool={pool} />
          ))}
        </section>
      ) : null}

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
        ) : lanes.length === 0 ? (
          <EmptyState icon={Activity} title="No worker activity in this window." />
        ) : (
          <ShiftTimeline from={history.data.from} to={history.data.to} slots={lanes} />
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

/** One family's pool: the counted line, then a row per member. */
function PoolGroup({ pool }: { pool: PoolSummary<ShiftWorker> }): JSX.Element {
  const now = new Date();
  return (
    <div data-testid={`shift-pool-${pool.family}`}>
      <p className="shift__pool-group" title={pool.title || undefined}>
        {pool.text}
      </p>
      <div className="table-scroll">
        <table className="shift__table">
          <thead>
            <tr>
              <th scope="col">Health</th>
              <th scope="col">Host</th>
              <th scope="col">Slot</th>
              <th scope="col">State</th>
              <th scope="col">Detail</th>
              <th scope="col">Active</th>
              <th scope="col">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {pool.members.map((member) => (
              <tr
                key={`${member.operator}/${member.host}/${member.slot}/${member.family}`}
                data-testid={`shift-pool-slot-${member.host}-${member.slot}`}
              >
                <td>
                  <span
                    className={`shift-health${member.healthy ? ' is-healthy' : ''}`}
                    aria-hidden="true"
                  />
                  {member.healthy ? (
                    'healthy'
                  ) : (
                    <span className="page__pill page__pill--warning">stale</span>
                  )}
                </td>
                <td>{member.host}</td>
                <td>{member.slot}</td>
                <td>{member.state}</td>
                <td>{member.detail ? member.detail : '—'}</td>
                <td>
                  {typeof member.active === 'number'
                    ? `${member.active} of ${typeof member.capacity === 'number' ? member.capacity : '?'}`
                    : '—'}
                </td>
                <td>
                  <When at={member.last_seen} now={now} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
            <th scope="col">Session</th>
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
              <td>
                {w.session_id ? (
                  <Link
                    to={SESSIONS_PATH}
                    className="shift__mono"
                    title={w.run_id ? `agent run ${w.run_id}` : undefined}
                  >
                    {w.session_id}
                  </Link>
                ) : (
                  '—'
                )}
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
