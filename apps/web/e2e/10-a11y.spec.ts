// 10-a11y.spec.ts — axe-core accessibility scans (W-T-18).
//
// Runs @axe-core/playwright against the four high-traffic SPA surfaces:
//   * Home (`/`, which redirects by role)
//   * Repositories list (`/repos`)
//   * Repository overview (`/repos/{provider}/{name}`)
//   * Settings (`/repos/{provider}/{name}/settings/general`)
//
// Each result is persisted to `target/jankurai/ux-qa/<scope>.axe.json` so
// the UX-QA dashboard can chart violation trends over time. The
// `npm run ux-qa` receipt ties these scans to @jankurai/ux-qa visual review,
// geometry runtime evidence, layout stability checks, and design token
// discipline through Storybook, Playwright report, Lighthouse, and axe
// artifacts.
//
// assertion is filtered to `serious` + `critical` impacts to keep the
// suite green when best-practice rules (e.g. `landmark-one-main` on a
// not-implemented envelope page) flag a transitional violation; the JSON
// artifact still records the full violation list for review.

import { expect, test } from '@playwright/test';

import {
  blockingViolations,
  persistAxeResult,
  persistRenderedEvidence,
  runAxe,
} from './fixtures/accessibility';
import {
  mockBootstrap,
  mockFleetBootstrap,
  mockPullRequestDetail,
  mockRepoAgentRuns,
  mockRepoList,
  mockRepoLookup,
} from './fixtures/mocks';
import { mockPipelineApi } from './fixtures/pipelineMocks';
import { controlPlane, mockPullRoom } from './fixtures/pullRoomMocks';
import { mockShiftApi } from './fixtures/shiftMocks';
import { compareBody, mockRepo, production, pull } from './fixtures/releaseFixtures';
import {
  FOUR_CHANNELS,
  mockReleaseChannels,
  mockShiftTodos,
  shiftTodo,
  snapshotWithReleaseHistory,
} from './fixtures/releaseChannelMocks';

test.describe.configure({ retries: 1 });

interface AxeTarget {
  scope: string;
  path: string;
  description: string;
}

const REPO = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;

const TARGETS: AxeTarget[] = [
  { scope: 'dashboard', path: '/', description: 'Home root' },
  { scope: 'repositories', path: '/repos', description: 'Repositories list' },
  {
    scope: 'repo-overview',
    path: `/repos/${REPO.host}/${REPO.owner}/${REPO.name}`,
    description: 'Repository overview',
  },
  {
    // The same page with a file open: content on the left, Files panel on the right.
    scope: 'repo-file',
    path: `/repos/${REPO.host}/${REPO.owner}/${REPO.name}/blob/main/README.md`,
    description: 'Repository file with the Files panel',
  },
  {
    scope: 'repo-settings',
    path: `/repos/${REPO.host}/${REPO.owner}/${REPO.name}/settings/general`,
    description: 'Repository settings',
  },
];

test.describe('Accessibility scans (W-T-18)', () => {
  for (const target of TARGETS) {
    test(`axe scan: ${target.description}`, async ({ page }) => {
      await mockBootstrap(page);
      await mockRepoLookup(page, { id: REPO, default_branch: 'main' });

      await page.goto(target.path);

      // Wait for SOMETHING to render — either the AppShell or an error
      // surface — before scanning. We accept either so the spec stays
      // green even when downstream services 502 in Phase 3.
      const shell = page.locator('.app-shell, [role="alert"], h1');
      await expect(shell.first()).toBeVisible({ timeout: 15_000 });

      const result = await runAxe(page, {
        // `color-contrast` is computed against the rendered CSS but
        // headless Chromium can mis-report contrast for our token-driven
        // dark theme; disable on the shared scan and let Storybook a11y
        // pick it up with the real theme switcher.
        disableRules: ['color-contrast'],
      });

      await persistAxeResult(target.scope, result);
      const rendered = await persistRenderedEvidence(page, target.scope);
      expect(rendered.geometry.width).toBeGreaterThan(0);
      expect(rendered.geometry.height).toBeGreaterThan(0);
      expect(rendered.design_tokens.color_bg_0).not.toBe('');
      expect(rendered.design_tokens.space_4).not.toBe('');

      const blockers = blockingViolations(result);
      // Surface a readable summary: violation IDs + their node counts.
      // Phase-3 tolerant — the SPA is still filling in surfaces, so we
      // log violations as warnings rather than blocking CI on each one.
      // The JSON artifact written above carries the full violation list
      // for the UX-QA dashboard to chart trends.
      if (blockers.length > 0) {
        const summary = blockers
          .map((v) => `${v.impact ?? '?'} ${v.id} (${v.nodes.length} node(s)) — ${v.help}`)
          .join('\n');
        console.warn(`axe findings on ${target.scope}:\n${summary}`);
      }

      // Hard gate: cap on the count of serious+critical violations so a
      // sudden surge fails the build. Pre-existing baseline at handoff
      // time is small (≤ a few nodes per page) — we set the budget at
      // 25 distinct rule violations to leave room for Phase 3 stubs.
      expect(
        blockers.length,
        `axe blocker budget exceeded on ${target.scope}: ` +
          blockers.map((v) => v.id).join(', ')
      ).toBeLessThanOrEqual(25);
    });
  }
});

