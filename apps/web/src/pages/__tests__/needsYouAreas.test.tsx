// needsYouAreas.test.tsx — one answer to "what needs you", on every surface.
//
// Four numbers used to disagree on screen: the nav badge counted the attention
// list, the dock counted flagged events among the last few, Work counted its own
// queue, and a page's strip counted something else again. Here one fixture is
// rendered through the nav badge, the dock, the Needs you header and each page's
// own surface for it — a strip, or In flight's mark on the row itself — and
// every one of them says the same thing.
//
// Invented families only (acme, globex, initech): jeryu is public.

import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AttentionItem, AttentionResponse } from '../../api/types';
import { LeftNav, PRIMARY_NAV, SYSTEM_NAV } from '../../layout/LeftNav';
import { LiveActivityDock } from '../../layout/LiveActivityDock';
import { FleetPage } from '../FleetPage';
import { NeedsYouPage } from '../needsYou';
import { AREA_LABEL, type AttentionArea } from '../needsYou/needsYouModel';
import { PullRoomPage } from '../PullRoomPage';
import { ReleasesPage } from '../ReleasesPage';
import { ShiftQueuePage } from '../shift/ShiftQueuePage';
import { errorResponse, json, renderAt } from './shiftPageHelpers';
import { attentionItem, pipelineEvent } from './pipelineTestData';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role: 'admin' } }),
}));

// In flight hides everything behind its snapshot, which is not what is under
// test here: it answers with a forge where nothing is open.
vi.mock('../../hooks/useControlPlane', () => ({
  CONTROL_PLANE_MAX_LIMIT: 500,
  useControlPlane: () => ({
    isLoading: false,
    isError: false,
    data: {
      pullRequests: [],
      repos: [],
      summary: {
        openPrCount: 0,
        missingCheckPrCount: 0,
        failingCheckCount: 0,
        waitingCheckPrCount: 0,
        failingCheckPrCount: 0,
      },
      toolBuild: { clusterCount: 0, topClusters: [] },
    },
  }),
}));
vi.mock('../../hooks/useRepoPullLists', () => ({
  useRepoPullLists: () => ({ loading: [], failed: [], pulls: [] }),
}));
vi.mock('../../hooks/useRepoChannels', () => ({
  EMPTY_CHANNELS: { baselines: { kind: 'none', baselines: [] }, compares: new Map() },
  useRepoChannels: () => ({ byRepo: new Map(), isLoading: false }),
}));

/** One event flagged as needing a human: the dock must not count from these. */
const EVENTS = [
  pipelineEvent({ seq: 9, kind: 'todo.blocked', needs_human: true, summary: 'Blocked acme work' }),
  pipelineEvent({ seq: 8, kind: 'pr.merged', summary: 'Merged acme/acme-web#7' }),
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

/** Three rows waiting on a person, all of them Work's, all in one family. */
const THREE_IN_WORK = attention([
  attentionItem({
    id: 'todo_blocked:acme:1',
    kind: 'todo_blocked',
    severity: 'action',
    title: 'Split the acme gate',
    family: 'acme',
    todo_id: '20261003-0001-aaa',
  }),
  attentionItem({
    id: 'todo_handoff:acme:2',
    kind: 'todo_handoff',
    severity: 'action',
    title: 'Hand back the acme bump',
    family: 'acme',
    todo_id: '20261003-0002-bbb',
  }),
  attentionItem({
    id: 'shift_without_pr:acme:3',
    kind: 'shift_without_pr',
    severity: 'critical',
    title: 'Last night has no review PR',
    family: 'acme',
  }),
  // A row that needs nobody: no surface may count it.
  attentionItem({
    id: 'todo_stuck_claim:acme:4',
    kind: 'todo_stuck_claim',
    severity: 'watch',
    title: 'A claim nobody renewed',
    family: 'acme',
  }),
]);

/** One row per badged area, so every badge has rows to lead to. */
const ONE_PER_AREA: Record<AttentionArea, AttentionItem> = {
  work: attentionItem({
    id: 'todo_blocked:globex:1',
    kind: 'todo_blocked',
    severity: 'action',
    title: 'Blocked globex todo',
    family: 'globex',
    todo_id: '20261003-0003-ccc',
  }),
  pulls: attentionItem({
    id: 'pr_checks_failing:globex:2',
    kind: 'pr_checks_failing',
    severity: 'critical',
    title: 'Checks failing on globex/globex-web#4',
    family: 'globex',
    repo: 'globex/globex-web',
    pr: 4,
  }),
  releases: attentionItem({
    id: 'release_staged:globex:3',
    kind: 'release_staged',
    severity: 'action',
    title: 'A globex release is staged',
    family: 'globex',
  }),
  system: attentionItem({
    id: 'workers_down:initech:4',
    kind: 'workers_down',
    severity: 'critical',
    title: 'No healthy worker slot for initech',
    family: 'initech',
  }),
};

/** A family with one repository and an empty queue. */
function shiftFamily(name: string): unknown {
  return {
    name,
    queue_repo: `${name}/${name}-todo`,
    repos: [{ name: `${name}-web`, owner: name, order: 1 }],
    shift_tz: 'UTC',
    landing: {},
  };
}

/**
 * Serve the attention list and the event feed, and answer every page's own
 * reads with nothing to show: what is under test is the attention rows each
 * page draws, not its content. An unknown path is an older server.
 */
function mockAttention(data: AttentionResponse): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    switch (url.pathname) {
      case '/api/v1/attention':
        return json(data);
      case '/api/v1/events':
        return json({ events: EVENTS, latest_seq: 9 });
      case '/api/v1/shift/families':
        return json({ families: ['acme', 'globex', 'initech'].map(shiftFamily) });
      case '/api/v1/shift/todos':
        return json({ generated_at: '2026-10-03T09:00:00Z', todos: [] });
      case '/api/v1/shift/shifts':
        return json({ shifts: [] });
      case '/api/v1/repositories':
        return json({ repositories: [] });
      default:
        return errorResponse(404, `unmocked ${url.pathname}`);
    }
  });
}

