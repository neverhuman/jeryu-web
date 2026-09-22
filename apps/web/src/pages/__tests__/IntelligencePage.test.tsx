// IntelligencePage.test.tsx - render smoke for the JMCP page.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { IntelligencePage, snapshotState } from '../IntelligencePage';
import { CONTROL_PLANE_QUERY_KEY } from '../../hooks/useControlPlane';
import type {
  ControlPlaneSnapshot,
  EcosystemResponse,
  ToolBuildClustersResponse,
} from '../../api/types';

function renderIntelligence(snapshot: ControlPlaneSnapshot): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(CONTROL_PLANE_QUERY_KEY, snapshot);
  client.setQueryData(['ecosystem'], sampleEcosystem());
  client.setQueryData(['tool-build-clusters', 10], sampleToolBuildClusters());
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <IntelligencePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('snapshotState', () => {
  it('is fresh only when every displayed source is fresh', () => {
    const base = sampleSnapshot();
    expect(snapshotState(base)).toBe('missing');
    const fresh: ControlPlaneSnapshot = {
      ...base,
      mirror: { ...base.mirror, state: 'fresh' },
      artifacts: { ...base.artifacts, state: 'fresh' },
      mcp: { ...base.mcp, state: 'fresh' },
      codegraph: { ...base.codegraph, state: 'fresh' },
      agentRuns: [{} as ControlPlaneSnapshot['agentRuns'][number]],
    };
    expect(snapshotState(fresh)).toBe('fresh');
    expect(snapshotState({ ...fresh, mcp: { ...fresh.mcp, state: 'failed' } })).toBe('failed');
  });
});

describe('IntelligencePage', () => {
  it('renders absence evidence, graph clusters and tool dossiers, and leaves priorities to Needs you', () => {
    renderIntelligence(sampleSnapshot());

    expect(screen.getByTestId('intelligence-page')).toBeInTheDocument();
    // One list of what needs a person, in one place: this page links to it and
    // no longer ranks its own "priorities" from an older rule set.
    expect(screen.queryByTestId('priority-pr-1-checks-missing')).toBeNull();
    expect(screen.queryByText('Top priorities')).toBeNull();
    expect(screen.queryByText('Priorities')).toBeNull();
    expect(screen.getByRole('link', { name: 'Needs you' })).toHaveAttribute('href', '/needs-you');
    // Plain words in the header: no protocol strings, schema ids or rule versions.
    expect(screen.getByText('none recorded yet')).toBeInTheDocument();
    expect(screen.queryByText('absence=evidence')).toBeNull();
    expect(screen.queryByText('jeryu.control_plane/v1')).toBeNull();
    expect(screen.queryByText('rules-v1')).toBeNull();
    expect(screen.getByRole('link', { name: /^Runners: 4/ })).toHaveAttribute('href', '/runners');
    expect(screen.getByRole('link', { name: /^Open PRs: 1/ })).toHaveAttribute('href', '/pull-room');
    expect(screen.getByTestId('repo-graph-preview')).toBeInTheDocument();
    expect(screen.getByTestId('operator-graph-console')).toBeInTheDocument();
    expect(screen.getByTestId('node-inspector')).toHaveTextContent(
      'Selected node'
    );
    expect(screen.getByTestId('tool-build-dossiers')).toHaveTextContent(
      'tb-routing'
    );
    // Sources are missing, so the header must not claim the snapshot is fresh.
    expect(screen.getByTestId('intelligence-snapshot-state')).toHaveTextContent('snapshot: missing');
    expect(screen.getByText('Mirror evidence')).toBeInTheDocument();
    expect(
      screen.getAllByText(/GitHub mirror evidence unavailable/i).length
    ).toBeGreaterThan(0);
  });
});

