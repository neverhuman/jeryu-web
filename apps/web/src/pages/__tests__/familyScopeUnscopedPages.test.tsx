// familyScopeUnscopedPages.test.tsx — the pages that used to ignore the family
// scope, and the nav badges that used to count every family.
//
// With a family chosen, an operator must see numbers that match the page they
// open: the Runners page shows the runners that family's release board names,
// a rule's flagged heads are its repositories' heads, tool adoption is its
// repositories' adoption, and the left nav's counts narrow with them — each
// saying how many wait in other families, so nothing urgent is hidden.
//
// Invented families only (acme, globex, initech): jeryu is public.

import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AttentionItem, AttentionResponse } from '../../api/types';
import { LeftNav } from '../../layout/LeftNav';
import { DependenciesPage } from '../DependenciesPage';
import { FleetPage } from '../FleetPage';
import { QualityGatePage, QualityGateRulePage } from '../qualityGate';
import { SearchPage } from '../search/SearchPage';
import { ToolFleetPage } from '../ToolFleetPage';
import { attentionItem } from './pipelineTestData';
import { errorResponse, json, renderAt } from './shiftPageHelpers';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'operator', role: 'admin' } }),
}));

/** Two families, one repository each, as `GET /api/v1/repos` reports them. */
const REPOS = {
  generated_at: '2026-10-03T09:00:00Z',
  total: 2,
  repositories: [
    {
      id: { host: 'jeryu', owner: 'acme', name: 'acme-web' },
      family: 'acme-split',
      full_name: 'acme/acme-web',
    },
    {
      id: { host: 'jeryu', owner: 'globex', name: 'globex-web' },
      family: 'globex',
      full_name: 'globex/globex-web',
    },
  ],
  facets: { families: ['acme-split', 'globex'] },
};

function runnerNode(runnerId: string): unknown {
  return {
    runnerId,
    source: 'runnerd',
    state: 'active',
    capacity: 4,
    inFlight: 0,
    labels: ['rust'],
    classes: [],
    activeTaskCount: 0,
    lastUpdated: '2026-10-03T09:00:00Z',
    activeTasks: [],
  };
}

/** The runner snapshot: two gate runners, neither of which names a family. */
const RUNNERS = {
  schemaVersion: 'jeryu.runner_fabric/v1',
  serverTime: '2026-10-03T09:00:00Z',
  local: {
    state: 'fresh',
    nodes: 3,
    onlineRunners: 3,
    offlineRunners: 0,
    busyRunners: 0,
    idleRunners: 3,
    totalSlots: 12,
    activeSlots: 0,
    utilization: 0,
    lastUpdated: '2026-10-03T09:00:00Z',
    nodeDetails: [
      runnerNode('acme-gate/slot0'),
      runnerNode('globex-gate/slot0'),
      runnerNode('shared-gate/slot0'),
    ],
  },
  mirror: { name: 'github_actions_runners', state: 'missing' },
};

/** One lane per family, each naming its own gate runner. */
function board(family: string, runner: string): unknown {
  return {
    schema_version: 1,
    generated_at: '2026-10-03T09:00:00Z',
    family,
    lanes: [
      {
        id: `${family}-lane`,
        name: `${family} lane`,
        read_only: false,
        stages: [
          {
            name: 'production',
            version: 'v1.0.0',
            targets: [{ name: 'gate', runners: [runner] }],
          },
        ],
      },
    ],
  };
}

/** `acme`'s rule flagged a head in each family. */
const RULE = {
  schema_version: 1,
  rule: 'dead-language',
  title: 'Dead language',
  description: 'Words that say nothing.',
  window_days: 14,
  heads: [
    {
      repo: 'acme/acme-web',
      sha: 'a'.repeat(40),
      branch: 'main',
      scored_at: '2026-10-03T08:00:00Z',
      score: 70,
      threshold: 85,
      findings: 2,
      disputes: 0,
    },
    {
      repo: 'globex/globex-web',
      sha: 'b'.repeat(40),
      branch: 'main',
      scored_at: '2026-10-03T07:00:00Z',
      score: 60,
      threshold: 85,
      findings: 1,
      disputes: 0,
    },
  ],
};

