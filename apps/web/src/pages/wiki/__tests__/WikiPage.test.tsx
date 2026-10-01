import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WikiPage } from '../WikiPage';

const WIKI = {
  id: 'repo-1',
  host: 'jeryu',
  owner: 'acme',
  name: 'handbook',
  full_name: 'acme/handbook',
  default_branch: 'main',
  private: true,
};

const SETUP = [
  '---',
  'title: Setting up',
  'owner: platform',
  '---',
  '# Setting up',
  '',
  'Read [[index]] first.',
  '',
  '## Install',
  'Run the installer.',
].join('\n');

const responses: Record<string, unknown> = {};

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'ada', role: 'user' } }),
}));
vi.mock('../../../api/client', () => ({
  apiGet: vi.fn(async (url: string) => {
    const key = Object.keys(responses).find((prefix) => url.startsWith(prefix));
    if (!key) throw new Error(`unmocked ${url}`);
    return responses[key];
  }),
}));

function storage(): Storage {
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

function renderAt(path: string): void {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/wiki/*" element={<WikiPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('WikiPage', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage() });
    for (const key of Object.keys(responses)) delete responses[key];
  });

  it('says so when no wiki is set up', async () => {
    responses['/api/v1/site-settings'] = { internal_wiki: null };
    renderAt('/wiki');
    expect(await screen.findByText('No wiki has been set up')).toBeInTheDocument();
  });

  it('shows the page tree, the rendered page and a change note per section', async () => {
    responses['/api/v1/site-settings'] = { internal_wiki: WIKI };
    responses['/api/v1/repos/repo-1/pages'] = {
      ref: 'main',
      sha: 'c'.repeat(40),
      truncated: false,
      pages: [
        { path: 'index.md', size_bytes: 10 },
        { path: 'notes/outside.md', size_bytes: 10 },
        { path: 'wiki/guides/setup.md', size_bytes: 90 },
      ],
    };
    responses['/api/v1/repos/repo-1/blob'] = { text: SETUP, is_binary: false };
    responses['/api/v1/repos/repo-1/blame'] = {
      ref: 'main',
      sha: 'c'.repeat(40),
      path: 'wiki/guides/setup.md',
      line_count: 10,
      hunks: [
        { start_line: 1, line_count: 6, commit: 'a1' },
        { start_line: 7, line_count: 1, commit: 'b2' },
        { start_line: 8, line_count: 1, commit: 'a1' },
        { start_line: 9, line_count: 2, commit: 'b2' },
      ],
      commits: [
        { sha: 'b2', summary: 'docs: add install step', author: 'Bea', authored_at: '2026-02-01T00:00:00Z', boundary: false },
        { sha: 'a1', summary: 'docs: first setup page', author: 'Ada', authored_at: '2026-01-01T00:00:00Z', boundary: true },
      ],
    };
    responses['/api/v1/repos/repo-1/commits'] = {
      ref: 'main',
      sha: 'c'.repeat(40),
      commits: [{ sha: 'b2', summary: 'docs: add install step', author: 'Bea', committed_at: '2026-02-01T00:00:00Z' }],
      page: { limit: 1, page: 1, total: 1, has_more: false },
    };

    renderAt('/wiki/guides/setup.md');

    const nav = await screen.findByRole('complementary', { name: 'Wiki pages' });
    expect(await within(nav).findByRole('link', { name: 'Home' })).toHaveAttribute('href', '/wiki');
    expect(within(nav).getByRole('link', { name: 'Setup' })).toHaveAttribute('aria-current', 'page');
    // Only the start page and wiki/ are the wiki.
    expect(within(nav).queryByRole('link', { name: 'Outside' })).toBeNull();
    expect(within(nav).getByTestId('wiki-repo-link')).toHaveAttribute('href', '/repos/jeryu/acme/handbook');

    expect(await screen.findByRole('heading', { level: 1, name: 'Setting up' })).toBeInTheDocument();
    // Frontmatter is shown as fields, not as text, and the title is not repeated.
    expect(screen.getByText('platform')).toBeInTheDocument();
    expect(screen.queryByText('title')).toBeNull();
    // `[[index]]` became a link to that page.
    expect(screen.getByRole('link', { name: 'index' })).toHaveAttribute('href', '/wiki');

    const installNote = await screen.findByRole('complementary', { name: 'Changes to lines 9 to 10' });
    expect(within(installNote).getByRole('link', { name: /add install step/ })).toHaveAttribute(
      'href',
      '/repos/jeryu/acme/handbook/commit/b2'
    );
    expect(within(installNote).getByText(/Bea/)).toBeInTheDocument();
    const introNote = screen.getByRole('complementary', { name: 'Changes to lines 5 to 8' });
    expect(within(introNote).getByText(/since/)).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'View source' })).toHaveAttribute(
      'href',
      '/repos/jeryu/acme/handbook/blob/main/wiki/guides/setup.md'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hide change notes' }));
    expect(screen.queryByRole('complementary', { name: /Changes to lines/ })).toBeNull();
    expect(window.localStorage.getItem('jeryu.wiki.notes.v1')).toBe('off');
  });

  it('says when a path is not a page of the wiki', async () => {
    responses['/api/v1/site-settings'] = { internal_wiki: WIKI };
    responses['/api/v1/repos/repo-1/pages'] = {
      ref: 'main',
      sha: 'c'.repeat(40),
      truncated: false,
      pages: [{ path: 'index.md', size_bytes: 10 }, { path: 'wiki/a.md', size_bytes: 10 }],
    };
    renderAt('/wiki/scripts/lint.py');
    expect(await screen.findByText('No page here')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Look for it in the repository' })).toHaveAttribute(
      'href',
      '/repos/jeryu/acme/handbook/blob/main/wiki/scripts/lint.py'
    );
  });

  it('invites adding a start page and a wiki/ folder when both are missing', async () => {
    responses['/api/v1/site-settings'] = { internal_wiki: WIKI };
    responses['/api/v1/repos/repo-1/pages'] = {
      ref: 'main',
      sha: 'c'.repeat(40),
      truncated: false,
      pages: [{ path: 'README.md', size_bytes: 10 }],
    };
    renderAt('/wiki');
    const invite = await screen.findByTestId('wiki-invite');
    expect(within(invite).getByRole('heading', { name: 'Start the wiki' })).toBeInTheDocument();
    expect(invite.textContent).toContain('mkdir wiki');
    expect(invite.textContent).toContain('> index.md');
    expect(within(invite).getByRole('link', { name: 'Open acme/handbook' })).toHaveAttribute(
      'href',
      '/repos/jeryu/acme/handbook'
    );
    expect(screen.getByTestId('wiki-no-folder')).toHaveTextContent('No pages in wiki/ yet');
  });

  it('starts on wiki/README.md when there is no index.md', async () => {
    responses['/api/v1/site-settings'] = { internal_wiki: WIKI };
    responses['/api/v1/repos/repo-1/pages'] = {
      ref: 'main',
      sha: 'c'.repeat(40),
      truncated: false,
      pages: [{ path: 'wiki/README.md', size_bytes: 10 }],
    };
    responses['/api/v1/repos/repo-1/blob'] = { text: '# Team wiki\n', is_binary: false };
    renderAt('/wiki');
    expect(await screen.findByRole('heading', { level: 1, name: 'Team wiki' })).toBeInTheDocument();
    const nav = screen.getByRole('complementary', { name: 'Wiki pages' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByTestId('wiki-invite')).toBeNull();
  });
});