function sampleSnapshot(): ControlPlaneSnapshot {
  return {
    schemaVersion: 'jeryu.control_plane/v1',
    generatedAt: '2026-06-05T00:00:00Z',
    localAuthority: {
      sourceOfTruth: 'local_jeryu',
      state: 'fresh',
      docsUrl: 'docs/architecture.md',
    },
    summary: {
      repoCount: 1,
      openPrCount: 1,
      draftPrCount: 1,
      queuedCheckCount: 0,
      runningCheckCount: 0,
      failingCheckCount: 0,
      missingCheckPrCount: 1,
      priorityCount: 2,
      criticalPriorityCount: 0,
      highPriorityCount: 1,
      mirrorState: 'missing',
      artifactState: 'missing',
      runnerState: 'fresh',
    },
    repos: [
      {
        id: '1',
        fullName: 'jeryu/demo',
        owner: 'jeryu',
        name: 'demo',
        defaultBranch: 'main',
        openPullRequests: 1,
        draftPullRequests: 1,
        queuedChecks: 0,
        runningChecks: 0,
        failingChecks: 0,
        latestHeadSha: null,
        state: 'fresh',
      },
    ],
    pullRequests: [
      {
        repo: 'jeryu/demo',
        number: 1,
        title: 'feature',
        author: 'alice',
        draft: true,
        state: 'draft',
        headRef: 'feature',
        headSha: 'abc',
        baseRef: 'main',
        baseSha: 'def',
        mergeable: false,
        mergeableState: 'blocked',
        changedFiles: ['src/lib.rs'],
        stateEvidence: 'missing',
        sourceLinks: [],
        checks: {
          total: 0,
          queued: 0,
          running: 0,
          failing: 0,
          successful: 0,
          missing: true,
        },
      },
    ],
    checkRuns: [],
    workflows: [],
    artifacts: {
      schemaVersion: 'jeryu.artifacts.latest/v1',
      state: 'missing',
      latestBuild: {
        state: 'missing',
        artifactCount: 0,
        reason: 'local build artifacts are not stored yet',
        sourceLinks: [],
      },
      latestRelease: {
        state: 'missing',
        artifactCount: 0,
        reason: 'release evidence is absent',
        sourceLinks: [],
      },
      mirrorArtifacts: {
        state: 'missing',
        artifactCount: 0,
        reason: 'mirror artifacts unavailable',
        sourceLinks: [],
      },
      docsUrl: 'docs/release.md#release-receipt',
      absenceIsSuccess: false,
    },
    releases: {
      state: 'missing',
      latestRelease: null,
      releaseCount: 0,
      reason: 'release persistence absent',
      docsUrl: 'docs/release.md',
    },
    runners: {
      schemaVersion: 'jeryu.runner_fabric/v1',
      local: {
        state: 'fresh',
        nodes: 4,
        onlineRunners: 4,
        offlineRunners: 1,
        busyRunners: 1,
        idleRunners: 3,
        totalSlots: 40,
        activeSlots: 30,
        utilization: 0.03,
        lastUpdated: null,
        nodeDetails: [],
      },
      mirror: {
        name: 'github_actions_runners',
        state: 'missing',
        reason: 'mirror runner adapter missing',
        docsUrl: 'docs/agent-native-standard.md',
      },
    },
    workcells: {},
    agentRuns: [],
    codegraph: {
      state: 'missing',
      indexedSymbols: 0,
      indexedReferences: 0,
      crateEdges: 0,
      indexedFiles: 0,
      latestIndexRun: null,
      reason: 'codegraph empty',
    },
    toolBuild: {
      state: 'missing',
      clusterCount: 0,
      ignoredCount: 0,
      topClusters: [],
    },
    mcp: {
      state: 'fresh',
      toolCount: 42,
      liveBackedTools: ['jeryu.control_plane.status'],
      degradedTools: [],
    },
    mirror: {
      schemaVersion: 'jeryu.remote.status/v1',
      state: 'missing',
      mirrors: [
        {
          name: 'github',
          state: 'missing',
          reason: 'mirror missing',
          docsUrl: 'docs/agent-native-standard.md',
        },
      ],
      divergence: {
        state: 'unknown',
        reason: 'GitHub mirror evidence unavailable',
        localDefaultBranches: [],
        mirrorDefaultBranches: [],
      },
    },
    priorities: [
      {
        id: 'pr-1-checks-missing',
        title: 'PR #1 has no head checks',
        severity: 'high',
        score: 840,
        confidence: 1,
        owner: 'forge-api',
        proofLane: 'cargo test -p jeryu-api --features web --jobs 40 control_plane',
        recommendedAction: 'refresh check-runs',
        evidence: ['head_sha=abc'],
        sourceLinks: [],
        state: 'missing',
        rulesVersion: 'rules-v1',
      },
      {
        id: 'github-mirror-missing',
        title: 'GitHub mirror evidence unavailable',
        severity: 'medium',
        score: 600,
        confidence: 1,
        owner: 'forge-api',
        proofLane: 'cargo test -p jeryu-api --features web --jobs 40 control_plane',
        recommendedAction: 'attach read-only mirror evidence',
        evidence: ['divergence unknown'],
        sourceLinks: [],
        state: 'missing',
        rulesVersion: 'rules-v1',
      },
    ],
    repoGraph: {
      schemaVersion: 'jeryu.repo_graph/v1',
      generatedAt: '2026-06-05T00:00:00Z',
      nodes: [
        {
          id: 'repo:jeryu/demo',
          label: 'jeryu/demo',
          kind: 'repo',
          state: 'fresh',
          weight: 2,
          metadata: {},
        },
        {
          id: 'mirror:github',
          label: 'GitHub mirror',
          kind: 'remote_mirror',
          state: 'missing',
          weight: 1,
          metadata: {},
        },
      ],
      edges: [],
      clusters: [
        {
          id: 'cluster:superseded-mirror',
          label: 'Mirror evidence',
          kind: 'superseded_mirror',
          state: 'missing',
          severity: 'medium',
          nodeIds: ['mirror:github'],
          insights: ['GitHub mirror evidence unavailable'],
        },
      ],
      insights: [],
    },
  };
}

function sampleEcosystem(): EcosystemResponse {
  return {
    live: true,
    degradedReason: '',
    tools: [
      {
        name: 'jeryu.control_plane.status',
        className: 'ControlPlaneStatus',
        conformance: 'read-only',
        sideEffects: [],
        dataClasses: ['control-plane'],
        dependsOn: [],
        repo: 'jeryu/demo',
      },
    ],
  };
}

function sampleToolBuildClusters(): ToolBuildClustersResponse {
  return {
    schema_version: 'jeryu.tool_build.clusters/v1',
    repo: null,
    include_ignored: false,
    clusters: [
      {
        cluster_id: 'tb-routing',
        repo_id: 'jeryu/demo',
        commit_sha: 'abc',
        fingerprint: 'fp',
        score: 91,
        occurrence_count: 5,
        repo_count: 1,
        file_count: 3,
        total_lines: 80,
        language: 'rust',
        insight: 'Repeated route glue can become a local tool.',
        normalized_preview: 'route handler',
        occurrences: [],
      },
    ],
  };
}
