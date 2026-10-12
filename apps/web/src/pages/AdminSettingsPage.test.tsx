import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { apiPut } from '../api/client';
import { AdminSettingsPage } from './AdminSettingsPage';

const accounts = Array.from({ length: 9 }, (_, index) => ({
  login: `user-${index}`,
  role: index === 0 ? 'admin' : 'user',
  // user-8 is a build login the instance config names as automation.
  kind: index === 8 ? 'service' : 'human',
  kind_source: index === 8 ? 'config' : 'default',
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { login: 'user-0', role: 'admin', mustChangePassword: false },
    logout: { mutate: vi.fn(), isPending: false, error: null },
  }),
}));
vi.mock('../api/client', () => ({
  apiGet: vi.fn(async (url: string) =>
    url.endsWith('/grants')
      ? [
          {
            login: 'user-3',
            owner: 'acme',
            repo: 'acme-web',
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
        <MemoryRouter>
          <AdminSettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const table = await screen.findByTestId('admin-users-table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((cell) => cell.textContent)).toEqual(['User', 'Role', 'Kind', 'Actions']);

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(9);
    rows.forEach((row, index) => {
      const cells = row.children;
      expect(cells).toHaveLength(4);
      expect(cells[0]).toHaveTextContent(`user-${index}`);
      expect(cells[1]).toHaveTextContent(accounts[index].role);
      expect(within(cells[2] as HTMLElement).getByLabelText(`Kind of user-${index}`)).toHaveValue(
        accounts[index].kind,
      );
      expect(within(cells[3] as HTMLElement).getByRole('button', { name: 'Reset password' }))
        .toBeInTheDocument();
    });
  });

  it('tells people from automation and lets an admin mark a login as automation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AdminSettingsPage />
      </QueryClientProvider>,
    );
    const table = await screen.findByTestId('admin-users-table');
    const build = within(table).getByRole('row', { name: /user-8/ });
    // A login the configuration names is automation, and not offered for change.
    expect(within(build).getByLabelText('Kind of user-8')).toHaveDisplayValue('Automation');
    expect(within(build).getByLabelText('Kind of user-8')).toBeDisabled();
    expect(within(build).getByText('config')).toBeInTheDocument();

    fireEvent.change(within(table).getByLabelText('Kind of user-3'), {
      target: { value: 'service' },
    });
    await vi.waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith('/api/v1/admin/users/user-3/kind', { kind: 'service' }),
    );
  });

  it('lists existing repository grants with a revoke action and keeps granting secondary', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AdminSettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // No repository is assumed, so the panel asks for one before it reads.
    expect(screen.queryByTestId('repo-grants-table')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'acme' } });
    fireEvent.change(screen.getByLabelText('Repo'), { target: { value: 'acme-web' } });

    const table = await screen.findByTestId('repo-grants-table');
    const row = within(table).getByRole('row', { name: /user-3/ });
    expect(row).toHaveTextContent('write');
    expect(within(row).getByRole('button', { name: 'Revoke user-3' })).toBeInTheDocument();

    const grant = screen.getByRole('button', { name: 'Grant access' });
    expect(grant).not.toHaveClass('action-button--primary');
    expect(grant).toBeDisabled();
  });

  it('links the agent setup page in a new tab and says what it is for', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AdminSettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const section = screen.getByTestId('settings-connect-agent');
    expect(within(section).getByRole('heading', { name: 'Connect an agent' })).toBeInTheDocument();
    const link = within(section).getByRole('link', { name: 'Agent setup page' });
    expect(link).toHaveAttribute('href', '/api/v1/docs/connect-an-agent.md');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(section).toHaveTextContent(
      'Send this page and an agent token to an external agent to connect it.'
    );
    expect(within(section).getByRole('link', { name: 'Agents' })).toHaveAttribute('href', '/bots');
  });
});
