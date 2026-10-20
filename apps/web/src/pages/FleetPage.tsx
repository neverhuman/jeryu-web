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
// The family scope narrows the rows: a runner a family's board lane names is
// that family's, a runner no board names serves every family and stays, and the
// rest are counted under the sections as "+N in other families". The runner
// snapshot itself knows nothing about families, so the narrowing happens here
// from the boards this page already reads.
//
// It used to also render "Runner pools" and "System health" from the
// bootstrap read model, but those were not real: pool capacity came from a
// hardcoded 4x10 fixture, "failed" summed every failed check ever recorded,
// and every system component was always reported healthy.

import { useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { toneModifier } from '../components/tone/tone';
import { pageWebCommit } from '../build/webCommit';
import { PageHeader, queryFreshness } from '../components/pageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/state';
import {
  CONTROL_PLANE_RUNNERS_QUERY_KEY,
  useControlPlaneRunners
} from '../hooks/useControlPlaneRunners';
import { RUNNERS_SCOPE, useRunnerChangeNudge } from '../hooks/useRunnerChangeNudge';
import { useServerNow } from '../hooks/useServerNow';
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
import { NeedsYouHere } from './needsYou/NeedsYouHere';
import { scorerSummary } from './fleet/runnerTools';
import {
  forgeReleaseLane,
  parseRunnersParam,
  runnerAnchorId,
  runnerReleaseIndex,
  scopeRunnersByFamily,
  type RunnerPlaces
} from './fleet/releaseIndex';
import { useFamilyScope } from '../components/family/FamilyScopeProvider';
import { OtherFamilies } from '../components/family/OtherFamilies';
import { ScopedEmptyState } from '../components/family/ScopedEmptyState';
import { RUNNERS_PARAM } from './releaseBoard/links';
import { usePageTitle } from '../hooks/usePageTitle';
import { UseThisWhen } from '../layout/UseThisWhen';

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
  const build = forgeBuildLine(runnerNetwork.forge, pageWebCommit());
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
  // One family in scope: only the runners its release board lanes name, plus
  // the ones no lane names.
  const scope = useFamilyScope();
  const scoped = useMemo(() => {
    const keep = <T extends { runnerId: string }>(rows: readonly T[]) =>
      scopeRunnersByFamily(rows, scope.family, places.releases);
    return {
      nodes: keep(runnerNetwork.nodes),
      reviewers: keep(runnerNetwork.reviewers),
      audits: keep(runnerNetwork.audits),
      automation: keep(runnerNetwork.automation)
    };
  }, [
    places.releases,
    runnerNetwork.audits,
    runnerNetwork.automation,
    runnerNetwork.nodes,
    runnerNetwork.reviewers,
    scope.family
  ]);
  const elsewhere =
    scoped.nodes.elsewhere +
    scoped.reviewers.elsewhere +
    scoped.audits.elsewhere +
    scoped.automation.elsewhere;
  // Every count and sentence on the page is about the rows on it: with a
  // family in scope the summary describes that family's runners, not the fleet.
  const nodes = scoped.nodes.rows;
  const reviewers = splitReviewers(scoped.reviewers.rows);
  // Evidence we can stand behind: a fresh snapshot in which every runner
  // reported a state we recognise. Anything less and the counts are guesses.
  const availabilityKnown =
    runnerNetwork.state === 'fresh' &&
    nodes.every((node) => node.availability !== 'unknown');
  const sentence = networkSentence(nodes);
  const scorers = scorerSummary(nodes);
  const rendered = [
    ...nodes,
    ...reviewers.listed,
    ...scoped.audits.rows,
    ...scoped.automation.rows
  ].map((node) => node.runnerId);
  const pickedIds = parseRunnersParam(picked);
  const shown = pickedIds.filter((id) => rendered.includes(id));
  const missing = pickedIds.filter((id) => !rendered.includes(id));
  const reducedMotion = usePrefersReducedMotion();
  // Running passes tick every second on the forge's clock; with none running
  // the page holds still between fetches.
  const anyRunning = [
    ...nodes,
    ...scoped.reviewers.rows,
    ...scoped.audits.rows
  ].some((node) => node.tasks.length > 0);
  useRunnerChangeNudge(
    RUNNERS_SCOPE,
    CONTROL_PLANE_RUNNERS_QUERY_KEY,
    Boolean(runnersQuery.data?.serverTime)
  );
  const nowMs = useServerNow(
    runnersQuery.data?.serverTime,
    runnersQuery.dataUpdatedAt,
    anyRunning
  );
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
      <PageHeader
        title="Runners"
        subtitle="The machines that gate pull requests and the agents that review and merge them, from their heartbeats."
        testId="fleet-header"
        freshness={queryFreshness(runnersQuery)}
        badges={
          <>
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
          </>
        }
      >
        <UseThisWhen id="nav.runners" />
        <p className="fleet__flow-link">
          <Link to="/flow?mode=layout" data-testid="fleet-flow-layout">
            See which station each runner serves on Flow Layout
          </Link>
        </p>
        {build ? (
          <p
            className={`fleet__build${build.webMismatch ? ' fleet__tone--warn' : ''}`}
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
            className={`fleet__build${scorers.mixed ? ' fleet__tone--warn' : ''}`}
            data-testid="fleet-scorer-summary"
          >
            {scorers.text}
          </p>
        ) : null}
        {runnerNetworkState ? null : (
          <p
            className={`fleet__sentence ${toneModifier('fleet__tone', sentence.tone)}`}
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
      </PageHeader>

      {/* The Runners badge counts worker and gate-runner rows; this is where
          they are, so the badge leads to the rows it counted. */}
      <NeedsYouHere area="system" />

      <section className="page__section" aria-labelledby="fleet-runners">
        <h2 className="page__section-title" id="fleet-runners">
          Gate runners
        </h2>
        {runnerNetworkState ? (
          runnerNetworkState
        ) : nodes.length === 0 ? (
          <ScopedEmptyState
            title="No runners are reporting."
            description="Runners appear here as soon as they send a heartbeat."
          />
        ) : (
          <div className="fleet__network-layout" data-testid="fleet-network">
            <RunnerNodeList nodes={nodes} nowMs={nowMs} places={places} />
          </div>
        )}
        <OtherFamilies count={elsewhere} noun="runners" />
      </section>

      <section
        className="page__section"
        aria-labelledby="fleet-reviewers"
        data-testid="fleet-reviewers"
      >
        <h2 className="page__section-title" id="fleet-reviewers">
          Pull request reviewers
        </h2>
        {runnerNetworkState ? null : scoped.reviewers.rows.length === 0 ? (
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
                nowMs={nowMs}
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

      {runnerNetworkState || scoped.audits.rows.length === 0 ? null : (
        <section
          className="page__section"
          aria-labelledby="fleet-audits"
          data-testid="fleet-audits"
        >
          <h2 className="page__section-title" id="fleet-audits">
            Quality audits
          </h2>
          <AuditList
            audits={scoped.audits.rows}
            nowMs={nowMs}
            places={places}
          />
        </section>
      )}

      {runnerNetworkState || scoped.automation.rows.length === 0 ? null : (
        <section
          className="page__section"
          aria-labelledby="fleet-automation"
          data-testid="fleet-automation"
        >
          <h2 className="page__section-title" id="fleet-automation">
            Automation
          </h2>
          <AutomationList
            timers={scoped.automation.rows}
            nowMs={nowMs}
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
