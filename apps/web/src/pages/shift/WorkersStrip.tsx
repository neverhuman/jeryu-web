// WorkersStrip.tsx — who is working, in one line, on the Work page.
//
// Collapsed (the default, remembered) it reads "7 of 7 slots healthy · 2 working
// (jeryu w1 on <todo>, …) · 0 paused · night window closed (22:00–07:00 <tz>)" beside a 24 h sparkline of busy slots.
// A family whose shift budget ran out with todos still waiting says so here as
// well: idle slots and a spent cap look the same on the heartbeats alone.
// An external pool gets a line of its own per family — "acme pool: 3 of 4
// available, 2 busy (5 active)" — because its members are not queue slots:
// each holds several jobs, and an unavailable one says why (on hover).
// Opened, it shows the whole workers panel in place: table, timeline, capacity,
// narrowed to the page's family and to `?host=` when a release-board target
// linked here.

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import type { ShiftTodo } from '../../api/types';
import { useAttention } from '../../hooks/usePipeline';
import { useShiftWorkers, useShiftWorkersHistory } from '../../hooks/useShift';
import { useViewState } from '../../hooks/useViewState';
import { readBrowserText, writeBrowserText } from '../../storage/browserStorage';
import { WorkersPanel } from './WorkersPanel';
import { budgetSpentLines, busySparkline, nightWindow, workersLine } from './workPageModel';
import { poolSummaries } from './workersModel';
import { WORK_HOST_PARAM, WORK_WORKERS_ID, todoHref } from './workPaths';

const OPEN_KEY = 'jeryu.work.workersOpen.v1';
const SPARK_W = 120;
const SPARK_H = 18;

export function WorkersStrip({
  todos,
  family = '',
}: {
  todos: ShiftTodo[];
  /** The page's family filter; '' is every family. */
  family?: string;
}): JSX.Element {
  const workers = useShiftWorkers();
  const attention = useAttention();
  const history = useShiftWorkersHistory(24);
  const { hash } = useLocation();
  // `?host=` narrows the opened panel to the hosts a release-board target
  // named; the link that sets it also carries `#workers`, so it opens here.
  const view = useViewState();
  const hosts = view.readList(WORK_HOST_PARAM);
  // A pool reports under a family this forge hosts no queue for, so the page
  // hands us '' for it; the address still names it, and the panel can filter.
  const slotFamily = family || view.read('family');
  const [open, setOpen] = useState<boolean>(
    () => readBrowserText('durable', OPEN_KEY) === '1'
  );
  // `/work#workers` (the old Workers tab, and links from Needs you) opens it.
  useEffect(() => {
    if (hash === `#${WORK_WORKERS_ID}`) setOpen(true);
  }, [hash]);
  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    writeBrowserText('durable', OPEN_KEY, next ? '1' : '0');
  };

  const line = workersLine(workers.data?.workers ?? [], todos, new Date());
  const night = nightWindow(workers.data?.workers ?? [], todos, new Date());
  const spark = busySparkline(history.data?.capacity ?? [], SPARK_W, SPARK_H);
  const budgets = budgetSpentLines(attention.data, family);
  // An external pool is counted per family, not per slot: its members hold
  // several jobs each and a paused one is paused for a reason of its own.
  const pools = poolSummaries(workers.data?.workers ?? []);
  const panelId = 'work-workers-panel';
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <section
      id={WORK_WORKERS_ID}
      className="work-workers"
      aria-label="Workers"
      data-testid="work-workers"
    >
      <div className={`work-workers__line${line.unhealthy > 0 ? ' is-warning' : ''}`}>
        <button
          type="button"
          className="work-workers__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
        >
          <Chevron size={14} aria-hidden="true" />
          Workers
        </button>
        {workers.isPending ? (
          <span className="shift__muted">Loading workers…</span>
        ) : workers.isError ? (
          <span className="shift__muted">Workers could not be loaded.</span>
        ) : (
          <span className="work-workers__summary" data-testid="work-workers-summary">
            {line.text}
            {line.working.length > 0 ? (
              <>
                {' ('}
                {line.working.map((slot, i) => (
                  <span key={`${slot.family}-${slot.slot}-${slot.todoId}`}>
                    {i > 0 ? ', ' : ''}
                    {slot.family} {slot.slot} on{' '}
                    <Link to={todoHref(slot.todoId)}>{slot.title}</Link>
                  </span>
                ))}
                {')'}
              </>
            ) : null}
            {/* Why the slots are idle: a spent shift budget, then the night window. */}
            {budgets.map((budget) => (
              <span key={budget.family} data-testid={`work-budget-spent-${budget.family}`}>
                {' · '}
                {family ? budget.text : `${budget.family}: ${budget.text}`}
              </span>
            ))}
            {night ? (
              <span data-testid="work-night-window" className={night.open ? undefined : 'shift__muted'}>
                {' · '}
                {night.text}
              </span>
            ) : null}
          </span>
        )}
        {spark ? (
          <svg
            className="work-workers__spark"
            viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
            width={SPARK_W}
            height={SPARK_H}
            role="img"
            aria-label="Busy worker slots over the last 24 hours"
          >
            <polyline points={spark} fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        ) : null}
      </div>
      {pools.map((pool) => (
        <div
          key={pool.family}
          className="work-workers__pool"
          data-testid={`work-pool-${pool.family}`}
          title={pool.title || undefined}
        >
          {pool.text}
          {pool.unavailable.length > 0 ? (
            <span className="shift__muted">
              {' · '}
              {pool.unavailable[0].detail || pool.unavailable[0].state}
              {pool.unavailable.length > 1 ? ` +${pool.unavailable.length - 1} more` : ''}
            </span>
          ) : null}
        </div>
      ))}
      <div id={panelId} hidden={!open}>
        {open ? <WorkersPanel family={slotFamily} hosts={hosts} /> : null}
      </div>
    </section>
  );
}