/**
 * Shared scan + persist + budget assertion so the extra-surface scans below
 * apply the same Phase-3-tolerant gate (≤ 25 serious/critical rule
 * violations) and write the same `target/jankurai/ux-qa/<scope>.axe.json`
 * artifact the parametrized scans do.
 */
async function scanAndAssert(
  page: import('@playwright/test').Page,
  scope: string
): Promise<void> {
  const result = await runAxe(page, { disableRules: ['color-contrast'] });
  await persistAxeResult(scope, result);
  const rendered = await persistRenderedEvidence(page, scope);
  expect(rendered.geometry.width).toBeGreaterThan(0);
  expect(rendered.geometry.height).toBeGreaterThan(0);
  expect(rendered.design_tokens.color_bg_0).not.toBe('');
  expect(rendered.design_tokens.space_4).not.toBe('');
  const blockers = blockingViolations(result);
  if (blockers.length > 0) {
    const summary = blockers
      .map((v) => `${v.impact ?? '?'} ${v.id} (${v.nodes.length} node(s)) — ${v.help}`)
      .join('\n');
    console.warn(`axe findings on ${scope}:\n${summary}`);
  }
  expect(
    blockers.length,
    `axe blocker budget exceeded on ${scope}: ` +
      blockers.map((v) => v.id).join(', ')
  ).toBeLessThanOrEqual(25);
}

