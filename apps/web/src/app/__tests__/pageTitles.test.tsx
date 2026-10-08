// pageTitles.test.tsx — each page names itself in the tab, and arriving on one
// puts the keyboard on it.
//
// Drives the app's REAL route table through a memory data router, so a page
// that forgets `usePageTitle` fails here rather than shipping a tab that reads
// "JeRyu". The shell's furniture and the account are stubbed; the pages
// themselves are the real ones, with every read answered by one failing fetch
// (their error state renders, and a title does not wait on data).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAIN_CONTENT_ID } from '../../hooks/useFocusMainOnNavigate';
import { TITLE_SUFFIX } from '../../hooks/usePageTitle';
import { router } from '../router';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ isPending: false, user: { role: 'admin', login: 'alton' }, logout: { isSuccess: false, isPending: false, reset: vi.fn() } }),
}));
vi.mock('../../layout/GlobalHeader', () => ({ GlobalHeader: () => <div /> }));
vi.mock('../../layout/LeftNav', () => ({ LeftNav: () => <nav aria-label="Primary" /> }));
vi.mock('../../layout/LiveActivityDock', () => ({ LiveActivityDock: () => null }));
vi.mock('../../layout/StatusBar', () => ({ StatusBar: () => null }));
vi.mock('../../layout/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../../components/KeyboardShortcutsOverlay', () => ({
  KeyboardShortcutsOverlay: () => null,
}));

/** Mount the app's routes at `path`, and hand back its router to navigate with. */
function mountAt(path: string) {
  const memory = createMemoryRouter(router.routes, { initialEntries: [path] });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={memory} />
    </QueryClientProvider>
  );
  return memory;
}

describe('per-route page titles', () => {
  beforeEach(() => {
    document.title = TITLE_SUFFIX;
    window.scrollTo = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('{"error":"unavailable"}', {
          status: 503,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
  });

  it('names Needs you, then Activity after navigating there', async () => {
    const memory = mountAt('/needs-you');
    expect(document.title).toBe('Needs you · JeRyu');

    await act(async () => {
      await memory.navigate('/activity');
    });
    expect(document.title).toBe('Activity · JeRyu');

    // Back to the first page: the title follows the history entry.
    await act(async () => {
      await memory.navigate(-1);
    });
    expect(document.title).toBe('Needs you · JeRyu');
  });

  it('a detail page names the entity it is about', async () => {
    const memory = mountAt('/repos/jeryu/acme/widgets/pulls/31');
    expect(document.title).toBe('acme/widgets#31 · JeRyu');

    await act(async () => {
      await memory.navigate('/repos/jeryu/acme/widgets/pulls');
    });
    expect(document.title).toBe('acme/widgets · Pull requests · JeRyu');
  });

  it('keeps control focus when a push changes only the query or fragment', async () => {
    const memory = mountAt('/activity');
    const control = screen.getByRole('link', { name: 'Skip to content' });
    control.focus();

    await act(async () => {
      await memory.navigate('/activity?tab=notes');
    });
    expect(control).toHaveFocus();

    await act(async () => {
      await memory.navigate('/activity?tab=notes#details');
    });
    expect(control).toHaveFocus();

    // The same control still leads into a different page on the next push.
    await act(async () => {
      await memory.navigate('/needs-you');
    });
    expect(document.activeElement).toBe(document.getElementById(MAIN_CONTENT_ID));
  });

  it('tracks replaced paths before deciding where a later push puts focus', async () => {
    const memory = mountAt('/needs-you');
    const control = screen.getByRole('link', { name: 'Skip to content' });
    control.focus();

    await act(async () => {
      await memory.navigate('/activity', { replace: true });
    });
    expect(control).toHaveFocus();

    await act(async () => {
      await memory.navigate('/activity?tab=notes');
    });
    expect(control).toHaveFocus();

    await act(async () => {
      await memory.navigate('/needs-you');
    });
    expect(document.activeElement).toBe(document.getElementById(MAIN_CONTENT_ID));
  });

  it('moves focus to the main landmark on a push, and leaves it alone on Back', async () => {
    const memory = mountAt('/needs-you');
    const main = document.getElementById(MAIN_CONTENT_ID);
    expect(main).not.toBeNull();
    // Opening the URL directly is not a navigation: focus stays where it was.
    expect(document.activeElement).not.toBe(main);

    await act(async () => {
      await memory.navigate('/activity');
    });
    expect(document.activeElement).toBe(document.getElementById(MAIN_CONTENT_ID));

    // Back returns to a page already read: focus stays wherever it was.
    (document.activeElement as HTMLElement).blur();
    await act(async () => {
      await memory.navigate(-1);
    });
    expect(document.activeElement).toBe(document.body);
  });
});
