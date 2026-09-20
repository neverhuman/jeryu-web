// pullRoomMocks.ts — the cross-repo Pull requests page: the control-plane
// snapshot, the repository list that gives each repo its family, and the
// per-repo pull request lists the timeline loads.

import type { Page } from '@playwright/test';

import { mockRepoList } from './mocks';

type Snapshot = ReturnType<typeof controlPlane>;

/** The per-repo list the timeline loads, built from the snapshot's pull requests. */
export function pullSummaries(snapshot: Snapshot, repo: string) {
  const [owner, name] = repo.split('/');
  return snapshot.pullRequests
    .filter((pr) => pr.repo === repo)
    .map((pr) => ({
      repo: { id: repo, host: 'jeryu', owner, name },
      number: pr.number,
      entity: { kind: 'pull_request', id: `${repo}#${pr.number}` },
      title: pr.title,
      author: pr.author,
      head_ref: pr.headRef,
      base_ref: pr.baseRef,
      head_sha: pr.headSha,
      base_sha: pr.baseSha,
      state: pr.state ?? 'open',
      draft: pr.draft,
      mergeable: { level: 'blocked', can_merge: false, reason: 'checks', exact_head_sha: pr.headSha, required_gate: null },
      review: { required_approvals: 1, approvals: 0, changes_requested: 0, unresolved_threads: 0, user_review_state: null },
      checks: {
        total: pr.checks.total,
        passing: pr.checks.successful,
        failing: pr.checks.failing,
        pending: pr.checks.running + pr.checks.queued,
        skipped: 0,
      },
      agents: { active_sessions: 0, proposed_patches: 0, evidence_packets: 0, blockers: 0 },
      labels: [],
      updated_at: `2026-06-05T00:00:0${pr.number % 10}Z`,
      passport_hash: null,
      available_actions: [],
    }));
}

export async function mockPullRoom(page: Page, snapshot = controlPlane()): Promise<void> {
  // Families come from the repository list; bob/jeryu has none and reads "other".
  await mockRepoList(page, [
    { id: { host: 'jeryu', owner: 'alice', name: 'jeryu' }, family: 'core' },
    { id: { host: 'jeryu', owner: 'bob', name: 'jeryu' }, family: null },
  ]);
  await page.route('**/api/v1/repos/*/pulls**', async (route) => {
    const repo = decodeURIComponent(new URL(route.request().url()).pathname.split('/')[4]);
    if (repo === 'bob/broken') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"boom","message":"list unavailable"}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: pullSummaries(snapshot, repo), next_cursor: null }),
    });
  });
  await page.route('**/api/v1/control-plane/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(snapshot),
    });
  });
  await page.route('**/api/v1/ecosystem', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        live: true,
        degradedReason: '',
        tools: [
          {
            name: 'jeryu.get_system_snapshot',
            className: 'GetSystemSnapshot',
            conformance: 'read-only',
            sideEffects: ['read-only'],
            dataClasses: [],
            dependsOn: [],
          },
          {
            name: 'jeryu.propose_patch',
            className: 'ProposePatch',
            conformance: 'mutating',
            sideEffects: ['mutating'],
            dataClasses: ['repo'],
            dependsOn: ['jeryu.get_system_snapshot'],
          },
        ],
      }),
    });
  });
  await page.route('**/api/v1/codegraph/tool-build/clusters**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schema_version: 'codegraph.tool_build/v1',
        repo: null,
        include_ignored: false,
        clusters: [
          {
            cluster_id: 'cluster-live',
            repo_id: 'alice/jeryu',
            commit_sha: 'abc',
            fingerprint: 'fp',
            score: 92,
            occurrence_count: 4,
            repo_count: 1,
            file_count: 3,
            total_lines: 64,
            language: 'rust',
            insight: 'normalized retry loop repeated across API clients',
            normalized_preview: 'loop retry call',
            occurrences: [],
          },
        ],
      }),
    });
  });
}

