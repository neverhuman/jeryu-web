import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiGet } from '../api/client';
import { AdminWaitlistPanel, WAITLIST_PAGE_SIZE, type WaitlistSignup } from './AdminWaitlistPanel';

vi.mock('../api/client', async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import('../api/client')>()).ApiError,
  apiGet: vi.fn(),
}));

const get = vi.mocked(apiGet);

function signup(index: number, extra: Partial<WaitlistSignup> = {}): WaitlistSignup {
  return {
    email: `person-${index}@example.com`,
    name: null,
    note: null,
    status: 'listed',
    source: 'landing',
    request_count: 1,
    created_at: '2026-10-17T15:35:03Z',
    last_requested_at: '2026-10-17T15:35:03Z',
    ...extra,
  };
}

function renderPanel(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AdminWaitlistPanel />
    </QueryClientProvider>,
  );
}

describe('AdminWaitlistPanel', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('lists each address with what the person typed', async () => {
    get.mockResolvedValue({
      signups: [
        signup(1, { name: 'Ada', note: 'Gated merges for a team of three', request_count: 2 }),
        signup(2),
      ],
      limit: WAITLIST_PAGE_SIZE,
      offset: 0,
      total: 2,
    });
    renderPanel();
    const table = await screen.findByTestId('admin-waitlist-table');
    expect(get).toHaveBeenCalledWith('/api/v1/admin/waitlist?limit=100&offset=0', expect.anything());
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('person-1@example.com');
    expect(rows[1]).toHaveTextContent('Ada');
    expect(rows[1]).toHaveTextContent('Gated merges for a team of three');
    expect(rows[1]).toHaveTextContent(/2 \(last/);
    expect(within(rows[1]).getByRole('link', { name: 'person-1@example.com' })).toHaveAttribute(
      'href',
      'mailto:person-1@example.com',
    );
    expect(rows[2]).toHaveTextContent('—');
    expect(screen.getByTestId('admin-waitlist-count')).toHaveTextContent('2 addresses');
  });

  it('says so when nobody has joined', async () => {
    get.mockResolvedValue({ signups: [], limit: WAITLIST_PAGE_SIZE, offset: 0, total: 0 });
    renderPanel();
    expect(await screen.findByTestId('admin-waitlist-empty')).toHaveTextContent(
      'Nobody has joined the waitlist yet.',
    );
  });

  it('reads a 404 as a server without a waitlist, not an error', async () => {
    get.mockRejectedValue(new ApiError(404, { code: 'not_found', message: 'not found' }));
    renderPanel();
    expect(await screen.findByTestId('admin-waitlist-missing')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('pages through a list longer than one page', async () => {
    get.mockImplementation(async (url: string) => {
      const offset = Number(new URL(url, 'https://forge.example').searchParams.get('offset'));
      const count = offset === 0 ? WAITLIST_PAGE_SIZE : 5;
      return {
        signups: Array.from({ length: count }, (_, index) => signup(offset + index)),
        limit: WAITLIST_PAGE_SIZE,
        offset,
        total: WAITLIST_PAGE_SIZE + 5,
      };
    });
    renderPanel();
    expect(await screen.findByTestId('admin-waitlist-count')).toHaveTextContent('1–100 of 105');
    expect(screen.getByRole('button', { name: 'Newer' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Older' }));
    expect(await screen.findByText('101–105 of 105 addresses')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Older' })).toBeDisabled();
  });
});
