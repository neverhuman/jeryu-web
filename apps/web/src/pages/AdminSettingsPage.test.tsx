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
  apiGet: vi.fn(async () => accounts),
  apiSend: vi.fn(),
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
});
