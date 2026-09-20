// FleetPage.tsx — the /runners page: live runner network across the fabric.
//
// Everything here comes from `GET /api/v1/control-plane/runners`, which is
// fed by real runner heartbeats: the PR-gate slots, and the pr-redteam PR
// reviewer, which is listed in its own section because it holds no gate slot. The page polls it
// so the one-sentence summary and the rows stay current without a reload.
// The forge's background timers (auto-pin, auto-stage) get a third section,
// "Automation", which is absent altogether when none reports: an older forge,
// or timers that were never installed, should not leave an empty box.
//
// It used to also render "Runner pools" and "System health" from the
// bootstrap read model, but those were not real: pool capacity came from a
// hardcoded 4x10 fixture, "failed" summed every failed check ever recorded,
// and every system component was always reported healthy.

import { useMemo } from 'react';

import { useControlPlaneRunners } from '../hooks/useControlPlaneRunners';
import {
  networkSentence,
  runnerNetworkFromResponse
} from './runnerNetworkModel';
import { AutomationList, ReviewerList, RunnerNodeList } from './fleet';

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
  const sentence = networkSentence(runnerNetwork.nodes);
  // Measured against when we fetched the snapshot, so render stays pure.
  const stale =
    runnerNetwork.lastUpdated !== null &&
    runnersQuery.dataUpdatedAt - new Date(runnerNetwork.lastUpdated).getTime() >
      RUNNER_STALE_AFTER_MS;

  const runnerNetworkNote = runnersQuery.isError
    ? (runnersQuery.error?.message ?? 'Runner network snapshot unavailable.')
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
          The machines that gate pull requests and the agents that review and
          merge them, from their heartbeats.
        </p>
        {runnerNetworkNote ? null : (
          <p
            className={`fleet__sentence fleet__tone--${sentence.tone}`}
            data-testid="fleet-metrics"
            role="status"
          >
            {sentence.text}
          </p>
        )}
      </header>

      <section className="page__section" aria-labelledby="fleet-runners">
        <h2 className="page__section-title" id="fleet-runners">
          Gate runners
        </h2>
        {runnerNetworkNote ? (
          <p className="page__roadmap-note">{runnerNetworkNote}</p>
        ) : runnerNetwork.nodes.length === 0 ? (
          <p className="page__roadmap-note">
            No runners are reporting. Runners appear here as soon as they send a
            heartbeat.
          </p>
        ) : (
          <div className="fleet__network-layout" data-testid="fleet-network">
            <RunnerNodeList
              nodes={runnerNetwork.nodes}
              nowMs={runnersQuery.dataUpdatedAt}
            />
          </div>
        )}
      </section>

      <section
        className="page__section"
        aria-labelledby="fleet-reviewers"
        data-testid="fleet-reviewers"
      >
        <h2 className="page__section-title" id="fleet-reviewers">
          PR reviewers
        </h2>
        {runnerNetworkNote ? null : runnerNetwork.reviewers.length === 0 ? (
          // Said, not hidden: an operator looking for the agents that approve
          // and merge should learn that none is reporting, not wonder where
          // the section went.
          <p className="page__roadmap-note" data-testid="fleet-no-reviewer">
            No review agent has reported in the last 3 minutes.
          </p>
        ) : (
          <ReviewerList
            reviewers={runnerNetwork.reviewers}
            nowMs={runnersQuery.dataUpdatedAt}
          />
        )}
      </section>

      {runnerNetworkNote || runnerNetwork.automation.length === 0 ? null : (
        <section
          className="page__section"
          aria-labelledby="fleet-automation"
          data-testid="fleet-automation"
        >
          <h2 className="page__section-title" id="fleet-automation">
            Automation
          </h2>
          <AutomationList
            timers={runnerNetwork.automation}
            nowMs={runnersQuery.dataUpdatedAt}
          />
        </section>
      )}
    </div>
  );
}
