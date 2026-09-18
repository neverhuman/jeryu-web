// FleetPage.tsx — the /runners page: live runner network across the fabric.
//
// Everything here comes from `GET /api/v1/control-plane/runners`, which is
// fed by real runner heartbeats (the PR-gate slots today). The page polls it
// so the header metrics and node list stay current without a reload.
//
// It used to also render "Runner pools" and "System health" from the
// bootstrap read model, but those were not real: pool capacity came from a
// hardcoded 4x10 fixture, "failed" summed every failed check ever recorded,
// and every system component was always reported healthy.

import { useMemo } from 'react';

import { useControlPlaneRunners } from '../hooks/useControlPlaneRunners';
import { runnerNetworkFromResponse } from './runnerNetworkModel';
import { RunnerNodeList } from './fleet';

import './page.css';
import './FleetPage.css';

/** No heartbeat for this long and the snapshot is flagged as stale. */
export const RUNNER_STALE_AFTER_MS = 3 * 60_000;

export function FleetPage(): JSX.Element {
  const runnersQuery = useControlPlaneRunners();
  const runnerNetwork = useMemo(
    () => runnerNetworkFromResponse(runnersQuery.data),
    [runnersQuery.data]
  );
  const { totals } = runnerNetwork;
  const utilization = totals.capacity > 0 ? totals.inFlight / totals.capacity : 0;
  // Measured against when we fetched the snapshot, so render stays pure.
  const stale =
    runnerNetwork.lastUpdated !== null &&
    runnersQuery.dataUpdatedAt - new Date(runnerNetwork.lastUpdated).getTime() >
      RUNNER_STALE_AFTER_MS;

  const runnerNetworkNote = runnersQuery.isError
    ? runnersQuery.error?.message ?? 'Runner network snapshot unavailable.'
    : runnersQuery.isLoading
      ? 'Loading runner network snapshot.'
      : null;

  return (
    <div className="page page--wide" data-testid="fleet-page">
      <header className="page__header">
        <div className="fleet__header-bar">
          <h1 className="page__title">Runners</h1>
          {stale ? (
            <span
              className="page__pill page__pill--warning"
              data-testid="fleet-freshness-badge"
              title={`Last heartbeat ${runnerNetwork.lastUpdated}`}
            >
              stale
            </span>
          ) : null}
        </div>
        <p className="page__subtitle">
          Live runner network: node availability, active tasks and each
          runner's last job, from runner heartbeats.
        </p>
        <div className="fleet__header-bar" data-testid="fleet-metrics">
          <div className="fleet__util">
            <span className="fleet__util-value">{Math.round(utilization * 100)}%</span>
            <span className="fleet__util-label">utilization</span>
          </div>
          <span className="page__pill">{totals.nodes} runner(s)</span>
          <span className="page__pill">{totals.busyNodes} busy</span>
          <span className="page__pill">{totals.idleNodes} idle</span>
          <span
            className={`page__pill${totals.offlineNodes > 0 ? ' page__pill--warning' : ''}`}
          >
            {totals.offlineNodes} offline
          </span>
          <span className="page__pill">{totals.activeTasks} active task(s)</span>
        </div>
      </header>

      <section className="page__section" aria-labelledby="fleet-runners">
        <div className="fleet__section-head">
          <h2 className="page__section-title" id="fleet-runners">
            Runner network
          </h2>
          <span className="page__pill">{runnerNetwork.state}</span>
          <span className="page__pill">{totals.capacity} slots</span>
          <span className="page__pill">{totals.inFlight} in flight</span>
        </div>
        {runnerNetworkNote ? (
          <p className="page__roadmap-note">{runnerNetworkNote}</p>
        ) : runnerNetwork.nodes.length === 0 ? (
          <p className="page__roadmap-note">
            No runners are reporting. Runners appear here as soon as they send a
            heartbeat.
          </p>
        ) : (
          <div className="fleet__network-layout" data-testid="fleet-network">
            <RunnerNodeList nodes={runnerNetwork.nodes} />
          </div>
        )}
      </section>
    </div>
  );
}
