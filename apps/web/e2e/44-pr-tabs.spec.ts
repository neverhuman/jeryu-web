// 44-pr-tabs.spec.ts — one pull request as four tabs and one merge box.
//
// What the owner complained about, and what this pins:
//   * a 320px review panel that pushed Checks and Threads below its fold —
//     each is a tab of its own now, at the full width of the page;
//   * file names cut down to `ca`, `log`, `setup` — the Files tab shows
//     `src/login.rs` whole at 1440px;
//   * BLOCKED said four times — the verdict is one headline, and the
//     checklist under it says what to do and where;
//   * a red Close pull request sitting between Approve and the gate — it is
//     the quietest button in the box, and turns red only once asked;
//   * threads with no comment in them — each one shows its body and links to
//     the file it is anchored to;
//   * a failed diff read reported as "this pull request changes no files" —
//     it is an alert now.
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
  mockRepoList,
  mockRepoLookup,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const REPO = { host: 'acme', owner: 'acme', name: 'widget-api' } as const;
const REPO_ID = `${REPO.host}:${REPO.owner}/${REPO.name}`;
const PR_NUMBER = '32';
const HEAD_SHA = '9f1c2d3e4a5b60718293a4b5c6d7e8f901234567';
const BASE = `/repos/${REPO.host}/${REPO.owner}/${REPO.name}/pulls/${PR_NUMBER}`;
const AUTHOR = '@dana';
const REVIEWER = '@red-team';

const CHECKS = {
  total: 2,
  passing: 1,
  failing: 1,
  pending: 0,
  skipped: 0,
  checks: [
    {
      id: '1',
      name: 'acme/required',
      kind: 'status',
      status: 'failure',
      conclusion: 'failure',
      details_url: null,
      description: 'cargo test failed: login_rejects_empty_password',
      web_url: 'https://forge.example/gate/runs/91',
      required: true,
      advisory: null,
      started_at: '2026-05-26T00:00:00Z',
      completed_at: '2026-05-26T00:02:00Z',
    },
    {
      id: '2',
      name: 'acme/docs',
      kind: 'check_run',
      status: 'success',
      conclusion: 'success',
      details_url: null,
      description: null,
      required: false,
      advisory: null,
      started_at: '2026-05-26T00:00:00Z',
      completed_at: '2026-05-26T00:01:00Z',
    },
  ],
};

/** The pull request the owner's complaint is about: 2 things need doing. */
async function seed(
  page: Page,
  options: { diffStatus?: number } = {}
): Promise<void> {
  await mockBootstrap(page, {
    login: REVIEWER,
    global_permissions: ['repo.read', 'code.read', 'pr.write'],
  });
  await mockRepoList(page, [{ id: REPO, default_branch: 'main' }]);
  await mockRepoLookup(page, { id: REPO, default_branch: 'main' });
  await mockPullRequestDetail(page, {
    repoId: REPO_ID,
    number: PR_NUMBER,
    title: 'Say why a login was refused',
    author: AUTHOR,
    head_sha: HEAD_SHA,
    head_ref: 'feature/login',
    passport: 'blocked',
    approvals: 0,
    required_approvals: 1,
    description: 'The login route answered 401 with an empty body.',
    blockers: [
      {
        code: 'passport_blocked_approvals',
        message: 'Required approver count not satisfied.',
      },
      {
        code: 'passport_blocked_checks',
        message: 'A required check is failing on this head.',
      },
    ],
  });
  await page.route(/\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/checks$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CHECKS),
    })
  );
  await mockPullRequestDiff(page, {
    headSha: HEAD_SHA,
    status: options.diffStatus ?? 200,
    files: [
      { path: 'src/login.rs', risk: 'high', lines: ['+ say why', '- stay silent'] },
      { path: 'src/session.rs', lines: ['+ carry the reason'] },
    ],
  });
  await mockPullRequestThreads(
    page,
    [
      {
        id: 'thread-1',
        file_path: 'src/login.rs',
        line: 42,
        author: REVIEWER,
        body: 'This branch swallows the error; say which field was refused.',
      },
    ],
    REPO
  );
  await mockPullRequestCommits(page, [
    {
      sha: HEAD_SHA,
      message: 'Say why a login was refused',
      date: '2026-05-26T00:00:00Z',
    },
  ]);
}

/** Every element whose own words say the merge is held up. */
async function blockedStatements(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('body *'))
      .filter((node) =>
        Array.from(node.childNodes).some(
          (child) =>
            child.nodeType === Node.TEXT_NODE &&
            /\bblocked\b/i.test(child.textContent ?? '')
        )
      )
      .map((node) => node.textContent ?? '')
  );
}