/** One tool each family adopts, and one only the other family's repo misses. */
const TOOL_ADOPTION = {
  generated_at: '2026-10-03T09:00:00Z',
  repos_scored: 2,
  tools: [
    {
      tool: 'audit-ci',
      category: 'audit',
      adopting_repos: ['acme/acme-web'],
      applicable_missing_repos: ['globex/globex-web'],
    },
    {
      tool: 'security',
      category: 'security',
      adopting_repos: [],
      applicable_missing_repos: ['globex/globex-web'],
    },
  ],
};

/** Two repositories that depend on each other, one per family. */
const REPO_GRAPH = {
  schemaVersion: 'jeryu.repo_graph/v2',
  generatedAt: '2026-10-03T09:00:00Z',
  nodes: ['acme/acme-web', 'globex/globex-web'].map((name) => ({
    id: `repo:${name}`,
    label: name,
    kind: 'repo',
    state: 'fresh' as const,
    weight: 2,
    metadata: {},
  })),
  edges: [
    {
      source: 'repo:acme/acme-web',
      target: 'repo:globex/globex-web',
      kind: 'depends_on',
      state: 'fresh' as const,
      weight: 1,
      metadata: { pinState: 'current', behind: '0' },
    },
  ],
  clusters: [],
  insights: [],
};

/** The window, with one scored repository per family. */
const OVERVIEW = {
  schema_version: 1,
  generated_at: '2026-10-03T09:00:00Z',
  window_days: 30,
  heads_scored: 30,
  heads_failed: 12,
  fail_rate: 0.4,
  disputes: 2,
  repos_scored: 2,
  rules: [
    {
      rule: 'dead-language',
      title: 'Dead language',
      failures: 6,
      repos: 2,
      disputes: 1,
      dispute_rate: 0.17,
    },
  ],
  repos: [
    { repo: 'acme/acme-web', heads_scored: 10, heads_failed: 2, fail_rate: 0.2, top_rule: null },
    {
      repo: 'globex/globex-web',
      heads_scored: 20,
      heads_failed: 10,
      fail_rate: 0.5,
      top_rule: null,
    },
  ],
  daily: [],
};

/** One match per family, plus a todo that names no repository. */
const SEARCH = {
  generated_at: '2026-10-03T09:00:00Z',
  query: 'gate',
  kinds: ['repository', 'todo'],
  counts: { repository: 2, todo: 1 },
  limit: 10,
  results: [
    {
      kind: 'repository',
      id: 'acme/acme-web',
      title: 'acme/acme-web',
      context: 'acme',
      path: '/repos/jeryu/acme/acme-web',
      repo: { id: '1', host: 'jeryu', owner: 'acme', name: 'acme-web' },
    },
    {
      kind: 'repository',
      id: 'globex/globex-web',
      title: 'globex/globex-web',
      context: 'globex',
      path: '/repos/jeryu/globex/globex-web',
      repo: { id: '2', host: 'jeryu', owner: 'globex', name: 'globex-web' },
    },
    {
      kind: 'todo',
      id: '20261003-0001-aaa',
      title: 'Split the gate',
      context: 'queued',
      path: '/work',
    },
  ],
  problems: [],
};

/** Rows waiting on a person: two in `acme`, one in `globex`, one for Runners. */
const ACROSS_FAMILIES: AttentionItem[] = [
  attentionItem({
    id: 'todo_blocked:acme:1',
    kind: 'todo_blocked',
    requested_by: 'operator',
    severity: 'action',
    title: 'Blocked acme todo',
    family: 'acme',
    todo_id: '20261003-0001-aaa',
  }),
  attentionItem({
    id: 'pr_checks_failing:acme:2',
    kind: 'pr_checks_failing',
    severity: 'critical',
    title: 'Checks failing on acme/acme-web#4',
    repo: 'acme/acme-web',
    pr: 4,
  }),
  attentionItem({
    id: 'todo_blocked:globex:3',
    kind: 'todo_blocked',
    requested_by: 'operator',
    severity: 'action',
    title: 'Blocked globex todo',
    family: 'globex',
    todo_id: '20261003-0002-bbb',
  }),
  attentionItem({
    id: 'workers_down:globex:4',
    kind: 'workers_down',
    severity: 'critical',
    title: 'No healthy worker slot for globex',
    family: 'globex',
  }),
];

