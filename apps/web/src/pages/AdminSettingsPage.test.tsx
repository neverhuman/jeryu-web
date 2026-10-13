import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiGet, apiPut, apiSend } from '../api/client';
import { AdminSettingsPage } from './AdminSettingsPage';

/** Named, never inline beside `password:`: the secret scanner is right to be strict. */
const ONE_TIME_A = 'one-time-fixture-0001';
const ONE_TIME_B = 'one-time-fixture-0002';

// user-1 has a verified address, user-2 an unverified one, the rest none.
const ADDRESSES: Record<number, { email: string; emailVerified: boolean }> = {
  1: { email: 'one@example.com', emailVerified: true },
  2: { email: 'two@example.com', emailVerified: false },
};

const accounts = Array.from({ length: 9 }, (_, index) => ({
  login: `user-${index}`,
  role: index === 0 ? 'admin' : 'user',
  // user-8 is a build login the instance config names as automation.
  kind: index === 8 ? 'service' : 'human',
  kind_source: index === 8 ? 'config' : 'default',
  email: ADDRESSES[index]?.email ?? null,
  emailVerified: ADDRESSES[index]?.emailVerified ?? false,
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { login: 'user-0', role: 'admin', mustChangePassword: false },
    logout: { mutate: vi.fn(), isPending: false, error: null },
  }),
}));
vi.mock('../api/client', async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import('../api/client')>()).ApiError,
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
// The Email section has its own tests (AccountRecoveryPages.test.tsx).
vi.mock('./account/EmailSection', () => ({ EmailSection: () => null }));
vi.mock('./InternalWikiPanel', () => ({
  InternalWikiPanel: () => <section aria-label="Internal wiki panel" />,
}));

