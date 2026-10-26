import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

import { FamilyScopeProvider } from '../components/family/FamilyScopeProvider';
import { describe, expect, it, vi } from 'vitest';
import { PullRoomPage } from './PullRoomPage';

// What waits on a person is marked on its own row (PullTimelineRepoStates,
// pullAttentionModel, e2e 29-pipeline); these tests mock every data hook.
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../hooks/useFlow', () => ({ useFlow: () => ({ data: undefined }) }));
vi.mock('../hooks/usePipeline', () => ({ useAttention: () => ({ data: undefined }) }));
// Ghost rows wear red from the same list; here it names no todo.
vi.mock('./needsYou/useNeedsYou', () => ({ useAttentionTodoIds: () => new Set<string>() }));
vi.mock('../hooks/usePullBaseHistory', () => ({ usePullBaseHistory: () => () => undefined }));

// A forge with 509 pull requests, 22 of them open in repositories whose names
// sort last. The snapshot cuts every collection to a page, so the page the
// browser holds is a part of the whole: the open-work view must still show
// every open one and count from the server's summary.
const OPEN_REPOS = ['root/jankurai-one', 'veox-ai/jekko', 'veox/redline'];
const PAGE_LIMIT = 100;
const OPEN_COUNT = 22;

function openPr(index: number) {
  const repo = OPEN_REPOS[index % OPEN_REPOS.length];
  return {
    repo,
    number: index + 1,
    title: `open ${index + 1}`,
    author: 'rel-bot',
    draft: false,
    state: 'blockedbychecks',
    headRef: `feature-${index}`,
    headSha: `${index}`.padStart(40, 'a'),
    baseRef: 'main',
    baseSha: 'b'.repeat(40),
    mergeable: false,
    mergeableState: 'blocked',
    changedFiles: [],
    stateEvidence: 'missing',
    sourceLinks: [],
    updatedAt: `2026-09-${String(30 - (index % 20)).padStart(2, '0')}T00:00:00Z`,
    checks: { total: 0, queued: 0, running: 0, failing: 0, successful: 0, missing: true },
  };
}

function mergedPr(index: number) {
  return {
    ...openPr(index),
    repo: 'jeryu/core',
    state: 'merged',
    title: `merged ${index + 1}`,
  };
}

// What the server hands out with open work first: the 22 open ones, then the
// newest finished ones, cut to the page limit.
const pullRequests = [
  ...Array.from({ length: OPEN_COUNT }, (_, n) => openPr(n)),
  ...Array.from({ length: PAGE_LIMIT - OPEN_COUNT }, (_, n) => mergedPr(n)),
];

vi.mock('../hooks/useControlPlane', () => ({
  CONTROL_PLANE_MAX_LIMIT: 500,
  useControlPlane: () => ({
    isLoading: false,
    isError: false,
    data: {
      pullRequests,
      summary: {
        openPrCount: OPEN_COUNT,
        waitingCheckPrCount: 16,
        failingCheckPrCount: 2,
        missingCheckPrCount: 22,
        failingCheckCount: 3,
      },
      page: {
        limit: PAGE_LIMIT,
        page: 1,
        collections: {
          pull_requests: { limit: PAGE_LIMIT, page: 1, total: 509, has_more: true },
        },
      },
      toolBuild: { clusterCount: 0, topClusters: [] },
    },
  }),
}));

// The repository list is the family bar's source: every family, with the
// server's own open count, including the families that have nothing open.
vi.mock('../hooks/useRepositories', () => ({
  useRepositories: () => ({
    isLoading: false,
    isError: false,
    data: {
      repositories: [
        { id: { owner: 'root', name: 'jankurai-one' }, family: 'jankurai', open_pull_requests: 8 },
        { id: { owner: 'veox-ai', name: 'jekko' }, family: 'jekko', open_pull_requests: 7 },
        { id: { owner: 'veox', name: 'redline' }, family: 'redline', open_pull_requests: 7 },
        { id: { owner: 'jeryu', name: 'core' }, family: 'jeryu-split', open_pull_requests: 0 },
        { id: { owner: 'veox', name: 'tooling' }, family: 'tooling', open_pull_requests: 0 },
        { id: { owner: 'veox', name: 'loose' }, family: null, open_pull_requests: 0 },
      ],
    },
  }),
}));

vi.mock('../hooks/useRepoPullLists', () => ({
  useRepoPullLists: (repos: string[]) => ({
    loading: [],
    failed: [],
    pulls: repos.map((full) => {
      const [owner, name] = full.split('/');
      return {
        repo: { id: full, host: 'jeryu', owner, name },
        number: 1,
        title: `Change in ${full}`,
        author: 'rel-bot',
        head_ref: 'feature',
        base_ref: 'main',
        head_sha: 'abc12345',
        base_sha: 'def12345',
        state: 'open',
        draft: false,
        mergeable: { level: 'blocked', can_merge: false, reason: null },
        review: { required_approvals: 1, approvals: 0, changes_requested: 0 },
        checks: { total: 0, passing: 0, failing: 0, pending: 0, skipped: 0 },
        updated_at: '2026-09-29T00:00:00Z',
      };
    }),
  }),
}));

vi.mock('../hooks/useRepoChannels', () => ({
  EMPTY_CHANNELS: { baselines: { kind: 'none', baselines: [] }, compares: new Map() },
  useRepoChannels: () => ({ byRepo: new Map(), isLoading: false, deferred: new Set() }),
}));
vi.mock('../hooks/useShift', () => ({
  useShiftTodos: () => ({ data: { todos: [] }, isLoading: false, isError: false }),
}));

function setup(entries: string[]) {
  const router = createMemoryRouter(
    [
      {
        path: '/pull-room',
        element: (
          <FamilyScopeProvider>
            <PullRoomPage />
          </FamilyScopeProvider>
        ),
      },
    ],
    {
      initialEntries: entries,
    }
  );
  render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
  return router;
}

describe('Pull Room open work on a paged snapshot', () => {
  it('counts the header from the summary and lists every open pull request', () => {
    setup(['/pull-room?view=board']);
    // Not a count of the 100 rows the page holds: the server's own total, in
    // the one counts line the page has.
    expect(screen.getByTestId('pull-room-sentence')).toHaveTextContent(
      '22 open · 16 waiting on checks · 2 stopped by a failing check'
    );
    // Every open pull request has a card, though the page holds 100 of 509 rows.
    const cards = screen.getAllByTestId(/^pull-card-.+-\d+$/);
    expect(cards).toHaveLength(OPEN_COUNT);
    for (const repo of OPEN_REPOS) {
      expect(cards.filter((card) => card.dataset.testid?.includes(repo)).length).toBeGreaterThan(0);
    }
  });

  it('draws no family bar or snapshot note of its own', () => {
    setup(['/pull-room']);
    // The header's family control is the scope.
    expect(screen.queryByTestId('pull-room-families')).toBeNull();
    // Open work is ordered first, so a cut snapshot still holds every open
    // pull request: the page does not explain the cut.
    expect(screen.queryByTestId('pull-room-truncated')).toBeNull();
  });

  it('scopes the page to the family the address names', () => {
    setup(['/pull-room?view=board&family=jekko']);
    const cards = screen.getAllByTestId(/^pull-card-.+-\d+$/);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => card.dataset.testid?.includes('jekko'))).toBe(true);
  });
});