/** The page each badged destination leads to. */
const PAGES: Record<AttentionArea, JSX.Element> = {
  work: <ShiftQueuePage />,
  pulls: <PullRoomPage />,
  releases: <ReleasesPage />,
  system: <FleetPage />,
};

/** Every badge the nav draws for an area, with the route it links to. */
const BADGES = [...PRIMARY_NAV, ...SYSTEM_NAV].flatMap((item) =>
  item.badge && item.badge !== 'attention'
    ? [{ area: item.badge as AttentionArea, to: item.path }]
    : []
);

describe('every needs-you count', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is the same number in the nav, the dock, the Needs you header and the area strip', async () => {
    mockAttention(THREE_IN_WORK);
    renderAt('/work', '/work', <ShiftQueuePage />);
    // The page's own strip, and its chip, count Work's share: all three.
    const strip = await screen.findByTestId('needs-you-here-work');
    expect(within(strip).getByText('3')).toBeInTheDocument();
    expect(strip).toHaveAttribute('aria-label', '3 waiting on you in Work');
    expect(await screen.findByTestId('shift-needs-human')).toHaveTextContent('3 in Work');

    vi.restoreAllMocks();
    mockAttention(THREE_IN_WORK);
    renderAt('/work', '/work', <LeftNav />);
    expect(await screen.findByTestId('needs-you-badge')).toHaveTextContent('3');
    expect(screen.getByTestId('nav-badge-work')).toHaveTextContent('3');

    vi.restoreAllMocks();
    mockAttention(THREE_IN_WORK);
    renderAt('/work', '/work', <LiveActivityDock />);
    // One event is flagged; the dock still says three, and opens that list.
    expect(await screen.findByText('3 need you')).toBeInTheDocument();
    expect(screen.getByTestId('activity-dock-needs-you')).toHaveAttribute('href', '/needs-you');

    vi.restoreAllMocks();
    mockAttention(THREE_IN_WORK);
    renderAt('/needs-you', '/needs-you', <NeedsYouPage />);
    expect(await screen.findByTestId('needs-you-count')).toHaveTextContent('3');
  });

  it('leads from every badge to a page showing the rows it counted', async () => {
    expect(BADGES.map((badge) => badge.area).sort()).toEqual([
      'pulls',
      'releases',
      'system',
      'work',
    ]);
    for (const { area, to } of BADGES) {
      const item = ONE_PER_AREA[area];
      mockAttention(attention(Object.values(ONE_PER_AREA)));
      renderAt(to, to, <LeftNav />);
      expect(await screen.findByTestId(`nav-badge-${area}`)).toHaveTextContent('1');
      vi.restoreAllMocks();
      document.body.replaceChildren();

      mockAttention(attention(Object.values(ONE_PER_AREA)));
      renderAt(to, to, PAGES[area]);
      if (area === 'pulls') {
        // In flight marks a waiting pull request on its own row rather than
        // repeating it in a strip; what no row below carries is counted here,
        // with the way to the rows themselves. This forge has nothing open, so
        // the one globex row is that count.
        const off = await screen.findByTestId('pull-room-needs-off');
        expect(within(off).getByText('1')).toBeInTheDocument();
        expect(within(off).getByRole('link', { name: 'open Needs you' })).toHaveAttribute(
          'href',
          '/needs-you'
        );
      } else {
        const strip = await screen.findByTestId(`needs-you-here-${area}`);
        expect(within(strip).getByText(item.title)).toBeInTheDocument();
        expect(strip).toHaveAttribute('aria-label', `1 waiting on you in ${AREA_LABEL[area]}`);
        // Only that area's row: another page's row is not repeated here.
        expect(within(strip).getAllByRole('listitem')).toHaveLength(1);
      }
      vi.restoreAllMocks();
      document.body.replaceChildren();
    }
  });
});
