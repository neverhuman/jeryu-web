// FleetPage.tsx — the /runners page: live runner network across the fabric.
//
// Everything here comes from `GET /api/v1/control-plane/runners`, which is
// fed by real runner heartbeats: the PR-gate slots, and the pr-redteam PR
// reviewer, which is listed in its own section because it holds no gate slot.
// A reviewer that is idle and has never reviewed anything is named in one line
// there rather than given a row of its own. The page polls the snapshot
// so the one-sentence summary and the rows stay current without a reload.
// The forge's background timers (auto-pin, auto-stage) get a third section,
// "Automation", which is absent altogether when none reports: an older forge,
// or timers that were never installed, should not leave an empty box.
//
// Under the title, one line says what code the forge itself runs (its
// release, server commit, and the web commit it pins) beside this page's own
// build commit when the two differ. Rows carry each runner's installed code.
// An older forge sends neither, and then neither shows. Rows also say what
// evaluates a pull request there (the scorer and scanners, from `tools`), and
// a line under the forge's says which scorer build the gates use — amber when
// they use more than one. Quality audit runners (label `jankurai-audit`) get
// a section of their own, absent when none reports.
//
// "What it is and where it is": the page also reads every family's release
// board (once, then at most every 5 minutes) so a runner a board names links
// to its lane, and the forge's own line links to the lane whose production
// stage runs its commit. `?runners=a,b` (the board's "N runners" link)
// highlights those rows and scrolls to the first. Unreadable boards — not an
// admin, or an older server — just mean no links.
//
// It used to also render "Runner pools" and "System health" from the
// bootstrap read model, but those were not real: pool capacity came from a
// hardcoded 4x10 fixture, "failed" summed every failed check ever recorded,
// and every system component was always reported healthy.

import { useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { pageWebCommit } from '../build/webCommit';
import { EmptyState, ErrorState, LoadingState } from '../components/state';
import { useControlPlaneRunners } from '../hooks/useControlPlaneRunners';
import { useRunnerReleaseBoards } from '../hooks/useRunnerReleaseBoards';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import {
  forgeBuildLine,
  networkSentence,
  runnerNetworkFromResponse,
  splitReviewers,
  idleReviewerSentence
} from './runnerNetworkModel';
import { AuditList, AutomationList, ReviewerList, RunnerNodeList } from './fleet';
import { scorerSummary } from './fleet/runnerTools';
import {
  forgeReleaseLane,
  parseRunnersParam,
  runnerAnchorId,
  runnerReleaseIndex,
  type RunnerPlaces
} from './fleet/releaseIndex';
import { RUNNERS_PARAM } from './releaseBoard/links';
import { usePageTitle } from '../hooks/usePageTitle';

import './page.css';
import './FleetPage.css';

/** No heartbeat for this long and the snapshot is flagged as stale. */
export const RUNNER_STALE_AFTER_MS = 3 * 60_000;

export function FleetPage(): JSX.Element {
  usePageTitle('Runners');
  const runnersQuery = useControlPlaneRunners();
  const runnerNetwork = useMemo(
    () =>
      runnerNetworkFromResponse(
        runnersQuery.data,
        !runnersQuery.isError && !runnersQuery.isStale
      ),
    [runnersQuery.data, runnersQuery.isError, runnersQuery.isStale]
  );
  // Evidence we can stand behind: a fresh snapshot in which every runner
  // reported a state we recognise. Anything less and the counts are guesses.
  const availabilityKnown =
    runnerNetwork.state === 'fresh' &&
    runnerNetwork.nodes.every((node) => node.availability !== 'unknown');
  const sentence = networkSentence(runnerNetwork.nodes);
  const build = forgeBuildLine(runnerNetwork.forge, pageWebCommit());
  const scorers = scorerSummary(runnerNetwork.nodes);
  const reviewers = splitReviewers(runnerNetwork.reviewers);
  const boardsQuery = useRunnerReleaseBoards();
  const boards = boardsQuery.data;
  const [params] = useSearchParams();
  const picked = params.get(RUNNERS_PARAM);
  const places = useMemo<RunnerPlaces>(
    () => ({
      releases: runnerReleaseIndex(boards ?? []),
      highlighted: new Set(parseRunnersParam(picked))
    }),
    [boards, picked]
  );
  const forgeLane = forgeReleaseLane(boards ?? [], runnerNetwork.forge);
  const rendered = [
    ...runnerNetwork.nodes,
    ...reviewers.listed,
    ...runnerNetwork.audits,
    ...runnerNetwork.automation
  ].map((node) => node.runnerId);
  const pickedIds = parseRunnersParam(picked);
  const shown = pickedIds.filter((id) => rendered.includes(id));
  const missing = pickedIds.filter((id) => !rendered.includes(id));
  const reducedMotion = usePrefersReducedMotion();
  useScrollToFirst(picked, shown[0] ?? null, reducedMotion);
  // Measured against when we fetched the snapshot, so render stays pure.
  const stale =
    runnerNetwork.lastUpdated !== null &&
    runnersQuery.dataUpdatedAt - new Date(runnerNetwork.lastUpdated).getTime() >
      RUNNER_STALE_AFTER_MS;

  // One surface for the whole page: while it is set, every runner section is
  // held back behind it rather than drawing an empty board.
  const runnerNetworkState = runnersQuery.isError ? (
    <ErrorState
      title="Could not load the runner network snapshot."
      error={runnersQuery.error}
      description={
        runnersQuery.error ? undefined : 'Runner network snapshot unavailable.'
      }
      onRetry={() => void runnersQuery.refetch()}
      testId="fleet-runners-error"
    />
  ) : runnersQuery.isLoading ? (
    <LoadingState variant="message" title="Loading runner network snapshot." />
  ) : null;

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
          {availabilityKnown ? null : (
            <span
              className="page__pill page__pill--warning"
              data-testid="fleet-availability-unknown"
            >
              Runner availability unknown
            </span>
          )}
        </div>
        <p className="page__subtitle">
          The machines that gate pull requests and the agents that review and
          merge them, from their heartbeats.
        </p>
        {build ? (
          <p
            className={`fleet__build${build.webMismatch ? ' fleet__tone--warning' : ''}`}
            data-testid="fleet-forge-build"
            title={build.title || undefined}
          >
            {forgeLane ? (
              <Link
                to={forgeLane.href}
                data-testid="fleet-forge-release"
                title={`On the ${forgeLane.family} release board, lane ${forgeLane.laneName}`}
              >
                <code>{build.text}</code>
              </Link>
            ) : (
              <code>{build.text}</code>
            )}
          </p>
        ) : null}
        {scorers && !runnerNetworkState ? (
          <p
            className={`fleet__build${scorers.mixed ? ' fleet__tone--warning' : ''}`}
            data-testid="fleet-scorer-summary"
          >
            {scorers.text}
          </p>
        ) : null}
        {runnerNetworkState ? null : (
          <p
            className={`fleet__sentence fleet__tone--${sentence.tone}`}
            data-testid="fleet-metrics"
            role="status"
          >
            {sentence.text}
          </p>
        )}
        {pickedIds.length > 0 && !runnerNetworkState ? (
          <p className="fleet__picked" role="status" data-testid="fleet-picked">
            {shown.length === 1
              ? '1 runner linked from a release board is highlighted.'
              : `${shown.length} runners linked from a release board are highlighted.`}
            {missing.length > 0 ? ` Not reporting: ${missing.join(', ')}.` : ''}{' '}
            <Link to="/runners" data-testid="fleet-picked-clear">
              Clear
            </Link>
          </p>
        ) : null}
      </header>

      <section className="page__section" aria-labelledby="fleet-runners">
        <h2 className="page__section-title" id="fleet-runners">
          Gate runners
        </h2>
        {runnerNetworkState ? (
          runnerNetworkState
        ) : runnerNetwork.nodes.length === 0 ? (
          <EmptyState
            title="No runners are reporting."
            description="Runners appear here as soon as they send a heartbeat."
          />
        ) : (
          <div className="fleet__network-layout" data-testid="fleet-network">
            <RunnerNodeList
              nodes={runnerNetwork.nodes}
              nowMs={runnersQuery.dataUpdatedAt}
              places={places}
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
        {runnerNetworkState ? null : runnerNetwork.reviewers.length === 0 ? (
          // Said, not hidden: an operator looking for the agents that approve
          // and merge should learn that none is reporting, not wonder where
          // the section went.
          <EmptyState
            title="No review agent has reported in the last 3 minutes."
            testId="fleet-no-reviewer"
          />
        ) : (
          <>
            {reviewers.listed.length > 0 ? (
              <ReviewerList
                reviewers={reviewers.listed}
                nowMs={runnersQuery.dataUpdatedAt}
                places={places}
              />
            ) : null}
            {reviewers.idle.length > 0 ? (
              <p
                className="page__roadmap-note"
                data-testid="fleet-reviewers-idle"
              >
                {idleReviewerSentence(reviewers.idle)}
              </p>
            ) : null}
          </>
        )}
      </section>

      {runnerNetworkState || runnerNetwork.audits.length === 0 ? null : (
        <section
          className="page__section"
          aria-labelledby="fleet-audits"
          data-testid="fleet-audits"
        >
          <h2 className="page__section-title" id="fleet-audits">
            Quality audits
          </h2>
          <AuditList
            audits={runnerNetwork.audits}
            nowMs={runnersQuery.dataUpdatedAt}
            places={places}
          />
        </section>
      )}

      {runnerNetworkState || runnerNetwork.automation.length === 0 ? null : (
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
            places={places}
          />
        </section>
      )}
    </div>
  );
}

/**
 * Scroll the first highlighted row into view once it has rendered, once per
 * `?runners=` value: the 15 s poll re-renders the rows and must not yank the
 * page back.
 */
function useScrollToFirst(
  picked: string | null,
  firstId: string | null,
  reducedMotion: boolean
): void {
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!picked || !firstId || done.current === picked) return;
    const row = document.getElementById(runnerAnchorId(firstId));
    if (!row) return;
    done.current = picked;
    row.scrollIntoView?.({
      block: 'center',
      behavior: reducedMotion ? 'auto' : 'smooth'
    });
  }, [picked, firstId, reducedMotion]);
}
