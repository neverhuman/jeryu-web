// RepoFamilyRail.test.tsx — the family on the left of its repositories' pages.
//
// The rail is drawn by the one repository shell, so the shell is what these
// tests render: a family of three invented repositories (acme), one of them
// the portal, and one repository the forge puts in no family at all.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RepoLayout } from '../RepoLayout';
import { FamilyScopeProvider } from '../../family/FamilyScopeProvider';
import { FAMILY_SCOPE_STORAGE_SLOT } from '../../family/familyScope';
import type { RepoTabKey } from '../../../pages/repoShellModel';

const MEMBERS = [
  { name: 'widget-web', family: 'acme-split', health: 'healthy', pulls: 2 },
  { name: 'widget-cli', family: 'acme-split', health: 'failing', pulls: 1 },
  {
    name: 'widget-portal',
    family: 'acme-split',
    health: 'degraded',
    pulls: 0,
    role: 'public_portal',
  },
  { name: 'solo', family: null, health: 'healthy', pulls: 0, owner: 'initech' },
];

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ isPending: false, user: { role: 'admin' } }),
}));

/** The gate's Node has no backing localStorage; the adapter needs one. */
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

/** The shell at one width: the rail, its toggle or the header's select. */
function atWidth(width: number): () => void {
  const original = window.matchMedia;
  window.matchMedia = ((media: string) => {
    const min = media.match(/min-width:\s*(\d+)px/);
    const max = media.match(/max-width:\s*(\d+)px/);
    const matches = min
      ? width >= Number(min[1])
      : max
        ? width <= Number(max[1])
        : false;
    return {
      matches,
      media,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

/** What the presence routes answer; null is an older server without them. */
let presenceBody: Record<string, unknown> | null = null;

function presenceRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'external:cli:one',
    source: 'external',
    agent: 'codex',
    model: 'model-x',
    operator: 'ada',
    branch: 'ada/fix',
    state: 'active',
    started_at: Date.now() - 600_000,
    last_active_at: Date.now() - 60_000,
    links: {},
    collides_with: [],
    repos: ['acme/widget-cli'],
    families: [],
    ...overrides,
  };
}

describe('the family rail inside the repository shell', () => {
  let restoreWidth = (): void => {};

  beforeEach(() => {
    restoreWidth = atWidth(1440);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: makeStorage(),
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/repos') {
        const family = url.searchParams.get('family');
        return json({
          generated_at: '2026-10-01T00:00:00Z',
          total: 0,
          repositories: MEMBERS.filter(
            (member) => !family || member.family === family
          ).map(summary),
          facets: { hosts: ['acme'], owners: ['acme'], families: ['acme-split'], languages: [] },
        });
      }
      if (url.pathname === '/api/v1/bootstrap') {
        return json({
          generated_at: '2026-10-01T00:00:00Z',
          schema_version: '0.1.0',
          viewer: {
            id: 'usr_1',
            login: '@dana',
            display_name: 'Dana',
            avatar_url: null,
            global_permissions: ['repo.admin'],
          },
        });
      }
      if (presenceBody && url.pathname.endsWith('agent-presence')) {
        return json(presenceBody);
      }
      return json({ code: 'not_found', message: url.pathname }, 404);
    });
  });

  afterEach(() => {
    restoreWidth();
    presenceBody = null;
    vi.restoreAllMocks();
  });

  it('lists the family active agents, live ones only, with a collision mark', async () => {
    presenceBody = {
      items: [
        presenceRow({ id: 'external:cli:one', collides_with: ['external:cli:two'] }),
        presenceRow({
          id: 'external:cli:two',
          agent: 'claude-code',
          operator: 'grace',
          collides_with: ['external:cli:one'],
        }),
        presenceRow({ id: 'external:cli:gone', agent: 'old-agent', state: 'ended' }),
      ],
      total: 3,
    };
    renderShell('acme/widget-web', 'code');

    const agents = await screen.findByTestId('family-agents');
    expect(screen.getByTestId('family-agents-count')).toHaveTextContent('2');
    expect(agents).toHaveTextContent('codex · model-x');
    expect(agents).toHaveTextContent('grace');
    expect(agents).not.toHaveTextContent('old-agent');
    expect(screen.getByTestId('family-agent-collision-external:cli:one')).toBeInTheDocument();
    expect(
      screen.getByTestId('family-agent-external:cli:one').querySelector('a')
    ).toHaveAttribute('href', '/repos/acme/acme/widget-cli/agents');
  });

  it('says plainly when no agent is active in the family', async () => {
    presenceBody = { items: [], total: 0 };
    renderShell('acme/widget-web', 'code');

    expect(await screen.findByTestId('family-agents-empty')).toHaveTextContent(
      'No agents are active in this family.'
    );
  });

  it('draws no agents section when the server has no presence route', async () => {
    renderShell('acme/widget-web', 'code');

    await screen.findByTestId('repo-family-rail');
    await waitFor(() => {
      expect(screen.getByTestId('repo-family-member-widget-cli')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('family-agents')).not.toBeInTheDocument();
    expect(screen.queryByTestId('family-agents-error')).not.toBeInTheDocument();
  });

  it('counts the live agents on the Agents tab from the presence list', async () => {
    presenceBody = {
      items: [
        presenceRow({ id: 'a', state: 'active' }),
        presenceRow({ id: 'b', state: 'idle' }),
        presenceRow({ id: 'c', state: 'ended' }),
      ],
      total: 3,
    };
    renderShell('acme/widget-web', 'agents');

    expect(await screen.findByTestId('repo-tab-count-agents')).toHaveTextContent('2');
  });

  it('names the family, rolls it up, and lists its members with the portal first', async () => {
    renderShell('acme/widget-web', 'code');

    const rail = await screen.findByTestId('repo-family-rail');
    expect(rail).toHaveAccessibleName('acme family');
    expect(rail).toHaveTextContent('3 repos');
    // Worst-of health across the three; the rollup's open pull requests link
    // to the family's In flight view.
    expect(
      await screen.findByRole('status', { name: 'acme family health: failing' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '3 open pull requests in flight' })
    ).toHaveAttribute('href', '/in-flight?family=acme-split');
    expect(rail).toHaveTextContent('1 failing');

    const members = screen.getByRole('navigation', { name: 'Repositories in acme' });
    expect(
      Array.from(members.querySelectorAll('a')).map((link) => link.textContent)
    ).toEqual(['widget-portal0', 'widget-cli1', 'widget-web2']);
    expect(screen.getByTestId('repo-family-member-widget-web')).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByTestId('repo-family-member-widget-cli')).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('keeps the tab when a member is clicked: pulls stays pulls', async () => {
    renderShell('acme/widget-web', 'pulls');

    expect(await screen.findByTestId('repo-family-member-widget-cli')).toHaveAttribute(
      'href',
      '/repos/acme/acme/widget-cli/pulls'
    );
  });

  it('puts the repository family in scope for every page after it', async () => {
    renderShell('acme/widget-web', 'code');

    await screen.findByTestId('repo-family-rail');
    // The canonical key, the one Needs you and the shift queue say.
    await waitFor(() =>
      expect(window.sessionStorage.getItem(FAMILY_SCOPE_STORAGE_SLOT)).toBe('acme')
    );
    // A repository states its family by being that repository: no `?family=`.
    expect(screen.getByTestId('where')).toHaveTextContent(
      '/repos/acme/acme/widget-web'
    );
  });

  it('moves to the next and the previous member with Alt+Down and Alt+Up', async () => {
    renderShell('acme/widget-cli', 'pulls');
    await screen.findByTestId('repo-family-rail');

    fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true });
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent(
        '/repos/acme/acme/widget-web/pulls'
      )
    );
  });

  it('gives a repository in no family no rail, and says so in one chip', async () => {
    renderShell('initech/solo', 'code');

    expect(await screen.findByTestId('repo-no-family')).toHaveTextContent('no family');
    expect(screen.queryByTestId('repo-family-rail')).toBeNull();
    expect(screen.queryByTestId('repo-family-select')).toBeNull();
  });

  it('collapses the rail to a remembered toggle between 720px and 1279px', async () => {
    restoreWidth();
    restoreWidth = atWidth(1024);
    renderShell('acme/widget-web', 'code');

    const toggle = await screen.findByTestId('repo-family-rail-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('repo-family-rail')).not.toBeVisible();
    expect(window.localStorage.getItem('jeryu.repoFamilyRail.v1')).toBe('closed');
  });

  it('switches repository from a select on a phone', async () => {
    restoreWidth();
    restoreWidth = atWidth(390);
    renderShell('acme/widget-web', 'pulls');

    const select = await screen.findByTestId('repo-family-select');
    expect(select).toHaveAccessibleName('Switch repo in acme');
    expect(screen.getByTestId('repo-family-rail')).not.toBeVisible();

    fireEvent.change(select, { target: { value: 'uuid-widget-cli' } });
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent(
        '/repos/acme/acme/widget-cli/pulls'
      )
    );
  });
});