function attention(items: AttentionItem[]): AttentionResponse {
  const of = (severity: string): number =>
    items.filter((item) => item.severity === severity).length;
  return {
    schema_version: 'jeryu.attention/v1',
    generated_at: '2026-10-03T09:00:00Z',
    items,
    counts: { critical: of('critical'), action: of('action'), watch: of('watch') },
  };
}

/** Every read these pages make; anything else is an older server (404). */
function mockFleetApi(items: AttentionItem[] = ACROSS_FAMILIES): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    switch (url.pathname) {
      case '/api/v1/repos':
        return json(REPOS);
      case '/api/v1/attention':
        return json(attention(items));
      case '/api/v1/control-plane/runners':
        return json(RUNNERS);
      case '/api/v1/release-board':
        return json({ boards: [{ family: 'acme-split' }, { family: 'globex' }] });
      case '/api/v1/release-board/acme-split':
        return json(board('acme-split', 'acme-gate/slot0'));
      case '/api/v1/release-board/globex':
        return json(board('globex', 'globex-gate/slot0'));
      case '/api/v1/quality-gate/rules/dead-language':
        return json(RULE);
      case '/api/v1/fleet/tool-adoption':
        return json(TOOL_ADOPTION);
      case '/api/v1/control-plane/repo-graph':
        return json(REPO_GRAPH);
      case '/api/v1/quality-gate/overview':
        return json(OVERVIEW);
      case '/api/v1/search':
        return json(SEARCH);
      case '/api/v1/shift/families':
        return json({ families: [] });
      case '/api/v1/site-settings':
        return json({ internal_wiki: null });
      default:
        return errorResponse(404, `unmocked ${url.pathname}`);
    }
  });
}

describe('the pages that ignored the family scope', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('Runners shows the runners the family’s board names, and the shared ones', async () => {
    mockFleetApi();
    renderAt('/runners?family=acme', '/runners', <FleetPage />);

    // `acme`'s own gate runner, and the one no lane names — a runner tied to
    // no board serves every family.
    expect(await screen.findByTestId('fleet-node-acme-gate_slot0')).toBeInTheDocument();
    expect(await screen.findByTestId('fleet-node-shared-gate_slot0')).toBeInTheDocument();
    expect(screen.queryByTestId('fleet-node-globex-gate_slot0')).toBeNull();
    // What it is not showing is said, not hidden.
    expect(await screen.findByTestId('family-scope-elsewhere')).toHaveTextContent(
      '+1 runners in other families'
    );
  });

  it('Runners shows every runner with no family in scope', async () => {
    mockFleetApi();
    renderAt('/runners', '/runners', <FleetPage />);

    expect(await screen.findByTestId('fleet-node-globex-gate_slot0')).toBeInTheDocument();
    expect(screen.queryByTestId('family-scope-elsewhere')).toBeNull();
  });

  it('a quality-gate rule lists the scoped family’s flagged heads', async () => {
    mockFleetApi();
    renderAt(
      '/quality-gate/rules/dead-language?family=acme',
      '/quality-gate/rules/:rule',
      <QualityGateRulePage />
    );

    const table = await screen.findByTestId('quality-gate-heads-table');
    expect(within(table).getByText(/acme\/acme-web@/)).toBeInTheDocument();
    expect(within(table).queryByText(/globex\/globex-web@/)).toBeNull();
    expect(screen.getByTestId('family-scope-elsewhere')).toHaveTextContent(
      '+1 flagged heads in other families'
    );
  });

  it('tool adoption counts the scoped family’s repositories only', async () => {
    mockFleetApi();
    renderAt('/shared-tools/adoption?family=acme', '/shared-tools/adoption', <ToolFleetPage />);

    // `audit-ci` is adopted by acme's only repository: 1 of 1, not 1 of 2.
    const row = await screen.findByTestId('tool-row-audit-ci');
    expect(within(row).getByText('1/1')).toBeInTheDocument();
    // `security` is only about a globex repository, so it is not acme's story.
    expect(screen.queryByTestId('tool-row-security')).toBeNull();
    expect(screen.getByTestId('family-scope-elsewhere')).toHaveTextContent(
      '+1 tools in other families'
    );
  });
});

