// WorkersStrip.tsx — who is working, in one line, on the Work page.
//
// Collapsed (the default, remembered) it reads "7 of 7 slots healthy · 2 working
// (jeryu w1 on <todo>, …) · 0 paused · night window closed (22:00–07:00 <tz>)" beside a 24 h sparkline of busy slots.
// Opened, it shows the whole workers panel in place: table, timeline, capacity.

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import type { ShiftTodo } from '../../api/types';
import { useShiftWorkers, useShiftWorkersHistory } from '../../hooks/useShift';
import { readBrowserText, writeBrowserText } from '../../storage/browserStorage';
import { WorkersPanel } from './WorkersPanel';
import { busySparkline, nightWindow, workersLine } from './workPageModel';
import { WORK_WORKERS_ID, todoHref } from './workPaths';

const OPEN_KEY = 'jeryu.work.workersOpen.v1';
const SPARK_W = 120;
const SPARK_H = 18;

export function WorkersStrip({ todos }: { todos: ShiftTodo[] }): JSX.Element {
  const workers = useShiftWorkers();
  const history = useShiftWorkersHistory(24);
  const { hash } = useLocation();
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
            {/* Next to the count: an idle strip says whether the night window is why. */}
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
      <div id={panelId} hidden={!open}>
        {open ? <WorkersPanel /> : null}
      </div>
    </section>
  );
}