function Where(): JSX.Element {
  const location = useLocation();
  return (
    <span data-testid="where">{`${location.pathname}${location.search}`}</span>
  );
}

function renderShell(fullName: string, tab: RepoTabKey): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const [owner, name] = fullName.split('/');
  const base = `/repos/acme/${owner}/${name}${tab === 'pulls' ? '/pulls' : ''}`;
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[base]}>
        <FamilyScopeProvider>
          <Where />
          <Routes>
            <Route
              path="/repos/:provider/*"
              element={
                <RepoLayout provider="acme" fullName={fullName} tab={tab}>
                  <p>the page</p>
                </RepoLayout>
              }
            />
          </Routes>
        </FamilyScopeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function summary(member: (typeof MEMBERS)[number]): Record<string, unknown> {
  const owner = 'owner' in member && member.owner ? member.owner : 'acme';
  return {
    id: { id: `uuid-${member.name}`, host: 'acme', owner, name: member.name },
    entity: { kind: 'repository', id: `uuid-${member.name}` },
    description: null,
    visibility: 'internal',
    default_branch: 'main',
    family: member.family,
    archived: false,
    repo_role: 'role' in member ? member.role : null,
    topics: [],
    language: null,
    health: member.health,
    open_pull_requests: member.pulls,
    failing_checks: member.health === 'failing' ? 1 : 0,
    running_jobs: 0,
    active_agents: 0,
    blocked_agents: 0,
    updated_at: '2026-10-01T00:00:00Z',
    clone_http_url: null,
    clone_ssh_url: null,
    available_actions: [],
  };
}
