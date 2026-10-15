// 47-pr-merge-gate.spec.ts — the Merge button while a required gate runs.
//
// What the owner hit: a pull request whose only blocker was the required
// gate still running. The merge box offered no Merge button and said nothing
// about the gate, so the page read as "merging is forbidden here" when the
// true answer was "wait four minutes".
//
// The button is on the page now, disabled, with the wait beside it and the
// run's own progress; when the gate finishes and the forge nudges the page,
// the button enables itself without a reload.
//
// Everything named here is invented: acme/widget-api, its author and its
// reviewer exist only in this fixture.

import { expect, test, type Page } from './fixtures/test';

import {
  mockBootstrap,
  mockPullRequestCommits,
  mockPullRequestDetail,
  mockPullRequestDiff,
  mockPullRequestThreads,
  mockRepoLookup,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const REPO = { host: 'acme', owner: 'acme', name: 'widget-api' } as const;
const REPO_ID = `${REPO.host}:${REPO.owner}/${REPO.name}`;
const PR_NUMBER = '111';
const HEAD_SHA = '7c1d2e3f4a5b60718293a4b5c6d7e8f901234567';
const BASE = `/repos/${REPO.host}/${REPO.owner}/${REPO.name}/pulls/${PR_NUMBER}`;
const REQUIRED = `${REPO.owner}/required`;
const AUTHOR = '@dana';
const REVIEWER = '@red-team';
const DETAIL_ROUTE = /\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+$/;
const CHECKS_ROUTE = /\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/checks$/;

/** The gate started four minutes ago on the forge's clock, and usually takes eight. */
function runningChecks(nowMs: number): unknown {
  return {
    total: 1,
    passing: 0,
    failing: 0,
    pending: 1,
    skipped: 0,
    server_time: new Date(nowMs).toISOString(),
    checks: [
      {
        id: '1',
        name: REQUIRED,
        kind: 'status',
        status: 'pending',
        conclusion: null,
        details_url: null,
        description: 'gate run 812 in progress',
        required: true,
        advisory: null,
        started_at: new Date(nowMs - 4 * 60_000).toISOString(),
        completed_at: null,
        running: {
          recipe: 'required',
          started_at: new Date(nowMs - 4 * 60_000).toISOString(),
          typical_seconds: 480,
          slow_seconds: 900,
          samples: 9,
        },
      },
    ],
  };
}

function greenChecks(nowMs: number): unknown {
  return {
    total: 1,
    passing: 1,
    failing: 0,
    pending: 0,
    skipped: 0,
    server_time: new Date(nowMs).toISOString(),
    checks: [
      {
        id: '1',
        name: REQUIRED,
        kind: 'status',
        status: 'success',
        conclusion: 'success',
        details_url: null,
        description: 'gate run 812 passed',
        required: true,
        advisory: null,
        started_at: new Date(nowMs - 4 * 60_000).toISOString(),
        completed_at: new Date(nowMs).toISOString(),
      },
    ],
  };
}

/** The same pull request once its required gate has gone green. */
function cleared(blocked: Record<string, unknown>): Record<string, unknown> {
  const detail = JSON.parse(JSON.stringify(blocked)) as Record<string, unknown>;
  const summary = detail.summary as Record<string, unknown>;
  summary.mergeable = {
    level: 'mergeable',
    can_merge: true,
    reason: null,
    exact_head_sha: HEAD_SHA,
    required_gate: null,
  };
  detail.merge_passport = {
    status: 'pass',
    head_sha: HEAD_SHA,
    blockers: [],
    evaluated_at: new Date().toISOString(),
  };
  return detail;
}

/**
 * A pull request whose only blocker is the required gate, still running.
 * Returns a switch: calling it makes every later answer the cleared one.
 */
async function seed(page: Page): Promise<() => void> {
  const nowMs = Date.now();
  let gateGreen = false;
  await mockBootstrap(page, {
    login: REVIEWER,
    global_permissions: ['repo.read', 'code.read', 'pr.write'],
  });
  await mockRepoLookup(page, { id: REPO, default_branch: 'main' });
  const blocked = await mockPullRequestDetail(page, {
    repoId: REPO_ID,
    number: PR_NUMBER,
    title: 'Say why a login was refused',
    author: AUTHOR,
    head_sha: HEAD_SHA,
    head_ref: 'feature/login',
    passport: 'blocked',
    approvals: 1,
    required_approvals: 1,
    description: 'The login route answered 401 with an empty body.',
    blockers: [
      {
        code: 'passport_blocked_pending_checks',
        message: `Required context \`${REQUIRED}\` is queued or running.`,
        details: REQUIRED,
      },
    ],
  });
  const green = cleared(blocked);
  // Registered after the mock, so this handler is asked first and hands the
  // request back when the gate has not finished yet.
  await page.route(DETAIL_ROUTE, async (route, request) => {
    if (!gateGreen || request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(green),
    });
  });
  await page.route(CHECKS_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(gateGreen ? greenChecks(nowMs) : runningChecks(nowMs)),
    })
  );
  await mockPullRequestDiff(page, {
    headSha: HEAD_SHA,
    files: [{ path: 'src/login.rs', lines: ['+ say why'] }],
  });
  await mockPullRequestThreads(page, [], REPO);
  await mockPullRequestCommits(page, [
    {
      sha: HEAD_SHA,
      message: 'Say why a login was refused',
      date: '2026-05-26T00:00:00Z',
    },
  ]);
  return () => {
    gateGreen = true;
  };
}

test('a running required gate keeps Merge on the page, disabled, and says how long @action:pr.merge_gate_pending', async ({
  page,
  realtime,
}) => {
  const finishTheGate = await seed(page);
  await page.route(/\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/owner-paths$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      head_sha: HEAD_SHA, base_ref: 'main', passport_hash: 'owner-fixture', blocked: true,
      enforce_admins: true, viewer_is_admin: false, viewer_may_clear_as_owner: false,
      headline: 'The required gate must finish.',
      blockers: [{ code: 'passport_blocked_pending_checks', message: 'Required gate running',
        how: 'Wait for the exact-head gate to finish.', owner_can_clear: false }],
    }) })
  );
  await page.goto(BASE);
  await expect(page.getByTestId('pr-owner-paths')).toBeVisible();

  const merge = page.getByRole('button', { name: 'Merge', exact: true });
  await expect(merge).toBeVisible({ timeout: 15_000 });
  await expect(merge).toBeDisabled();
  await expect(merge).toHaveAttribute('aria-disabled', 'true');

  // The reason, in words, with the Checks tab behind it.
  const reason = page.getByTestId('pr-merge-reason-passport_blocked_pending_checks');
  await expect(reason).toContainText(`Waiting for ${REQUIRED} to finish`);
  await expect(reason.getByRole('link')).toHaveAttribute('href', `${BASE}/checks`);

  // And how long the wait has to run: four minutes into a usual eight.
  await expect(page.getByTestId('pr-merge-gate-progress')).toContainText('about 4m left');

  // The gate goes green and the forge says a runner changed: the page
  // refetches and the button enables itself, with nothing left beside it.
  await realtime.waitForOpen();
  await realtime.hello();
  finishTheGate();
  await realtime.event({
    seq: 2,
    scope: `repo.${REPO.owner}.${REPO.name}`,
    kind: 'runner.changed',
    entity: `${REPO.owner}/${REPO.name}`,
  });

  await expect(merge).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByTestId('pr-owner-paths')).toHaveCount(0);
  await expect(page.getByTestId('pr-merge-gate')).toHaveCount(0);
  await expect(page.getByTestId('pr-merge-headline')).toHaveText('Ready to merge');
});
