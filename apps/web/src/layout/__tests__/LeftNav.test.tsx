import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LeftNav, PRIMARY_NAV, SYSTEM_NAV, isSystemPath } from '../LeftNav';

const auth = vi.hoisted((): { role: 'admin' | 'user' } => ({ role: 'admin' }));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'ada', role: auth.role } }),
}));

const siteSettings = vi.hoisted((): { wiki: null | { full_name: string } } => ({ wiki: null }));
vi.mock('../../hooks/useSiteSettings', () => ({
  useSiteSettings: () => ({ data: { internal_wiki: siteSettings.wiki } }),
}));

// Node 26 defines a global localStorage that is undefined without a backing
// file and shadows jsdom's, so the test brings its own Storage.
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

function renderAt(path: string): { unmount: () => void } {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <LeftNav />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('LeftNav', () => {
  beforeEach(() => {
    auth.role = 'admin';
    siteSettings.wiki = null;
    Object.defineProperty(window, 'localStorage', { configurable: true, value: makeStorage() });
  });

  it('keeps six daily destinations in the order the work flows', () => {
    expect(PRIMARY_NAV.map((item) => item.label)).toEqual([
      'Needs you',
      'Activity',
      'Work',
      'In flight',
      'Releases',
      'Repositories',
    ]);
    expect(SYSTEM_NAV.map((item) => item.label)).toEqual([
      'Runners',
      'Intelligence',
      'Dependencies',
      'Quality gate',
      'Shared tools',
    ]);
  });

  it('says on each item which chord goes there', () => {
    renderAt('/needs-you');
    const needsYou = screen.getByRole('link', { name: /Needs you/ });
    expect(needsYou).toHaveAttribute('title', 'Needs you (g n)');
    expect(needsYou).toHaveAttribute('aria-keyshortcuts', 'g n');
    const inFlight = screen.getByRole('link', { name: 'In flight' });
    expect(inFlight).toHaveAttribute('title', 'In flight (g p)');
    expect(inFlight).toHaveAttribute('aria-keyshortcuts', 'g p');
  });

  it('hides the System group until it is opened, and remembers the choice', () => {
    renderAt('/needs-you');
    const system = screen.getByRole('button', { name: 'System' });
    expect(system).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Runners' })).toBeNull();

    fireEvent.click(system);
    expect(system).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Runners' })).toHaveAttribute('href', '/runners');
    expect(window.localStorage.getItem('jeryu.leftNav.systemOpen.v1')).toBe('1');

    fireEvent.click(system);
    expect(screen.queryByRole('link', { name: 'Runners' })).toBeNull();
    expect(window.localStorage.getItem('jeryu.leftNav.systemOpen.v1')).toBe('0');
  });

  it('is open on a System page and cannot hide the current page', () => {
    renderAt('/shared-tools/adoption/ux-qa');
    expect(isSystemPath('/shared-tools/adoption/ux-qa')).toBe(true);
    expect(isSystemPath('/releases')).toBe(false);
    expect(screen.getByRole('button', { name: 'System' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Shared tools' })).toHaveAttribute('aria-current', 'page');
  });

  it('marks Dependencies, not Intelligence, as the page it is on', () => {
    renderAt('/intelligence/dependencies');
    expect(screen.getByRole('link', { name: 'Dependencies' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Intelligence' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('names the repository whose pull requests the repo link opens', () => {
    renderAt('/repos/jeryu/jeryu/jeryu-web/code');
    expect(screen.getByRole('link', { name: 'In flight' })).toHaveAttribute('href', '/in-flight');
    expect(screen.getByRole('link', { name: 'Pull requests in jeryu/jeryu-web' })).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-web/pulls'
    );
  });

  it('points Code at the repository front page, active wherever code is read; no Tracker', () => {
    for (const path of [
      '/repos/jeryu/jeryu/jeryu-web',
      '/repos/jeryu/jeryu/jeryu-web/blob/main/README.md',
      '/repos/jeryu/jeryu/jeryu-web/code',
    ]) {
      const { unmount } = renderAt(path);
      const code = screen.getByRole('link', { name: 'Code' });
      expect(code).toHaveAttribute('href', '/repos/jeryu/jeryu/jeryu-web');
      expect(code).toHaveAttribute('aria-current', 'page');
      expect(screen.queryByRole('link', { name: 'Tracker' })).toBeNull();
      unmount();
    }
    const { unmount } = renderAt('/repos/jeryu/jeryu/jeryu-web/pulls');
    expect(screen.getByRole('link', { name: 'Code' })).not.toHaveAttribute('aria-current');
    unmount();
  });
  // Needs you, Activity and Work read admin-only endpoints: offered to another
  // role they are three links into a permission-denied page.
  it('leaves out the admin-only destinations for every other role', () => {
    auth.role = 'user';
    renderAt('/repos');
    for (const label of ['Needs you', 'Activity', 'Work']) {
      expect(screen.queryByRole('link', { name: new RegExp(label) })).toBeNull();
    }
    for (const label of ['In flight', 'Releases', 'Repositories']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('links to the wiki only when one is set, and marks it on wiki pages', () => {
    const { unmount } = renderAt('/activity');
    expect(screen.queryByRole('link', { name: 'Wiki' })).toBeNull();
    unmount();

    siteSettings.wiki = { full_name: 'acme/handbook' };
    renderAt('/wiki/guides/setup.md');
    const wiki = screen.getByRole('link', { name: 'Wiki' });
    expect(wiki).toHaveAttribute('href', '/wiki');
    // The repository the wiki reads, and the chord that opens it.
    expect(wiki).toHaveAttribute('title', 'acme/handbook (g k)');
    expect(wiki).toHaveAttribute('aria-keyshortcuts', 'g k');
    expect(wiki).toHaveAttribute('aria-current', 'page');
  });
});