function renderSettings(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openReset(login: string): Promise<HTMLElement> {
  const table = await screen.findByTestId('admin-users-table');
  const row = within(table).getByRole('row', { name: new RegExp(`^${login} `) });
  fireEvent.click(within(row).getByRole('button', { name: 'Reset password' }));
  return screen.getByRole('form', { name: `Reset the password of ${login}` });
}

describe('AdminSettingsPage user list', () => {
  beforeEach(() => {
    vi.mocked(apiSend).mockReset();
    vi.mocked(apiGet).mockClear();
  });

  it('lays each account out as a table row with login, role, kind, email and reset columns', async () => {
    renderSettings();

    const table = await screen.findByTestId('admin-users-table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((cell) => cell.textContent)).toEqual([
      'User',
      'Role',
      'Kind',
      'Email',
      'Actions',
    ]);

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(9);
    rows.forEach((row, index) => {
      const cells = row.children;
      expect(cells).toHaveLength(5);
      expect(cells[0]).toHaveTextContent(`user-${index}`);
      expect(cells[1]).toHaveTextContent(accounts[index].role);
      expect(within(cells[2] as HTMLElement).getByLabelText(`Kind of user-${index}`)).toHaveValue(
        accounts[index].kind,
      );
      expect(within(cells[4] as HTMLElement).getByRole('button', { name: 'Reset password' }))
        .toBeInTheDocument();
    });
    expect(rows[0].children[3]).toHaveTextContent('none');
    expect(rows[1].children[3]).toHaveTextContent('one@example.com verified');
    expect(rows[2].children[3]).toHaveTextContent('two@example.com unverified');
  });

  it('shows no Email column for a server that sends no addresses', async () => {
    vi.mocked(apiGet).mockResolvedValueOnce(
      accounts.map(({ login, role, kind, kind_source }) => ({ login, role, kind, kind_source })),
    );
    renderSettings();
    const table = await screen.findByTestId('admin-users-table');
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'User',
      'Role',
      'Kind',
      'Actions',
    ]);
  });

  it('asks where the temporary password goes when the account has no address, then says it was sent', async () => {
    vi.mocked(apiSend).mockResolvedValue({
      result: 'sent',
      login: 'user-3',
      email: 'three@example.com',
    });
    renderSettings();
    const form = await openReset('user-3');
    expect(form).toHaveTextContent('They sign in with it and must choose a new password.');
    const address = within(form).getByLabelText(/Where should the temporary password go\?/);
    // Optional until the forge says it needs one: it may have no mail at all.
    expect(address).not.toBeRequired();
    expect(address).toHaveValue('');
    fireEvent.change(address, { target: { value: ' three@example.com ' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Email a temporary password' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Sent to three@example.com. user-3 must choose a new password at next sign-in.',
    );
    expect(apiSend).toHaveBeenCalledWith('/api/v1/admin/users/user-3/reset-password', {
      email: 'three@example.com',
    });
    // The users list is read again, so the new address shows in its row.
    await vi.waitFor(() =>
      expect(vi.mocked(apiGet).mock.calls.filter(([url]) => url === '/api/v1/admin/users'))
        .toHaveLength(2),
    );
    expect(screen.queryByRole('form', { name: 'Reset the password of user-3' })).toBeNull();
  });

  it('offers an unverified address for correction and sends a verified one unasked', async () => {
    vi.mocked(apiSend).mockResolvedValue({ result: 'sent', login: 'x', email: 'x' });
    renderSettings();
    const unverified = await openReset('user-2');
    expect(within(unverified).getByLabelText(/Where should the temporary password go\?/)).toHaveValue(
      'two@example.com',
    );
    fireEvent.click(within(unverified).getByRole('button', { name: 'Cancel' }));

    const verified = await openReset('user-1');
    expect(within(verified).queryByRole('textbox')).toBeNull();
    expect(verified).toHaveTextContent('Sends to one@example.com verified');
    fireEvent.click(within(verified).getByRole('button', { name: 'Email a temporary password' }));
    await vi.waitFor(() =>
      expect(apiSend).toHaveBeenCalledWith('/api/v1/admin/users/user-1/reset-password', {}),
    );
  });

  it.each([
    [422, 'email_required', 'This forge needs an address to send the temporary password to.'],
    [409, 'conflict', 'another account has it, or this account already verified a different one'],
    [503, 'mail_unavailable', 'This forge cannot send email yet.'],
    [502, 'mail_failed', 'The mail server did not accept the message.'],
    [429, 'rate_limited', 'Too many attempts. Try again later.'],
    [422, 'invalid_input', 'email is not an address'],
  ])('shows a %i %s refusal where the admin is looking', async (status, code, copy) => {
    vi.mocked(apiSend).mockRejectedValue(
      new ApiError(status, { code, message: 'email is not an address' }),
    );
    renderSettings();
    const form = await openReset('user-2');
    fireEvent.click(within(form).getByRole('button', { name: 'Email a temporary password' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(copy);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('makes the address required once the forge answers email_required', async () => {
    vi.mocked(apiSend).mockRejectedValue(
      new ApiError(422, { code: 'email_required', message: 'an email address is required' }),
    );
    renderSettings();
    const form = await openReset('user-3');
    fireEvent.click(within(form).getByRole('button', { name: 'Email a temporary password' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('needs an address');
    expect(apiSend).toHaveBeenCalledWith('/api/v1/admin/users/user-3/reset-password', {});
    const address = within(form).getByLabelText(/Where should the temporary password go\?/);
    expect(address).toBeRequired();
    expect(address).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the one-time password when no mail went out, with copy and dismiss', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.mocked(apiSend).mockResolvedValue({
      result: 'shown',
      login: 'user-3',
      password: ONE_TIME_A,
      email: null,
    });
    renderSettings();
    const form = await openReset('user-3');
    fireEvent.click(within(form).getByRole('button', { name: 'Email a temporary password' }));

    const panel = await screen.findByRole('region', { name: 'One-time password for user-3' });
    expect(panel).toHaveTextContent('No email was sent');
    expect(panel).not.toHaveTextContent('Sending failed');
    expect(panel).toHaveTextContent(
      'Give user-3 this one-time password; they must choose a new one at sign-in.',
    );
    const field = within(panel).getByLabelText('One-time password for user-3');
    expect(field).toHaveValue(ONE_TIME_A);
    expect(field).toHaveAttribute('readonly');
    fireEvent.click(within(panel).getByRole('button', { name: 'Copy' }));
    expect(await within(panel).findByRole('status')).toHaveTextContent('Copied.');
    expect(writeText).toHaveBeenCalledWith(ONE_TIME_A);

    fireEvent.click(within(panel).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', { name: 'One-time password for user-3' })).toBeNull();
    expect(screen.queryByDisplayValue(ONE_TIME_A)).toBeNull();
  });

  it('says sending failed when the forge tried to mail it and could not', async () => {
    vi.mocked(apiSend).mockResolvedValue({
      result: 'shown',
      login: 'user-2',
      password: ONE_TIME_B,
      email: 'two@example.com',
      mailError: 'mail server refused the message',
    });
    renderSettings();
    const form = await openReset('user-2');
    fireEvent.click(within(form).getByRole('button', { name: 'Email a temporary password' }));
    const panel = await screen.findByRole('region', { name: 'One-time password for user-2' });
    expect(panel).toHaveTextContent('No email was sent');
    expect(panel).toHaveTextContent('Sending failed');
    expect(panel).toHaveTextContent('mail server refused the message');
    expect(within(panel).getByLabelText('One-time password for user-2')).toHaveValue(
      ONE_TIME_B,
    );
    expect(apiSend).toHaveBeenCalledWith('/api/v1/admin/users/user-2/reset-password', {
      email: 'two@example.com',
    });
  });

  it('reads the old {login, password} answer of a forge from before mailed resets as a shown password', async () => {
    vi.mocked(apiSend).mockResolvedValue({ login: 'user-3', password: ONE_TIME_A });
    renderSettings();
    const form = await openReset('user-3');
    fireEvent.click(within(form).getByRole('button', { name: 'Email a temporary password' }));
    const panel = await screen.findByRole('region', { name: 'One-time password for user-3' });
    expect(panel).toHaveTextContent('No email was sent');
    expect(panel).not.toHaveTextContent('Sending failed');
    expect(within(panel).getByLabelText('One-time password for user-3')).toHaveValue(ONE_TIME_A);
    expect(screen.queryByText(/Sent to/)).toBeNull();
  });

  it.each([
    ['an empty body', null],
    ['sent with no address', { result: 'sent', login: 'user-3', email: '' }],
    ['shown with no password', { result: 'shown', login: 'user-3', email: null }],
    ['a result it does not know', { result: 'queued', login: 'user-3' }],
  ])('says so when the forge answers %s', async (_label, answer) => {
    vi.mocked(apiSend).mockResolvedValue(answer);
    renderSettings();
    const form = await openReset('user-3');
    fireEvent.click(within(form).getByRole('button', { name: 'Email a temporary password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The forge answered in an unexpected shape; the password may have changed — reset again.',
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('region', { name: /One-time password/ })).toBeNull();
  });

  it('tells people from automation and lets an admin mark a login as automation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AdminSettingsPage />
        </MemoryRouter>
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