test('each tab of a pull request has its own URL and is the current one @action:pr.tabs', async ({
  page,
}) => {
  await seed(page);

  const tabs = [
    { tail: '', key: 'conversation', testId: 'pr-conversation-tab' },
    { tail: '/files', key: 'files', testId: 'pr-files-tab' },
    { tail: '/checks', key: 'checks', testId: 'pr-checks-tab' },
    { tail: '/commits', key: 'commits', testId: 'pr-commits' },
  ] as const;

  for (const tab of tabs) {
    await page.goto(`${BASE}${tab.tail}`);
    await expect(page.getByTestId(tab.testId)).toBeVisible({ timeout: 15_000 });
    const bar = page.getByRole('navigation', { name: 'Pull request', exact: true });
    await expect(bar.getByRole('link')).toHaveCount(4);
    await expect(page.getByTestId(`pr-tab-${tab.key}`)).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(bar.locator('[aria-current="page"]')).toHaveCount(1);
    // The counts: two changed files, one failing check, one commit.
    await expect(page.getByTestId('pr-tab-count-files')).toHaveText('2');
    await expect(page.getByTestId('pr-tab-count-checks')).toHaveText('1');
    await expect(page.getByTestId('pr-tab-count-commits')).toHaveText('1');
    // One neutral state pill in the header, and no second verdict beside it.
    await expect(page.getByTestId('pr-state-badge')).toHaveText('Open');
  }

  // The bar is one tab stop; arrow keys move along it.
  await page.getByTestId('pr-tab-conversation').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('pr-tab-files')).toBeFocused();
});

test('the merge box states the verdict once and lists what is waiting @action:pr.merge_box', async ({
  page,
}) => {
  await seed(page);
  await page.goto(BASE);

  const box = page.getByTestId('pr-merge-box');
  await expect(box).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('pr-merge-headline')).toHaveText(
    'Blocked: 2 things need doing'
  );

  // Exactly two rows are waiting on somebody, and each links to its tab.
  const blockers = box.locator('[data-state="needed"]');
  await expect(blockers).toHaveCount(2);
  await expect(
    page.getByTestId('pr-merge-row-approvals').getByRole('link')
  ).toHaveAttribute('href', `${BASE}/commits`);
  await expect(
    page.getByTestId('pr-merge-row-checks').getByRole('link')
  ).toHaveAttribute('href', `${BASE}/checks`);
  await expect(page.getByTestId('pr-merge-row-checks')).toContainText(
    '1 required check failing'
  );

  // BLOCKED was on the page four times; it is one sentence now.
  expect(await blockedStatements(page)).toEqual(['Blocked: 2 things need doing']);

  // The primary action is the approval of this exact head, with Request
  // changes beside it — and no merge offered while the Passport holds.
  await expect(
    page.getByRole('button', { name: `Approve exact SHA ${HEAD_SHA.slice(0, 7)}` })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request changes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Merge', exact: true })).toHaveCount(0);

  // The description and the pull request's threads are on the same page.
  await expect(page.getByTestId('pr-description')).toContainText(
    'answered 401 with an empty body'
  );
});

test('a thread shows its body and opens the file it is anchored to @action:pr.thread_body', async ({
  page,
}) => {
  await seed(page);
  await page.goto(BASE);

  const thread = page.getByTestId('pr-thread').first();
  await expect(thread).toBeVisible({ timeout: 15_000 });
  await expect(thread.getByTestId('pr-thread-body')).toHaveText(
    'This branch swallows the error; say which field was refused.'
  );

  const anchor = thread.getByRole('link', { name: 'src/login.rs:42' });
  await expect(anchor).toHaveAttribute(
    'href',
    `${BASE}/files?path=src%2Flogin.rs#L42`
  );
  await anchor.click();
  await expect(page.getByTestId('pr-files-tab')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('pr-tab-files')).toHaveAttribute(
    'aria-current',
    'page'
  );
  // The file the thread named is the file on screen.
  await expect(page.locator('.diff-viewer__title')).toContainText('src/login.rs');
});

