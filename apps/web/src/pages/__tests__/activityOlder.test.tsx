// activityOlder.test.tsx — older pages arriving as the reader nears the end of
// the list: when a sentinel coming into view counts as asking for one, the
// skeleton row that stands in for the page on its way, and the button that
// stays behind it.

import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import { shouldLoadOlder } from '../activity/olderModel';
import { mockPipelineApi } from './pipelinePageHelpers';
import { json, renderAt } from './shiftPageHelpers';
import { eventPage, pipelineEvent } from './pipelineTestData';

/** A stand-in observer: jsdom has none, and a test needs to say when the
 *  sentinel came into view. Each instance registers itself so a test can
 *  cross the sentinel at the moment it chooses. */
class FakeObserver {
  static live: FakeObserver[] = [];
  private readonly targets: Element[] = [];
  constructor(private readonly fire: IntersectionObserverCallback) {
    FakeObserver.live.push(this);
  }
  observe(target: Element): void {
    this.targets.push(target);
  }
  disconnect(): void {
    FakeObserver.live = FakeObserver.live.filter((observer) => observer !== this);
  }
  /** Report every observed target as in view. */
  reach(): void {
    this.fire(
      this.targets.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
      this as unknown as IntersectionObserver
    );
  }
}

function installObserver(): void {
  FakeObserver.live = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver as unknown as typeof IntersectionObserver);
}

/** Cross the sentinel on every observer currently watching one. */
function reachEndOfList(): void {
  act(() => {
    for (const observer of [...FakeObserver.live]) observer.reach();
  });
}

function renderPage(path = '/activity'): void {
  renderAt(path, '/activity', <ActivityPage />);
}

describe('shouldLoadOlder', () => {
  const ready = { enabled: true, hasOlder: true, loading: false, failed: false };

  it('asks for a page when there is one and nothing is in flight', () => {
    expect(shouldLoadOlder(ready)).toBe(true);
  });

  it('stays quiet in wall mode, at the end of the feed, and mid-flight', () => {
    expect(shouldLoadOlder({ ...ready, enabled: false })).toBe(false);
    expect(shouldLoadOlder({ ...ready, hasOlder: false })).toBe(false);
    expect(shouldLoadOlder({ ...ready, loading: true })).toBe(false);
  });

  it('leaves a failed page to the button rather than retrying on every scroll', () => {
    expect(shouldLoadOlder({ ...ready, failed: true })).toBe(false);
  });
});

describe('Activity: older pages on approach', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** A full first page, so there is an older page to fetch. */
  const firstPage = eventPage(200, 100);

  it('loads the next page when the end of the list comes into view', async () => {
    installObserver();
    const calls = mockPipelineApi((req) => {
      if (req.pathname !== '/api/v1/events') return undefined;
      const qs = new URLSearchParams(req.search);
      if (qs.get('before_seq')) {
        return json({ events: [pipelineEvent({ seq: 100, kind: 'todo.filed' })], latest_seq: 201 });
      }
      if (qs.get('after_seq')) return json({ events: [], latest_seq: 200 });
      return json({ events: firstPage, latest_seq: 200 });
    });
    renderPage();
    await screen.findByTestId('activity-event-200');
    expect(calls.some((call) => call.search.includes('before_seq'))).toBe(false);

    reachEndOfList();
    expect(await screen.findByTestId('activity-event-100')).toBeInTheDocument();
    expect(calls.some((call) => call.search.includes('before_seq=101'))).toBe(true);
    // The feed is exhausted, so the page says what it is the end of.
    expect(screen.getByText('That is every stored event (30-day retention).')).toBeInTheDocument();
    // And nothing is left standing in for a page.
    expect(screen.queryByTestId('activity-older-pending')).not.toBeInTheDocument();
  });

  it('stands a skeleton row where the page will land, and keeps the button', async () => {
    installObserver();
    let release = (): void => {};
    mockPipelineApi((req) => {
      if (req.pathname !== '/api/v1/events') return undefined;
      const qs = new URLSearchParams(req.search);
      if (qs.get('before_seq')) {
        return new Promise((resolve) => {
          release = () =>
            resolve(json({ events: [pipelineEvent({ seq: 100, kind: 'todo.filed' })], latest_seq: 201 }));
        });
      }
      if (qs.get('after_seq')) return json({ events: [], latest_seq: 200 });
      return json({ events: firstPage, latest_seq: 200 });
    });
    renderPage();
    await screen.findByTestId('activity-event-200');
    // The button is the keyboard path, and it is there before the scroll.
    expect(screen.getByRole('button', { name: 'Load older' })).toBeInTheDocument();

    reachEndOfList();
    const pending = await screen.findByTestId('activity-older-pending');
    // In the list, below the rows it will join.
    expect(pending.closest('ol')).toHaveAttribute('aria-label', 'Pipeline events');
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();

    await act(async () => {
      release();
    });
    await waitFor(() => expect(screen.queryByTestId('activity-older-pending')).not.toBeInTheDocument());
  });

  it('does not ask again while a page is on its way', async () => {
    installObserver();
    let release = (): void => {};
    const calls = mockPipelineApi((req) => {
      if (req.pathname !== '/api/v1/events') return undefined;
      const qs = new URLSearchParams(req.search);
      if (qs.get('before_seq')) {
        return new Promise((resolve) => {
          release = () => resolve(json({ events: [], latest_seq: 201 }));
        });
      }
      if (qs.get('after_seq')) return json({ events: [], latest_seq: 200 });
      return json({ events: firstPage, latest_seq: 200 });
    });
    renderPage();
    await screen.findByTestId('activity-event-200');
    const older = (): number => calls.filter((call) => call.search.includes('before_seq')).length;

    reachEndOfList();
    await waitFor(() => expect(older()).toBe(1));
    reachEndOfList();
    reachEndOfList();
    expect(older()).toBe(1);
    await act(async () => {
      release();
    });
  });

  it('leaves a failed page to the button', async () => {
    installObserver();
    const calls = mockPipelineApi((req) => {
      if (req.pathname !== '/api/v1/events') return undefined;
      const qs = new URLSearchParams(req.search);
      if (qs.get('before_seq')) return new Response('nope', { status: 500 });
      if (qs.get('after_seq')) return json({ events: [], latest_seq: 200 });
      return json({ events: firstPage, latest_seq: 200 });
    });
    renderPage();
    await screen.findByTestId('activity-event-200');
    const older = (): number => calls.filter((call) => call.search.includes('before_seq')).length;

    reachEndOfList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load older events');
    // Scrolling past the sentinel again does not retry; the button does.
    reachEndOfList();
    reachEndOfList();
    expect(older()).toBe(1);
    expect(screen.getByRole('button', { name: 'Load older' })).toBeEnabled();
  });

  it('has no sentinel in wall mode', async () => {
    installObserver();
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events' ? json({ events: firstPage, latest_seq: 200 }) : undefined
    );
    renderPage('/activity?wall=1');
    await screen.findByTestId('activity-event-200');
    expect(screen.queryByTestId('activity-older-sentinel')).not.toBeInTheDocument();
  });
});