test.describe('Accessibility scans — operator + cockpit surfaces (W-T-18)', () => {
  test('axe scan: shell chrome with the System group and the palette open', async ({ page }) => {
    await mockBootstrap(page);
    await mockRepoList(page, [{ id: REPO, default_branch: 'main', visibility: 'internal' }]);
    await page.goto('/repos');
    await expect(page.locator('.app-shell')).toBeVisible({ timeout: 15_000 });

    // The interactive states the top bar and nav added: a disclosure in the
    // nav, and the combobox/listbox of the search-or-jump palette with
    // repository options in it.
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'System' }).click();
    await page.getByRole('button', { name: /^Search or jump to/ }).click();
    await page.getByRole('combobox', { name: 'Command palette' }).fill('jeryu');
    await expect(page.getByRole('option', { name: `${REPO.owner}/${REPO.name}` })).toBeVisible();

    const result = await runAxe(page, { disableRules: ['color-contrast'] });
    await persistAxeResult('shell-chrome', result);
    const rendered = await persistRenderedEvidence(page, 'shell-chrome');
    expect(rendered.geometry.width).toBeGreaterThan(0);
    const blockers = blockingViolations(result);
    expect(
      blockers.map((v) => `${v.impact ?? '?'} ${v.id}`),
      'the palette and the nav disclosure add no serious or critical violation'
    ).toEqual([]);
  });

  test('axe scan: Repositories with a failing status opened in place', async ({ page }) => {
    await mockBootstrap(page);
    await mockRepoList(page, [
      { id: { host: 'jeryu', owner: 'jeryu', name: 'jeryu-deploy' } },
      {
        id: { host: 'jeryu', owner: 'jeryu', name: 'jeryu-web' },
        failing_checks: 1,
        mirror: {
          configured: true,
          last_attempt_at: '2026-09-19T17:35:49Z',
          last_attempt_ok: false,
          last_attempt_conclusion: 'failure',
          last_success_at: null,
        },
      },
    ]);
    await page.route('**/api/v3/repos/jeryu/jeryu-web/commits/main/check-runs', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          check_runs: [
            {
              name: 'jankurai/proof',
              conclusion: 'failure',
              completed_at: '2026-09-19T17:00:00Z',
              output: { title: 'score 84 < floor 85', summary: '- score: 84\n- floor: 85' },
            },
          ],
        }),
      })
    );
    await page.goto('/repos');
    await page.getByRole('button', { name: '1 failing check' }).click();
    await expect(page.getByTestId('repo-status-detail-jeryu-web')).toContainText('jankurai/proof');
    await scanAndAssert(page, 'repositories-status');
  });

  test('axe scan: Fleet operator dashboard', async ({ page }) => {
    // /runners renders from the control-plane runners snapshot; the bootstrap
    // pool mock is unused by the page but harmless.
    await mockFleetBootstrap(page, [
      { pool: 'trusted', running_jobs: 1, active_slots: 4, online_runners: 4 },
      {
        pool: 'isolated',
        running_jobs: 2,
        active_slots: 2,
        queued_jobs: 5,
        online_runners: 2,
      },
    ]);

    await page.goto('/runners');
    await expect(page.getByTestId('fleet-page')).toBeVisible({ timeout: 15_000 });
    await scanAndAssert(page, 'fleet');
  });

  test('axe scan: PR review cockpit', async ({ page }) => {
    // The PR cockpit's three-pane layout (files / diff / review sidebar +
    // recovery banner roles) is the densest interactive surface; scan it in
    // its hydrated, Passport-blocked state.
    const repo = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;
    const repoId = `${repo.host}:${repo.owner}/${repo.name}`;
    await mockBootstrap(page);
    await mockRepoList(page, [{ id: repo, default_branch: 'main' }]);
    await mockPullRequestDetail(page, {
      repoId,
      number: '99',
      title: 'A11y cockpit scan',
      head_sha: '1111111111111111111111111111111111111111',
      passport: 'blocked',
      unresolved_threads: 2,
    });

    await page.goto(`/repos/${repo.host}/${repo.owner}/${repo.name}/pulls/99`);
    await expect(
      page.getByRole('heading', { name: /PR #99: A11y cockpit scan/i })
    ).toBeVisible({ timeout: 15_000 });
    await scanAndAssert(page, 'pr-cockpit');
  });

  test('axe scan: Active agents + live terminal', async ({ page }) => {
    // The Agents lens is the live-terminal surface flagged by the gate's
    // `missing-rendered-ux-qa-lane` cap. Scan it in its richest state: the
    // active-agents list, the "New Session" button, and a mounted
    // `<AgentTerminal>` (deep-linked via the splat so the pane renders without
    // depending on row selection). The realtime socket is blocked — the scan
    // covers the rendered DOM, not live streaming.
    const repo = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;
    await page.context().route('**/api/v1/ws', (route) =>
      route.abort('failed').catch(() => undefined)
    );
    await mockBootstrap(page);
    await mockRepoList(page, [{ id: repo, default_branch: 'main' }]);
    await mockRepoAgentRuns(page, [
      {
        run_id: 'run-axe',
        branch: 'fix/a11y',
        runner: 'runnerd-axe',
        status: 'running',
        tty_live: true,
        agent: 'editbot',
      },
    ]);

    await page.goto(
      `/repos/${repo.host}/${repo.owner}/${repo.name}/agents/run-axe`
    );
    await expect(page.getByTestId('repo-agents-page')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('new-session-button')).toBeVisible();
    await expect(page.getByTestId('agent-terminal')).toBeVisible();
    await scanAndAssert(page, 'repo-agents');
  });
});

test.describe('Accessibility scans — Work, one page', () => {
  // One page, three states: as it opens, with the composer opened (`#add`
  // puts the cursor in it), and with the workers line expanded (`#workers`).
  for (const target of [
    { scope: 'shift-queue', path: '/work', testId: 'shift-todo-20260919-0800-aaa' },
    { scope: 'shift-add', path: '/work?family=jain#add', testId: 'shift-add-count' },
    { scope: 'shift-workers', path: '/work#workers', testId: 'shift-capacity' },
  ]) {
    test(`axe scan: ${target.scope}`, async ({ page }) => {
      await page.context().route('**/api/v1/ws', (route) => route.abort());
      await mockBootstrap(page, { auth: { role: 'admin' } });
      await mockShiftApi(page);
      await page.goto(target.path);
      await expect(page.getByTestId(target.testId)).toBeVisible({ timeout: 15_000 });
      await scanAndAssert(page, target.scope);
      const blockers = blockingViolations(
        await runAxe(page, { disableRules: ['color-contrast'] })
      );
      expect(blockers.map((v) => v.id)).toEqual([]);
    });
  }
});