describe('more pages that ignored the family scope', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('the dependency graph is the scoped family’s repositories', async () => {
    mockFleetApi();
    renderAt(
      '/intelligence/dependencies?family=acme',
      '/intelligence/dependencies',
      <DependenciesPage />
    );

    // The edge leaves the scope, so the node it points at goes with it.
    expect(await screen.findByTestId('family-scope-elsewhere')).toHaveTextContent(
      '+1 repositories in other families'
    );
    expect(screen.queryByTestId('graph-node-repo:globex/globex-web')).toBeNull();
  });

  it('the quality gate counts the scoped family’s scored heads', async () => {
    mockFleetApi();
    renderAt('/quality-gate?family=acme', '/quality-gate', <QualityGatePage />);

    // acme's own repository scored 10 heads and failed 2, not the fleet's
    // 30/12, once the repository list has said which family owns which repo.
    await waitFor(() =>
      expect(screen.getByTestId('quality-gate-tile-fail-rate')).toHaveTextContent(
        'of 10 scored heads'
      )
    );
    expect(screen.getByTestId('quality-gate-tile-would-block')).toHaveTextContent('2');
    expect(screen.getByTestId('quality-gate-repo-acme/acme-web')).toBeInTheDocument();
    expect(screen.queryByTestId('quality-gate-repo-globex/globex-web')).toBeNull();
    // The rule counts cannot be taken apart by family: the page says so rather
    // than letting them read as acme's.
    expect(screen.getByTestId('quality-gate-rules-scope')).toHaveTextContent(
      'Counted across every family'
    );
  });

  it('search keeps the scoped family’s matches and the ones it cannot place', async () => {
    mockFleetApi();
    renderAt('/search?q=gate&family=acme', '/search', <SearchPage />);

    expect(await screen.findByText('acme/acme-web')).toBeInTheDocument();
    expect(screen.queryByText('globex/globex-web')).toBeNull();
    // A todo names no repository, so no family can be ruled out for it.
    expect(screen.getByText('Split the gate')).toBeInTheDocument();
    expect(screen.getByTestId('search-family-facet')).toHaveTextContent(
      'Showing matches in acme'
    );
    expect(screen.getByTestId('family-scope-elsewhere')).toHaveTextContent(
      '+1 matches in other families'
    );
  });
});

describe('the left nav’s counts under a family scope', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('counts the family in scope and says how many wait elsewhere', async () => {
    mockFleetApi();
    renderAt('/needs-you?family=acme', '/needs-you', <LeftNav />);

    // Two of the four rows are acme's: its own todo, and the pull request of
    // its repository, which names no family itself.
    const needsYou = await screen.findByTestId('needs-you-badge');
    expect(needsYou).toHaveTextContent('1');
    expect(needsYou).toHaveAttribute(
      'aria-label',
      '1 item need you. +1 need you in other families.'
    );

    // Work: acme's one blocked todo, globex's other one said beside it.
    const work = await screen.findByTestId('nav-badge-work');
    expect(work).toHaveTextContent('1');
    expect(work).toHaveAttribute('data-elsewhere', '1');
  });

  it('counts every family when none is in scope', async () => {
    mockFleetApi();
    renderAt('/needs-you', '/needs-you', <LeftNav />);

    const needsYou = await screen.findByTestId('needs-you-badge');
    expect(needsYou).toHaveTextContent('2');
    expect(needsYou).toHaveAttribute('aria-label', '2 items need you.');
  });

  it('says a destination has nothing here but something elsewhere', async () => {
    mockFleetApi();
    renderAt('/needs-you?family=acme', '/needs-you', <LeftNav />);

    // The Runners count is globex's worker outage: nothing of acme's waits
    // there, and silence would hide a critical row.
    expect(await screen.findByTestId('nav-badge-elsewhere-system')).toHaveTextContent('+1');
    expect(screen.queryByTestId('nav-badge-system')).toBeNull();
  });
});