test('the Files tab shows a whole path at 1440px, and resizes @action:pr.files_tree', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.goto(`${BASE}/files`);

  const tree = page.getByTestId('pr-files-tree');
  await expect(tree).toBeVisible({ timeout: 15_000 });
  // The whole name, not `log`: one element carries `src/login.rs` entire.
  const row = tree.getByRole('button', { name: /src\/login\.rs/ });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('src/login.rs');
  // And it is not clipped: the rendered row is as wide as its text needs.
  const clipped = await row.evaluate(
    (node) => node.scrollWidth > node.clientWidth + 1
  );
  expect(clipped).toBe(false);
  // The risk is a dot that names its tier when pointed at.
  await expect(tree.getByTestId('diff-risk-high')).toHaveAttribute(
    'title',
    'Risk: High'
  );

  // The reader can widen the tree from the keyboard.
  const handle = page.getByTestId('pr-files-handle');
  const before = Number(await handle.getAttribute('aria-valuenow'));
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  expect(Number(await handle.getAttribute('aria-valuenow'))).toBeGreaterThan(before);

  // Below 720px there is no room for two columns: the tree becomes a picker.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('pr-files-picker')).toBeVisible();
  await expect(page.getByTestId('pr-files-tree')).toHaveCount(0);
});

test('Split shows the base and the head side by side @action:pr.diff_split', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.goto(`${BASE}/files?path=src%2Flogin.rs`);

  const viewer = page.getByRole('region', { name: 'Diff for src/login.rs' });
  await expect(viewer).toBeVisible({ timeout: 15_000 });
  // Each row's counts sit at the right edge of the tree, nothing after them.
  const row = page.getByTestId('pr-files-tree').getByRole('button', {
    name: /src\/session\.rs/,
  });
  const gap = await row.evaluate((node) => {
    const counts = node.querySelector('.diff-file-tree__counts');
    return node.getBoundingClientRect().right - (counts?.getBoundingClientRect().right ?? 0);
  });
  expect(gap).toBeLessThan(2);

  const split = viewer.getByRole('button', { name: 'Split' });
  await split.click();
  await expect(split).toHaveAttribute('aria-pressed', 'true');
  // The deletion is on the left, the addition on the right.
  const removed = viewer.locator('.diff-viewer__side--del');
  const added = viewer.locator('.diff-viewer__side--add');
  await expect(removed).toContainText('stay silent');
  await expect(added).toContainText('say why');
  const [left, right] = await Promise.all([
    removed.first().boundingBox(),
    added.first().boundingBox(),
  ]);
  expect(left!.x).toBeLessThan(right!.x);

  await viewer.getByRole('button', { name: 'Unified' }).click();
  await expect(viewer.locator('.diff-viewer__side')).toHaveCount(0);
  await expect(viewer.locator('.diff-viewer__row--del')).toContainText('stay silent');
});

test('a diff that cannot be read is an alert, not an empty pull request @action:pr.diff_error', async ({
  page,
}) => {
  await seed(page, { diffStatus: 500 });
  await page.goto(`${BASE}/files`);

  const alert = page.getByTestId('pr-files-tab').getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toContainText('Could not load the diff');
  await expect(page.getByText('This pull request changes no files.')).toHaveCount(0);
  await expect(page.getByTestId('pr-diff-note')).toHaveCount(0);
});

test('Close is the quietest button, and is not red until confirmed @action:pr.close_confirm', async ({
  page,
}) => {
  await seed(page);
  const patched: Array<string | undefined> = [];
  const comments: string[] = [];
  await page.route(
    `**/api/v3/repos/${REPO.owner}/${REPO.name}/issues/${PR_NUMBER}/comments`,
    async (route, request) => {
      const body = JSON.parse(request.postData() ?? '{}') as { body?: string };
      comments.push(body.body ?? '');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 1, body: body.body }),
      });
    }
  );
  await page.route(
    `**/api/v3/repos/${REPO.owner}/${REPO.name}/pulls/${PR_NUMBER}`,
    async (route, request) => {
      const body = JSON.parse(request.postData() ?? '{}') as { state?: string };
      patched.push(body.state);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ number: Number(PR_NUMBER), state: body.state, merged: false }),
      });
    }
  );

  await page.goto(BASE);
  const ask = page.getByTestId('pr-close');
  await expect(ask).toBeVisible({ timeout: 15_000 });
  // Quiet until asked: no red, and no comment box taking up the box.
  await expect(ask).toHaveClass(/action-button--ghost/);
  await expect(ask).not.toHaveClass(/action-button--human/);
  await expect(page.getByLabel('Closing comment')).toHaveCount(0);

  await ask.click();
  await page.getByLabel('Closing comment').fill('Superseded by #33.');
  const confirm = page.getByTestId('pr-close-confirm');
  await expect(confirm).toHaveClass(/action-button--human/);
  await confirm.click();

  await expect.poll(() => patched.join(','), { timeout: 10_000 }).toBe('closed');
  expect(comments).toEqual(['Superseded by #33.']);
});
