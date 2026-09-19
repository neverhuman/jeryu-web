// 14-pull-room.spec.ts - W-FE-11 Pull Room smoke.

import { expect, test, type Page } from '@playwright/test';

import { blockingViolations, persistAxeResult, runAxe } from './fixtures/accessibility';
import { AppShellPage } from './pages/AppShellPage';
import { mockBootstrap, mockRepoList } from './fixtures/mocks';

test.describe.configure({ retries: 1 });

async function blockWebSocket(page: Page): Promise<void> {
  await page.context().route('**/api/v1/ws', (route) =>
    route.abort('failed').catch(() => undefined)
  );
}

type Snapshot = ReturnType<typeof controlPlane>;

/** The per-repo list the timeline loads, built from the snapshot's pull requests. */
function pullSummaries(snapshot: Snapshot, repo: string) {
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
      state: 'open',
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

async function mockPullRoom(page: Page, snapshot = controlPlane()): Promise<void> {
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

test('Pull requests shows every open pull request as a timeline row, filters, and keeps the board one click away @action:pull_room.timeline @action:pull_room.filters @action:pull_room.search @action:pull_room.cockpit_link', async ({
  page,
}) => {
  await blockWebSocket(page);
  await mockBootstrap(page);
  await mockPullRoom(page);

  const shell = new AppShellPage(page);
  await shell.goto('/pull-room');
  await shell.assertShellLoaded();

  await expect(page.getByTestId('pull-room-page')).toBeVisible();
  // The timeline is the page: one row per open pull request, led by owner/name#n.
  const row = page.getByTestId('pull-timeline-alice/jeryu-7');
  await expect(row).toContainText('alice/jeryu#7');
  await expect(row).toContainText('Fix BFF PR list');
  await expect(page.getByTestId('pull-stage-alice/jeryu-7-checks')).toHaveAttribute('data-status', 'pending');
  await expect(page.getByTestId('pull-stage-alice/jeryu-8-checks')).toHaveAttribute('data-status', 'blocked');
  // One sentence where three stat tiles were.
  await expect(page.getByTestId('pull-room-sentence')).toHaveText(
    '2 open · 1 waiting on checks · 1 stopped by a failing check'
  );
  await expect(page.getByText('Open pull requests across every repository.')).toBeVisible();
  await expect(page.getByText('Tooling opportunities')).toHaveCount(0);
  await expect(page.getByText(/tool clusters/i)).toHaveCount(0);

  const link = page.getByRole('link', { name: /Fix BFF PR list/ });
  await expect(link).toHaveAttribute('href', '/repos/jeryu/alice/jeryu/pulls/7');

  // The filters fold away until someone wants them, and they filter the rows.
  await expect(page.getByLabel('Search pull requests')).toBeHidden();
  await page.getByText('Filters', { exact: true }).click();
  await page.getByLabel('Search pull requests').fill('Fix');
  await expect(page.getByTestId('pull-timeline-alice/jeryu-8')).toHaveCount(0);
  await expect(row).toBeVisible();
  await page.getByLabel('Search pull requests').fill('');

  // The lane board is still there, one click away, and the URL says so.
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await expect(page).toHaveURL(/view=board/);
  await page
    .locator('section[aria-label="Pull request filters"]')
    .getByLabel('Checks')
    .selectOption('missing');
  await expect(page.getByTestId('pull-lane-missing_checks')).toBeVisible();
  // An empty lane is a header over nothing: only lanes that hold a PR render.
  await expect(page.getByTestId('pull-lane-failing_checks')).toHaveCount(0);
  await expect(page.getByTestId('pull-card-alice/jeryu-7').getByTestId('pull-card-author')).toHaveText('by alice');
  await expect(page.getByText(/W-FE-11/i)).toHaveCount(0);
});

test('Pull requests filters by family from a pill, and one repo that does not answer is one quiet line @action:pull_room.family_pills', async ({
  page,
}) => {
  await blockWebSocket(page);
  await mockBootstrap(page);
  const snapshot = controlPlane();
  snapshot.pullRequests[1].repo = 'bob/jeryu';
  snapshot.pullRequests.push({ ...snapshot.pullRequests[0], repo: 'bob/broken', number: 9, title: 'Unlisted work' });
  await mockPullRoom(page, snapshot);
  const shell = new AppShellPage(page);
  await shell.goto('/pull-room');
  await shell.assertShellLoaded();

  const pills = page.getByTestId('pull-room-families');
  await expect(pills.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(pills.getByRole('button', { name: /^core/ })).toContainText('1');
  // Repos the forge gives no family fall under "other".
  await expect(pills.getByRole('button', { name: /^other/ })).toContainText('2');
  // A repo whose list fails is named quietly; the rest of the page still works.
  await expect(page.getByText(/bob\/broken did not answer/)).toBeVisible();
  await expect(page.getByTestId('pull-timeline-alice/jeryu-7')).toBeVisible();
  await expect(page.getByTestId('pull-timeline-bob/jeryu-8')).toBeVisible();

  await pills.getByRole('button', { name: /^core/ }).click();
  await expect(page).toHaveURL(/\/pull-room\?family=core$/);
  await expect(page.getByTestId('pull-timeline-alice/jeryu-7')).toBeVisible();
  await expect(page.getByTestId('pull-timeline-bob/jeryu-8')).toHaveCount(0);
  await expect(page.getByText(/did not answer/)).toHaveCount(0);

  // A pill is a navigation: the back button undoes it.
  await page.goBack();
  await expect(page.getByTestId('pull-timeline-bob/jeryu-8')).toBeVisible();
});

test('Pull Room follows repository URLs and browser history @action:pull_room.filters', async ({ page }, testInfo) => {
  await blockWebSocket(page);
  await mockBootstrap(page);
  const snapshot = controlPlane();
  snapshot.pullRequests[1].repo = 'bob/jeryu';
  await mockPullRoom(page, snapshot);
  const shell = new AppShellPage(page);
  await shell.goto('/pull-room?repo=alice%2Fjeryu&view=queue');
  await shell.assertShellLoaded();
  const repo = page.getByRole('combobox', { name: 'Repo', exact: true });
  await expect(repo).toHaveValue('alice/jeryu');
  await expect(page.getByText('Fix BFF PR list')).toBeVisible();
  await expect(page.getByText('Repair check posture')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('open');

  await page.evaluate(() => {
    window.history.pushState(null, '', '/pull-room?repo=bob%2Fjeryu&view=queue');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(repo).toHaveValue('bob/jeryu');
  await expect(page.getByText('Repair check posture')).toBeVisible();
  await expect(page.getByText('Fix BFF PR list')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'State', exact: true })).toHaveValue('open');
  await page.goBack();
  await expect(repo).toHaveValue('alice/jeryu');
  await page.goForward();
  await expect(repo).toHaveValue('bob/jeryu');
  await repo.selectOption('all');
  await expect(page).toHaveURL(/\/pull-room\?view=queue$/);
  await expect(page.getByText('Fix BFF PR list')).toBeVisible();
  await expect(page.getByText('Repair check posture')).toBeVisible();
  await testInfo.attach('pull-room-url-navigation', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('axe scan: Pull requests timeline with family pills', async ({ page }) => {
  await blockWebSocket(page);
  await mockBootstrap(page);
  const snapshot = controlPlane();
  snapshot.pullRequests[1].repo = 'bob/jeryu';
  await mockPullRoom(page, snapshot);
  await page.goto('/pull-room?family=core');
  await expect(page.getByTestId('pull-timeline-alice/jeryu-7')).toBeVisible({ timeout: 15_000 });
  const results = await runAxe(page);
  await persistAxeResult('pull-requests', results);
  expect(blockingViolations(results).map((v) => v.id)).toEqual([]);
});

function controlPlane() {
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
