import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LeftNav, PRIMARY_NAV, SYSTEM_NAV, isSystemPath } from '../LeftNav';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role: 'user' } }),
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
    Object.defineProperty(window, 'localStorage', { configurable: true, value: makeStorage() });
  });

  it('keeps six daily destinations in the order the work flows', () => {
    expect(PRIMARY_NAV.map((item) => item.label)).toEqual([
      'Needs you',
      'Activity',
      'Work',
      'Pull requests',
      'Releases',
      'Repositories',
    ]);
    expect(SYSTEM_NAV.map((item) => item.label)).toEqual([
      'Runners',
      'Intelligence',
      'Quality gate',
      'Shared tools',
    ]);
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

  it('names the repository whose pull requests the repo link opens', () => {
    renderAt('/repos/jeryu/jeryu/jeryu-web/code');
    expect(screen.getByRole('link', { name: 'Pull requests' })).toHaveAttribute('href', '/pull-room');
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
});