export function controlPlane() {
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
      openPrCount: 2,
      draftPrCount: 0,
      queuedCheckCount: 1,
      runningCheckCount: 0,
      failingCheckCount: 1,
      missingCheckPrCount: 1,
      priorityCount: 0,
      criticalPriorityCount: 0,
      highPriorityCount: 0,
      mirrorState: 'missing',
      artifactState: 'missing',
      runnerState: 'fresh',
    },
    repos: [
      {
        id: 'repo-1',
        fullName: 'alice/jeryu',
        owner: 'alice',
        name: 'jeryu',
        defaultBranch: 'main',
        private: false,
        archived: false,
        disabled: false,
        openPullRequests: 2,
        draftPullRequests: 0,
        queuedChecks: 1,
        runningChecks: 0,
        failingChecks: 1,
        latestHeadSha: 'head-7',
        state: 'fresh',
      },
    ],
    pullRequests: [
      {
        repo: 'alice/jeryu',
        number: 7,
        title: 'Fix BFF PR list',
        author: 'alice',
        draft: false,
        state: 'open',
        headRef: 'feature/pulls',
        headSha: 'head-7',
        baseRef: 'main',
        baseSha: 'base-7',
        mergeable: false,
        mergeableState: 'blocked',
        changedFiles: ['crates/jeryu-api/src/web/pulls.rs'],
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
      {
        repo: 'alice/jeryu',
        number: 8,
        title: 'Repair check posture',
        author: 'bob',
        draft: false,
        state: 'open',
        headRef: 'feature/checks',
        headSha: 'head-8',
        baseRef: 'main',
        baseSha: 'base-8',
        mergeable: false,
        mergeableState: 'blocked',
        changedFiles: ['apps/web/src/pages/PullRoomPage.tsx'],
        stateEvidence: 'failed',
        sourceLinks: [],
        checks: {
          total: 1,
          queued: 0,
          running: 0,
          failing: 1,
          successful: 0,
          missing: false,
        },
      },
    ],
    checkRuns: [],
    workflows: [],
    releases: { state: 'missing', latestRelease: null, releaseCount: 0, reason: '', docsUrl: '' },
    artifacts: {
      schemaVersion: 'jeryu.artifacts.latest/v1',
      state: 'missing',
      latestBuild: { state: 'missing', artifactCount: 0, reason: '', sourceLinks: [] },
      latestRelease: { state: 'missing', artifactCount: 0, reason: '', sourceLinks: [] },
      mirrorArtifacts: { state: 'missing', artifactCount: 0, reason: '', sourceLinks: [] },
      docsUrl: 'docs/release.md',
      absenceIsSuccess: false,
    },
    runners: {
      schemaVersion: 'jeryu.runner_fabric/v1',
      local: {
        state: 'fresh',
        nodes: 1,
        onlineRunners: 1,
        offlineRunners: 0,
        busyRunners: 0,
        idleRunners: 1,
        totalSlots: 10,
        activeSlots: 10,
        utilization: 0,
        lastUpdated: null,
        nodeDetails: [],
      },
      mirror: { name: 'mirror', state: 'missing', reason: '', docsUrl: '' },
    },
    workcells: {},
    agentRuns: [],
    codegraph: {
      state: 'fresh',
      indexedSymbols: 10,
      indexedReferences: 30,
      crateEdges: 2,
      indexedFiles: 5,
      latestIndexRun: null,
      reason: 'codegraph store is reachable',
    },
    toolBuild: {
      state: 'fresh',
      clusterCount: 1,
      ignoredCount: 0,
      topClusters: [],
    },
    mcp: { state: 'fresh', toolCount: 2, liveBackedTools: [], degradedTools: [] },
    mirror: {
      schemaVersion: 'jeryu.remote.status/v1',
      state: 'missing',
      mirrors: [],
      divergence: {
        state: 'unknown',
        reason: 'mirror missing',
        localDefaultBranches: [],
        mirrorDefaultBranches: [],
      },
    },
    priorities: [],
    repoGraph: {
      schemaVersion: 'jeryu.repo_graph/v1',
      generatedAt: '2026-06-05T00:00:00Z',
      nodes: [],
      edges: [],
      clusters: [],
      insights: [],
    },
  };
}