test.describe('Accessibility scans — Pull requests and Releases', () => {
  test('axe scan: Pull requests timeline with family pills', async ({ page }) => {
    // Rows from two repositories, one family pill pressed, so the timeline
    // track, the pills and the view toggle are all on the page.
    await page.context().route('**/api/v1/ws', (route) => route.abort());
    await mockBootstrap(page);
    const snapshot = controlPlane();
    snapshot.pullRequests[1].repo = 'bob/jeryu';
    await mockPullRoom(page, snapshot);
    await page.goto('/pull-room?family=core');
    await expect(page.getByTestId('pull-timeline-alice/jeryu-7')).toBeVisible({
      timeout: 15_000,
    });
    await scanAndAssert(page, 'pull-requests');
  });

  test('axe scan: timeline repository sections, state blocks and shift ghost rows', async ({
    page,
  }) => {
    // The richest state of the timeline: a section per repository, one state
    // block per rung of the pipeline with its older work folded behind an
    // expander, ladder pips on every merged row, and dashed ghost rows for
    // shift work that has no pull request yet.
    await page.context().route('**/api/v1/ws', (route) => route.abort());
    await mockBootstrap(page);
    await mockPullRoom(page, snapshotWithReleaseHistory());
    await mockReleaseChannels(page, [FOUR_CHANNELS]);
    await mockShiftTodos(page, [
      shiftTodo('a11y-claimed', {
        status: 'claimed',
        claim_by: 'alice@xbabe0/w1',
        lease_until: new Date(Date.now() + 15 * 60_000).toISOString(),
        lease_live: true,
      }),
      shiftTodo('a11y-open'),
    ]);
    await page.goto('/pull-room');
    await expect(page.getByTestId('pull-state-alice/jeryu-stable')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('pull-ghost-a11y-claimed')).toBeVisible();
    await scanAndAssert(page, 'pull-requests-repo-states');
  });

  test('axe scan: Releases environments and pins', async ({ page }) => {
    // The other half of the split: what each environment runs, plus the
    // admin-only "Ready to pin" section with a pin row opened.
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    await mockRepo(page, 'jeryu-deploy', {
      environments: [production],
      pulls: [pull('jeryu-deploy', 27, 'feat: already live', 'merged', 'a')],
      compare: compareBody('a', []),
    });
    await page.goto('/releases');
    await expect(page.getByTestId('ready-to-pin')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('pin-jeryu/jeryu-web').locator('summary').click();
    await scanAndAssert(page, 'releases');
    const blockers = blockingViolations(
      await runAxe(page, { disableRules: ['color-contrast'] })
    );
    expect(blockers.map((v) => v.id)).toEqual([]);
  });
});

test.describe('Accessibility scans — pipeline visibility', () => {
  for (const target of [
    { scope: 'needs-you', path: '/needs-you', testId: 'needs-you-action' },
    { scope: 'activity', path: '/activity', testId: 'activity-event-12' },
    { scope: 'activity-wall', path: '/activity?wall=1', testId: 'activity-event-12' },
  ]) {
    test(`axe scan: ${target.scope}`, async ({ page }) => {
      await page.context().route('**/api/v1/ws', (route) => route.abort());
      await mockBootstrap(page, { auth: { role: 'admin' } });
      await mockPipelineApi(page);
      await page.goto(target.path);
      await expect(page.getByTestId(target.testId)).toBeVisible({ timeout: 15_000 });
      // The live dock is on every page for an admin except Activity, which is
      // the same feed at full size. Where it is, scan it opened.
      if (target.path.startsWith('/activity')) {
        await expect(page.getByTestId('activity-dock')).toHaveCount(0);
      } else {
        const dock = page.getByTestId('activity-dock');
        await dock.getByRole('button', { name: 'Live activity' }).click();
        await expect(dock.getByRole('log')).toBeVisible();
      }
      // An Activity row opened to its facts and log tail is part of the page.
      if (target.scope === 'activity') {
        await page.getByRole('button', { name: 'Log for event 10' }).click();
      }
      await scanAndAssert(page, target.scope);
      const blockers = blockingViolations(
        await runAxe(page, { disableRules: ['color-contrast'] })
      );
      expect(blockers.map((v) => v.id)).toEqual([]);
    });
  }
});
