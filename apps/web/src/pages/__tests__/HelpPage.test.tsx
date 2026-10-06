// HelpPage.test.tsx — /help says the keys, which System page answers what,
// and where the account controls are.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HelpPage } from '../HelpPage';
import { navGroup } from '../../layout/navDestinations';
import { useShortcutsStore } from '../../stores/shortcutsStore';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'operator', role: 'user' } }),
}));

function renderHelp(): void {
  // No wiki is set: the site-settings read answers 404 like an older server.
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } })
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/help']}>
        <HelpPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  useShortcutsStore.setState({ isOpen: false });
});

describe('HelpPage', () => {
  it('says when to open each System page, in the registry\u2019s own words', () => {
    renderHelp();
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument();
    for (const destination of navGroup('system', false)) {
      const link = screen.getByRole('link', { name: destination.label });
      expect(link).toHaveAttribute('href', destination.path);
      expect(destination.useWhen).toBeTruthy();
      expect(
        screen.getByText(destination.useWhen as string, { exact: false })
      ).toBeInTheDocument();
    }
  });

  it('offers no admin-only page to another role', () => {
    renderHelp();
    expect(screen.queryByRole('link', { name: 'Needs you' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Repositories' })).toBeInTheDocument();
  });

  it('opens the shortcuts overlay from the page itself', () => {
    renderHelp();
    screen.getByRole('button', { name: 'Open the shortcuts' }).click();
    expect(useShortcutsStore.getState().isOpen).toBe(true);
  });
});
