import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminSettingsPage } from './AdminSettingsPage';

const accounts = Array.from({ length: 9 }, (_, index) => ({
  login: `user-${index}`,
  role: index === 0 ? 'admin' : 'user',
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { login: 'user-0', role: 'admin', mustChangePassword: false },
    logout: vi.fn(),
  }),
}));
vi.mock('../api/client', () => ({
  apiGet: vi.fn(async (url: string) =>
    url.endsWith('/grants')
      ? [
          {
            login: 'user-3',
            owner: 'jeryu',
            repo: 'jeryu',
            access: 'write',
            granted_by: 'user-0',
            granted_at: '2026-07-03T00:00:00Z',
          },
        ]
      : accounts,
  ),
  apiSend: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));
vi.mock('./InternalWikiPanel', () => ({
  InternalWikiPanel: () => <section aria-label="Internal wiki panel" />,
}));

describe('AdminSettingsPage user list', () => {
  it('lays each account out as a table row with login, role and reset columns', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AdminSettingsPage />
      </QueryClientProvider>,
    );

    const table = await screen.findByTestId('admin-users-table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((cell) => cell.textContent)).toEqual(['User', 'Role', 'Actions']);

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(9);
    rows.forEach((row, index) => {
      const cells = row.children;
      expect(cells).toHaveLength(3);
      expect(cells[0]).toHaveTextContent(`user-${index}`);
      expect(cells[1]).toHaveTextContent(accounts[index].role);
      expect(within(cells[2] as HTMLElement).getByRole('button', { name: 'Reset password' }))
        .toBeInTheDocument();
    });
  });

  it('lists existing repository grants with a revoke action and keeps granting secondary', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AdminSettingsPage />
      </QueryClientProvider>,
    );

    const table = await screen.findByTestId('repo-grants-table');
    const row = within(table).getByRole('row', { name: /user-3/ });
    expect(row).toHaveTextContent('write');
    expect(within(row).getByRole('button', { name: 'Revoke user-3' })).toBeInTheDocument();

    const grant = screen.getByRole('button', { name: 'Grant access' });
    expect(grant).not.toHaveClass('action-button--primary');
    expect(grant).toBeDisabled();
  });
});
