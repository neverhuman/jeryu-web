// 43-commits.spec.ts — the history of code: blame on a file, the commits list
// of a ref or of one file, and one commit's message and diff.
//
// The file view carries History and Blame beside Raw and Download; the
// repository page's commit count opens the list; the list pages while the
// server says there is more; a sha opens the commit itself.

import { expect, test, type Page, type Route } from './fixtures/test';

import {
  mockBlob,
  mockBootstrap,
  mockCommits,
  mockReadme,
  mockRefs,
  mockRepoLookup,
  mockTreeByPath,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const FRONT = '/repos/jeryu/acme/widget';
const HEAD = 'a'.repeat(40);
const PARENT = 'b'.repeat(40);

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockRepo(page: Page): Promise<void> {
  await mockBootstrap(page);
  await mockRepoLookup(page, {
    id: { host: 'jeryu', owner: 'acme', name: 'widget' },
    default_branch: 'main',
  });
  await mockRefs(page, [{ name: 'main', kind: 'branch', default: true }]);
  await mockReadme(page, { html: '<h1>Widget</h1>' });
  await mockTreeByPath(page, {
    '': [
      { path: 'src', kind: 'directory' },
      { path: 'README.md', kind: 'file' },
    ],
    src: [{ path: 'src/main.rs', kind: 'file' }],
  });
}

/** The ref's two commits, whole: the paging test brings its own one-per-page. */
async function mockHistory(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/repos\/[^/]+\/commits(\?.*)?$/, async (route, request) => {
    const url = new URL(request.url());
    const commits = [
      {
        sha: HEAD,
        summary: 'feat: call run',
        author: 'Ada Lovelace',
        committed_at: '2026-05-25T09:00:00Z',
      },
      {
        sha: PARENT,
        summary: 'feat: add the entry point',
        author: 'Bea Fermat',
        committed_at: '2026-05-24T09:00:00Z',
      },
    ];
    await json(route, {
      ref: url.searchParams.get('ref') ?? 'main',
      sha: HEAD,
      commits,
      page: {
        limit: Number(url.searchParams.get('limit') ?? '30'),
        page: 1,
        total: commits.length,
        has_more: false,
      },
    });
  });
}

async function mockBlame(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/repos\/[^/]+\/blame(\?.*)?$/, (route, request) =>
    json(route, {
      ref: 'main',
      sha: HEAD,
      path: new URL(request.url()).searchParams.get('path') ?? 'src/main.rs',
      line_count: 3,
      hunks: [
        { start_line: 1, line_count: 2, commit: PARENT },
        { start_line: 3, line_count: 1, commit: HEAD },
      ],
      commits: [
        {
          sha: PARENT,
          summary: 'feat: add the entry point',
          author: 'Bea Fermat',
          authored_at: '2026-05-24T09:00:00Z',
          boundary: true,
        },
        {
          sha: HEAD,
          summary: 'feat: call run',
          author: 'Ada Lovelace',
          authored_at: '2026-05-25T09:00:00Z',
          boundary: false,
        },
      ],
    })
  );
}

async function mockCommitDetail(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/repos\/[^/]+\/commit\/[^/]+$/, (route) =>
    json(route, {
      sha: HEAD,
      summary: 'feat: call run',
      message: 'feat: call run\n\nThe entry point did nothing.\n\nTodo: 20261003-020854\n',
      author: 'Ada Lovelace',
      author_email: 'ada@acme.example',
      authored_at: '2026-05-25T09:00:00Z',
      committed_at: '2026-05-25T09:00:00Z',
      parents: [PARENT],
      truncated: false,
      files: [
        {
          path: 'src/main.rs',
          old_path: null,
          status: 'modified',
          additions: 2,
          deletions: 1,
          risk: null,
          is_binary: false,
          hunks: [
            {
              header: '@@ -1,2 +1,3 @@',
              old_start: 1,
              old_lines: 2,
              new_start: 1,
              new_lines: 3,
              lines: [' fn main() {', '-}', '+    run();', '+}'],
            },
          ],
        },
      ],
    })
  );
}

