import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RepoRouter } from '../RepoRouter';
import { FILES_PANEL_KEY } from '../repoBrowserModel';

// The gate's Node defines a global localStorage that is undefined without a
// backing file; the page goes through the storage adapter, so the test brings
// its own Storage, as the adapter's test does.
function makeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

const FRONT = '/repos/jeryu/neverhuman/jeryu';

let authUser: { role: string } | null = { role: 'user' };
// The summary builder is module-level, so the failing-check count is too.
let failingChecks = 0;
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ isPending: false, user: authUser }),
}));

describe('RepositoryBrowserPage (one repository page)', () => {
  let hasCode = true;
  let treeOnlyMissing = false;

  beforeEach(() => {
    authUser = { role: 'user' };
    hasCode = true;
    treeOnlyMissing = false;
    failingChecks = 0;
    Object.defineProperty(window, 'localStorage', { configurable: true, value: makeStorage() });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    vi.stubGlobal(
      'WebSocket',
      class {
        static OPEN = 1;
        readyState = 1;
        addEventListener(): void {}
        removeEventListener(): void {}
        send(): void {}
        close(): void {}
      }
    );
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      const path = url.searchParams.get('path') ?? '';
      switch (url.pathname) {
        case '/api/v1/repos':
          return json({
            generated_at: '2026-05-26T00:00:00Z',
            total: 1,
            repositories: [repoSummary()],
            facets: { hosts: ['jeryu'], owners: ['neverhuman'], families: ['jeryu-split'], languages: [] },
          });
        case '/api/v1/repos/repo-1/refs':
          return json([
            { name: 'main', sha: 'abc123', kind: 'branch', protected: true },
            { name: 'release', sha: 'abc124', kind: 'branch', protected: false },
            { name: 'v1.2.0', sha: 'abc125', kind: 'tag', protected: false },
          ]);
        case '/api/v1/repos/repo-1/commits':
          if (!hasCode) return json({ code: 'not_found', message: 'no git data' }, 404);
          return json({
            ref: 'main',
            sha: 'fee1900dcafe0000000000000000000000000000',
            commits: [
              {
                sha: 'fee1900dcafe0000000000000000000000000000',
                summary: 'Say what the repository page never said',
                author: 'Ada Lovelace',
                committed_at: '2026-05-25T09:00:00Z',
              },
            ],
            page: { limit: 1, page: 1, total: 1204, has_more: true },
          });
        case '/api/v3/repos/neverhuman/jeryu/commits/main/check-runs':
          return json({
            check_runs: [
              {
                name: 'jankurai/proof',
                conclusion: 'failure',
                completed_at: '2026-05-25T10:00:00Z',
                output: { title: 'score 84 < floor 85', summary: '- score: 84' },
              },
            ],
          });
        case '/api/v1/repos/repo-1/readme':
          if (!hasCode) return json({ code: 'not_found', message: 'no readme' }, 404);
          return json({
            html: '<p>Portal</p>',
            markdown: '# Portal\n\nSee [docs](docs/testing.md).\n',
            toc: [],
            links: [],
            renderer_version: 'test',
            sanitizer_version: null,
            rendered_at: '2026-05-26T00:00:00Z',
          });
        case '/api/v1/repos/repo-1/tree':
          if (!hasCode || treeOnlyMissing) return json({ code: 'not_found', message: 'no tree' }, 404);
          return json(
            path === 'src'
              ? [entry('src/lib.rs', 'file')]
              : [entry('src', 'directory'), entry('README.md', 'file')]
          );
        case '/api/v1/repos/repo-1/blob':
          return json({
            repo: { id: 'repo-1', host: 'jeryu', owner: 'neverhuman', name: 'jeryu' },
            path,
            ref_name: 'main',
            sha: 'f00dfeed',
            size_bytes: 12,
            mime: 'text/plain',
            encoding: 'utf8',
            text: 'pub fn portal() {}\n',
            base64: null,
            rendered_markdown: null,
            is_binary: false,
          });
        default:
          return json({ code: 'not_found', message: url.pathname }, 404);
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the README with one quiet line and no card column or Browse code button', async () => {
    renderAt(FRONT);
    expect(await screen.findByRole('heading', { level: 1, name: 'Portal' })).toBeInTheDocument();
    expect(screen.getByTestId('repo-overview-page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2 open pull requests' })).toHaveAttribute(
      'href',
      `${FRONT}/pulls`
    );
    expect(screen.getByRole('link', { name: 'jeryu-split' })).toHaveAttribute(
      'href',
      '/repos/family/jeryu-split'
    );
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute(
      'href',
      `${FRONT}/blob/main/docs/testing.md`
    );
    expect(screen.queryByRole('link', { name: 'Browse code' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Default branch' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Agents' })).toBeNull();
  });

  it('keeps the Files panel and its open folders while a file opens, and highlights the file', async () => {
    renderAt(FRONT);
    const files = await screen.findByRole('button', { name: 'Files' });
    expect(files).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(await screen.findByRole('treeitem', { name: 'src' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: 'lib.rs' }));

    // Same page, now reading the file; the panel did not collapse or reload.
    expect(await screen.findByTestId('repo-file-page')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(`${FRONT}/blob/main/src/lib.rs`);
    expect(await screen.findByText('pub fn portal() {}')).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'src' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('treeitem', { name: 'lib.rs' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('complementary', { name: 'Files' })).toBeVisible();

    // Hide it: the choice is remembered, and the button becomes the filled action.
    fireEvent.click(screen.getByRole('button', { name: 'Files' }));
    expect(screen.getByRole('button', { name: 'Files' })).toHaveAttribute('aria-expanded', 'false');
    expect(window.localStorage.getItem(FILES_PANEL_KEY)).toBe('closed');
    expect(screen.queryByRole('complementary', { name: 'Files' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Files' }).className).toContain('action-button--primary');
  });

  it('shows one "Find files" affordance: in the panel while it is open, in the header while it is closed', async () => {
    renderAt(FRONT);
    const panel = await screen.findByRole('complementary', { name: 'Files' });
    const openFinders = screen.getAllByRole('button', { name: 'Find files' });
    expect(openFinders).toHaveLength(1);
    expect(panel).toContainElement(openFinders[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Files' }));
    const closedFinders = screen.getAllByRole('button', { name: 'Find files' });
    expect(closedFinders).toHaveLength(1);
    expect(screen.queryByRole('complementary', { name: 'Files' })).toBeNull();
    expect(closedFinders[0].closest('.repo-browser__line')).not.toBeNull();
  });

  it('opens a deep link to a file with its folders already open', async () => {
    renderAt(`${FRONT}/blob/main/src/lib.rs`);
    expect(await screen.findByRole('treeitem', { name: 'lib.rs' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('starts closed on a narrow screen, and /code opens it on the front page', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
    const { unmount } = renderAt(FRONT);
    expect(await screen.findByRole('button', { name: 'Files' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    unmount();

    renderAt(`${FRONT}/code`);
    expect(await screen.findByRole('button', { name: 'Files' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByTestId('location')).toHaveTextContent(FRONT);
    expect(screen.getByTestId('location')).not.toHaveTextContent('/code');
  });

  it('sends the retired tracker URLs to the front page instead of a 404', async () => {
    for (const tail of ['work', 'issues']) {
      const { unmount } = renderAt(`${FRONT}/${tail}`);
      expect(await screen.findByTestId('repo-overview-page')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(FRONT));
      unmount();
    }
  });

  it('says plainly when a repository has no code here, and offers no Files button', async () => {
    hasCode = false;
    renderAt(FRONT);
    expect(await screen.findByText('No code on this forge')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Files' })).toBeNull();
    expect(screen.queryByText('No README found')).toBeNull();
  });

  it('signed out, shows a public repository', async () => {
    authUser = null;
    renderAt(FRONT);
    expect(await screen.findByRole('heading', { level: 1, name: 'Portal' })).toBeInTheDocument();
  });

  it('signed out, sends a repository the public list lacks to login and back', async () => {
    authUser = null;
    renderAt('/repos/jeryu/neverhuman/secret');
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        `/login?next=${encodeURIComponent('/repos/jeryu/neverhuman/secret')}`
      )
    );
  });

  it('signed in, says a missing repository is not found', async () => {
    renderAt('/repos/jeryu/neverhuman/secret');
    expect(await screen.findByText('Repository not found')).toBeInTheDocument();
  });

  it('still shows a README when only the tree is missing', async () => {
    treeOnlyMissing = true;
    renderAt(FRONT);
    expect(await screen.findByRole('heading', { level: 1, name: 'Portal' })).toBeInTheDocument();
    expect(screen.queryByText('No code on this forge')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Files' })).toBeNull();
  });

  it('summarises the commits, branches and tags of the shown ref', async () => {
    renderAt(FRONT);
    const facts = await screen.findByTestId('repo-commit-summary');
    expect(facts).toHaveTextContent('1,204 commits · 2 branches · 1 tag');
    expect(facts).toHaveTextContent('fee1900d');
    expect(facts).toHaveTextContent('Say what the repository page never said');
    expect(facts).toHaveTextContent('Ada Lovelace');
  });

  it('links the score to the quality gate and opens the check that set the chip', async () => {
    failingChecks = 1;
    renderAt(FRONT);
    expect(await screen.findByTestId('repo-overview-score')).toHaveAttribute(
      'href',
      '/quality-gate'
    );
    const chip = await screen.findByTestId('repo-health-chip');
    expect(chip).toHaveTextContent('warning · 1 failing check');
    expect(chip).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('jankurai/proof')).toBeInTheDocument();
    expect(screen.getByText('score 84 < floor 85', { exact: false })).toBeInTheDocument();
  });

  it('leaves the chip a plain pill when nothing is failing', async () => {
    renderAt(FRONT);
    expect(await screen.findByLabelText('Health: healthy')).toBeInTheDocument();
    expect(screen.queryByTestId('repo-health-chip')).toBeNull();
  });

  it('says nothing about commits when the repository has no git data here', async () => {
    hasCode = false;
    renderAt(FRONT);
    expect(await screen.findByText('No code on this forge')).toBeInTheDocument();
    expect(screen.queryByTestId('repo-commit-summary')).toBeNull();
  });
});

function Where(): JSX.Element {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

function renderAt(path: string): { unmount: () => void } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <Routes>
          <Route path="/repos/:provider/*" element={<RepoRouter />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function entry(path: string, kind: 'file' | 'directory'): Record<string, unknown> {
  return {
    path,
    name: path.split('/').pop(),
    kind,
    sha: 'abc',
    size_bytes: null,
    last_commit_sha: null,
    last_commit_message: null,
    last_commit_at: null,
  };
}

function repoSummary(): Record<string, unknown> {
  return {
    id: { id: 'repo-1', host: 'jeryu', owner: 'neverhuman', name: 'jeryu' },
    entity: { kind: 'repository', id: 'repo-1' },
    description: 'Portal repo',
    visibility: 'public',
    default_branch: 'main',
    family: 'jeryu-split',
    repo_role: 'public_portal',
    topics: [],
    language: null,
    health: failingChecks > 0 ? 'warning' : 'healthy',
    open_pull_requests: 2,
    failing_checks: failingChecks,
    running_jobs: 0,
    active_agents: 0,
    blocked_agents: 0,
    updated_at: '2026-05-26T00:00:00Z',
    clone_http_url: null,
    clone_ssh_url: null,
    available_actions: [],
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
