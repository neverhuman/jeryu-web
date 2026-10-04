// IntelligencePage.tsx - intelligence snapshot dashboard.

import { useMemo, useState } from 'react';
import {
  Activity,
  GitPullRequest,
  Network,
  Package,
  ServerCog,
  Terminal,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { ErrorState, LoadingState } from '../components/state';
import { DEPENDENCIES_PATH } from './DependenciesPage';
import { useControlPlane } from '../hooks/useControlPlane';
import { useEcosystem, useToolBuildClusters } from '../hooks/useToolingEvidence';
import type { ControlPlaneSnapshot, EvidenceState } from '../api/types';
import { buildOperatorGraph, type GraphFilters } from './intelligenceGraphModel';
import {
  EvidencePanel,
  MetricCard,
  OperatorGraphConsole,
  StatePill,
  ToolBuildDossiers,
} from './intelligence';

import './page.css';
import './IntelligencePage.css';
import { IN_FLIGHT_PATH } from './pullRoomModel';
import { usePageTitle } from '../hooks/usePageTitle';

export function IntelligencePage(): JSX.Element {
  usePageTitle('Intelligence');
  const query = useControlPlane();

  if (query.isLoading) {
    return (
      <div className="page intelligence" data-testid="intelligence-page">
        <header className="page__header">
          <h1 className="page__title">Intelligence</h1>
        </header>
        <LoadingState variant="message" title="Loading intelligence snapshot." />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="page intelligence" data-testid="intelligence-page">
        <header className="page__header">
          <h1 className="page__title">Intelligence</h1>
        </header>
        <ErrorState
          title="Could not load the intelligence snapshot."
          error={query.error}
          description={query.error ? undefined : 'Intelligence snapshot unavailable.'}
          onRetry={() => void query.refetch()}
          testId="intelligence-error"
        />
      </div>
    );
  }

  return (
    <IntelligenceSnapshot snapshot={query.data} outOfDate={query.isStale} />
  );
}

// Worst first: the header badge takes the worst state among its sources.
const STATE_RANK: EvidenceState[] = ['failed', 'missing', 'unknown', 'queued', 'fresh'];

export function evidenceStates(
  snapshot: ControlPlaneSnapshot
): EvidenceState[] {
  return [
    snapshot.localAuthority.state,
    snapshot.mirror.state,
    snapshot.artifacts.state,
    snapshot.mcp.state,
    snapshot.agentRuns.length > 0 ? 'fresh' : 'missing',
    snapshot.codegraph.state,
  ];
}

/** The snapshot badge, derived from the same evidence the page displays. */
export function snapshotState(snapshot: ControlPlaneSnapshot): EvidenceState {
  const states = evidenceStates(snapshot);
  return STATE_RANK.find((state) => states.includes(state)) ?? 'unknown';
}

function IntelligenceSnapshot({
  snapshot,
  outOfDate,
}: {
  snapshot: ControlPlaneSnapshot;
  /** The runner snapshot is past its refresh window: its counts are not evidence. */
  outOfDate: boolean;
}): JSX.Element {
  const ecosystem = useEcosystem();
  const toolClusters = useToolBuildClusters(10);
  const [graphFilters, setGraphFilters] = useState<GraphFilters>({
    kinds: [],
    states: [],
    query: '',
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const runners = snapshot.runners.local;
  const runnerCapacityKnown = runners.state === 'fresh' && !outOfDate;
  const operatorGraph = useMemo(
    () =>
      buildOperatorGraph(
        snapshot,
        ecosystem.data ?? null,
        toolClusters.data?.clusters ?? [],
        graphFilters,
        selectedNodeId
      ),
    [ecosystem.data, graphFilters, selectedNodeId, snapshot, toolClusters.data]
  );

  return (
    <div className="page intelligence" data-testid="intelligence-page">
      <header className="page__header intelligence__header">
        <div className="intelligence__title-line">
          <h1 className="page__title">Intelligence</h1>
          <span data-testid="intelligence-snapshot-state">
            <StatePill state={snapshotState(snapshot)} label="snapshot" />
          </span>
        </div>
        <p className="page__roadmap-note intelligence__header-note">
          Operational snapshot of the repository graph and its evidence.
        </p>
        <div className="intelligence__status-strip">
          <MetricCard
            icon={<GitPullRequest size={18} aria-hidden="true" />}
            label="Open PRs"
            to={IN_FLIGHT_PATH}
            value={snapshot.summary.openPrCount}
            detail={`${snapshot.summary.missingCheckPrCount} missing checks`}
            state={
              snapshot.summary.missingCheckPrCount > 0 ? 'missing' : 'fresh'
            }
          />
          <MetricCard
            icon={<ServerCog size={18} aria-hidden="true" />}
            label="Runners"
            to="/runners"
            value={runnerCapacityKnown ? runners.onlineRunners : '—'}
            detail={
              runnerCapacityKnown
                ? `${runners.offlineRunners} offline`
                : runners.state === 'fresh'
                  ? 'Runner snapshot out of date'
                  : runners.state === 'unknown'
                    ? 'Runner capacity unknown'
                    : 'Runner capacity unavailable'
            }
            state={
              runners.state !== 'fresh'
                ? runners.state
                : outOfDate
                  ? 'unknown'
                  : runners.offlineRunners > 0
                    ? 'failed'
                    : 'fresh'
            }
          />
          <MetricCard
            icon={<Package size={18} aria-hidden="true" />}
            label="Artifacts"
            value={snapshot.artifacts.latestRelease.artifactCount}
            detail={
              snapshot.artifacts.latestRelease.artifactCount > 0
                ? 'in the latest release'
                : snapshot.artifacts.absenceIsSuccess
                  ? 'none expected'
                  : 'none recorded yet'
            }
            state={snapshot.artifacts.state}
          />
          <MetricCard
            icon={<Network size={18} aria-hidden="true" />}
            label="Graph"
            value={operatorGraph.nodes.length}
            detail={`${snapshot.codegraph.indexedSymbols} symbols · ${snapshot.toolBuild.clusterCount} tool clusters`}
            state={snapshot.codegraph.state}
          />
        </div>
      </header>

      {/* What needs a person is one list, in one place. This page used to rank its
          own "priorities" from an older rule set (generic items such as "latest
          artifacts are absent"), and its count never matched Needs you. */}
      <p className="page__roadmap-note" data-testid="intelligence-needs-you">
        Looking for what is waiting on you? That is <Link to="/needs-you">Needs you</Link>.
      </p>

      <section className="page__section" aria-labelledby="intelligence-graph">
        <div className="intelligence__section-head">
          <h2 className="page__section-title" id="intelligence-graph">
            Operator Graph
          </h2>
          <span className="page__pill">{operatorGraph.nodes.length} nodes</span>
          <span className="page__pill">{operatorGraph.edges.length} edges</span>
          <span className="page__pill">{operatorGraph.clusters.length} clusters</span>
          <Link className="page__pill" to={DEPENDENCIES_PATH}>
            Dependencies view
          </Link>
        </div>
        <OperatorGraphConsole
          graph={operatorGraph}
          filters={graphFilters}
          onFiltersChange={setGraphFilters}
          onSelectNode={setSelectedNodeId}
        />
        <ToolBuildDossiers
          clusters={toolClusters.data?.clusters ?? []}
          summaryClusters={snapshot.toolBuild.topClusters}
          unavailable={toolClusters.isError ? toolClusters.error.message : null}
        />
      </section>

      <section className="page__section" aria-labelledby="intelligence-health">
        <h2 className="page__section-title" id="intelligence-health">
          Evidence snapshot
        </h2>
        <div className="intelligence__evidence-grid">
          <EvidencePanel
            icon={<Network size={18} aria-hidden="true" />}
            title="Mirror"
            state={snapshot.mirror.state}
            body={snapshot.mirror.divergence.reason}
          />
          <EvidencePanel
            icon={<Package size={18} aria-hidden="true" />}
            title="Artifacts"
            state={snapshot.artifacts.state}
            body={snapshot.artifacts.latestRelease.reason}
          />
          <EvidencePanel
            icon={<Activity size={18} aria-hidden="true" />}
            title="MCP"
            state={snapshot.mcp.state}
            body={`${snapshot.mcp.toolCount} tools, ${snapshot.mcp.liveBackedTools.length} live-backed`}
          />
          <EvidencePanel
            icon={<Terminal size={18} aria-hidden="true" />}
            title="Agent Runs"
            state={snapshot.agentRuns.length > 0 ? 'fresh' : 'missing'}
            body={`${snapshot.agentRuns.length} recorded run(s)`}
          />
          <EvidencePanel
            icon={<Network size={18} aria-hidden="true" />}
            title="Codegraph"
            state={snapshot.codegraph.state}
            body={snapshot.codegraph.reason}
          />
        </div>
      </section>
    </div>
  );
}
