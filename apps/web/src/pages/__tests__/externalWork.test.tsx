import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExternalBranches } from '../flow/ExternalBranches';
import { ExternalTaskPlan } from '../flow/ExternalTaskPlan';
import { currentExternalBranches, orderedPlanTasks, scopedExternalWork, snapshotIsStale } from '../flow/externalWorkModel';
import { EXTERNAL_WORK } from './externalWorkTestData';
import { renderAt } from './shiftPageHelpers';
import { mockShiftApi, json } from './shiftPageHelpers';
import { FlowPage } from '../flow';
import { FLOW_REPORT } from './flowTestData';

describe('external origin and plan observations', () => {
  it('scopes observations by family and repository without case-only drift', () => {
    expect(scopedExternalWork([EXTERNAL_WORK], 'acme', 'ROOT/acme')).toHaveLength(1);
    expect(scopedExternalWork([EXTERNAL_WORK], 'other')).toEqual([]);
    expect(scopedExternalWork([EXTERNAL_WORK], 'acme', 'root/other')).toEqual([]);
  });
  it('keeps parent-followup ordering and missing-parent rows', () => {
    const rows = orderedPlanTasks([...EXTERNAL_WORK.tasks].reverse());
    expect(rows.map((row) => row.task.task_id)).toEqual(['API-01', 'API-01-F01', 'SVC-01']);
    expect(rows[1].depth).toBe(1);
    expect(orderedPlanTasks([EXTERNAL_WORK.tasks[1]])).toHaveLength(1);
    expect(snapshotIsStale('invalid')).toBe(true);
    expect(snapshotIsStale(EXTERNAL_WORK.observed_at, Date.parse(EXTERNAL_WORK.observed_at))).toBe(false);
  });
  it('does not classify a squash-merged branch as current only because it is ahead', () => {
    expect(currentExternalBranches(EXTERNAL_WORK).map((branch) => branch.name)).toEqual(['v1/api-01']);
  });
  it('shows the external plan on Flow queue even when no native lifecycle events exist', async () => {
    const report = { ...FLOW_REPORT, stations: FLOW_REPORT.stations.map((station) => ({ ...station, wip: { waiting: 0, active: 0, held: 0 } })), lots: [], external_work: { snapshots: [EXTERNAL_WORK], problems: [] } };
    mockShiftApi((req) => req.pathname === '/api/v1/flow' ? json(report) : undefined);
    renderAt('/flow?family=acme&station=queue', '/flow', <FlowPage />);
    expect(await screen.findByRole('table', { name: 'W0 · Foundations todos' })).toBeInTheDocument();
    expect(screen.queryByText('Nothing is in progress.')).not.toBeInTheDocument();
  });
  it('renders waves, followups, human blockers, prerequisite links and independent milestones', () => {
    renderAt('/flow?family=acme', '/flow', <ExternalTaskPlan snapshot={EXTERNAL_WORK} />);
    expect(screen.getByText('3 todos · 1 merged · 1 need a person · 1 waiting on prerequisites')).toBeInTheDocument();
    const phase = screen.getByRole('table', { name: 'W0 · Foundations todos' });
    expect(within(phase).getByRole('link', { name: /API-01-F01/ })).toHaveAttribute('href', '/work/acme-api-01-f01?family=acme');
    expect(within(phase).getByText('Follow-up of')).toBeInTheDocument();
    expect(screen.getByText('Owner must approve contract freeze')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Only needs human'));
    expect(screen.queryByText('Expose validated modules')).not.toBeInTheDocument();
    expect(screen.getByText('Contract freeze')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Milestones and exit criteria'));
    expect(screen.getByText(/1\/2 linked todos merged; exit criteria unassessed/)).toBeInTheDocument();
  });
  it('renders provider, SHA, comparison and external links; merged history is explicit', () => {
    renderAt('/in-flight?family=acme', '/in-flight', <ExternalBranches snapshot={EXTERNAL_WORK} />);
    expect(screen.getByRole('link', { name: 'v1/api-01' })).toHaveAttribute('href', EXTERNAL_WORK.branches[0].url);
    expect(screen.getByText('2 ahead · 1 behind')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'v1/merged' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Include merged and closed branches'));
    expect(screen.getByRole('link', { name: 'v1/merged' })).toBeInTheDocument();
    expect(screen.getByText('40 ahead · 20 behind')).toBeInTheDocument();
    expect(screen.getByText(/Squash-merged branches/)).toBeInTheDocument();
  });
});