test('a file offers History and Blame, and blame names who wrote each run of lines @action:code.blame', async ({
  page,
}) => {
  await mockRepo(page);
  await mockHistory(page);
  await mockBlame(page);
  await mockBlob(page, {
    text: 'fn main() {\n    run();\n}\n',
    html: '',
    mime: 'text/plain',
    path: 'src/main.rs',
  });

  await page.goto(`${FRONT}/blob/main/src/main.rs`);
  await expect(page.getByTestId('repo-file-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'File history' })).toHaveAttribute(
    'href',
    `${FRONT}/commits/main?path=src%2Fmain.rs`
  );

  await page.getByRole('button', { name: 'Show blame' }).click();
  await expect(page).toHaveURL(/\?view=blame$/);
  const blame = page.getByTestId('blame-view');
  await expect(blame).toBeVisible();
  await expect(blame.getByText('Bea Fermat')).toBeVisible();
  await expect(blame.getByRole('link', { name: 'feat: call run' })).toHaveAttribute(
    'href',
    `${FRONT}/commit/${HEAD}`
  );

  await page.getByRole('button', { name: 'Hide blame' }).click();
  await expect(page.getByTestId('blame-view')).toHaveCount(0);
});

test('the commit count opens the list, the list pages and filters by path @action:repo.commits_list', async ({
  page,
}) => {
  await mockRepo(page);
  await mockCommits(page, [{ summary: 'feat: call run', sha: HEAD }], { total: 2 });

  await page.goto(FRONT);
  await expect(page.getByTestId('repo-overview-page')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: '2 commits' }).click();
  await expect(page).toHaveURL(`${FRONT}/commits/main`);

  // From here the list answers one commit per page, so paging is the only
  // way to the second one.
  await mockHistory(page);
  await page.goto(`${FRONT}/commits/main`);
  await expect(page.getByTestId('repo-commits-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('repo-commit-row')).toHaveCount(2);
  await expect(page.getByTestId('repo-commits-range')).toHaveText('Commits 1–2 of 2');

  await page.goto(`${FRONT}/commits/main?path=src%2Fmain.rs`);
  await expect(
    page.getByRole('heading', { name: 'History of src/main.rs' })
  ).toBeVisible();
  await expect(page.getByTestId('repo-commit-row').first()).toContainText('feat: call run');
});

test('the commits list pages while the server says there is more @action:repo.commits_paging', async ({
  page,
}) => {
  await mockRepo(page);
  // One commit per page: the route answers `has_more` on the first page only.
  await page.route(/\/api\/v1\/repos\/[^/]+\/commits(\?.*)?$/, async (route, request) => {
    const url = new URL(request.url());
    const wanted = Number(url.searchParams.get('page') ?? '1');
    const all = [
      {
        sha: HEAD,
        summary: 'feat: call run',
        author: 'Ada Lovelace',
        committed_at: '2026-05-25T09:00:00Z',
      },
      {
        sha: PARENT,
        summary: 'feat: add the entry point',
        author: 'Bea Fermat',
        committed_at: '2026-05-24T09:00:00Z',
      },
    ];
    await json(route, {
      ref: 'main',
      sha: HEAD,
      commits: all.slice(wanted - 1, wanted),
      page: { limit: 1, page: wanted, total: all.length, has_more: wanted < all.length },
    });
  });

  await page.goto(`${FRONT}/commits/main`);
  await expect(page.getByTestId('repo-commits-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('repo-commit-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Newer' })).toBeDisabled();

  await page.getByRole('button', { name: 'Older' }).click();
  await expect(page).toHaveURL(`${FRONT}/commits/main?page=2`);
  await expect(page.getByTestId('repo-commit-row')).toContainText('feat: add the entry point');
  await expect(page.getByRole('button', { name: 'Older' })).toBeDisabled();

  await page.getByRole('button', { name: 'Newer' }).click();
  await expect(page).toHaveURL(`${FRONT}/commits/main`);
  await expect(page.getByTestId('repo-commit-row')).toContainText('feat: call run');
});

test('one commit shows its message, its trailers and its diff @action:repo.commit_detail', async ({
  page,
}) => {
  await mockRepo(page);
  await mockHistory(page);
  await mockCommitDetail(page);

  await page.goto(`${FRONT}/commit/${HEAD}`);
  await expect(page.getByTestId('repo-commit-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('repo-commit-subject')).toHaveText('feat: call run');
  await expect(page.getByText('The entry point did nothing.')).toBeVisible();
  await expect(page.getByText('20261003-020854')).toBeVisible();
  await expect(page.getByRole('link', { name: /parent bbbbbbbb/ })).toHaveAttribute(
    'href',
    `${FRONT}/commit/${PARENT}`
  );

  const diff = page.getByRole('region', { name: 'Diff for src/main.rs' });
  await expect(diff).toBeVisible();
  await expect(diff).toContainText('run();');
});
