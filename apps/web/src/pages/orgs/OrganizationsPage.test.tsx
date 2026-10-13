import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrganizationView } from '../../api/types';
import { OrganizationsPage, parseLogins } from './OrganizationsPage';

const auth = vi.hoisted(() => ({ role: 'user' as 'admin' | 'user' }));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { login: 'olive', role: auth.role, mustChangePassword: false },
    logout: { mutate: vi.fn(), isPending: false, error: null },
  }),
}));

const ACME: OrganizationView = {
  organization: {
    id: 'o1',
    login: 'acme',
    display_name: 'Acme',
    created_at: '2026-10-13T00:00:00Z',
    owners: ['olive'],
    created_by: 'root',
  },
  teams: [
    {
      id: 't1',
      organization: 'acme',
      slug: 'stewards',
      name: 'Stewards',
      members: ['sam'],
      created_at: '2026-10-13T00:00:00Z',
    },
  ],
  can_manage: true,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(view: OrganizationView): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const key = `${method} ${url.pathname}`;
    if (key === 'GET /api/v1/orgs') return jsonResponse(200, { organizations: [view.organization] });
    if (key === 'GET /api/v1/orgs/acme') return jsonResponse(200, view);
    if (method === 'PUT' && url.pathname.startsWith('/api/v1/orgs/acme/teams/stewards/members/')) {
      return jsonResponse(200, view.teams[0]);
    }
    if (key === 'POST /api/v1/orgs/acme/bots') {
      return jsonResponse(201, {
        bot: { id: 'b1', slug: 'reviewer', acting_login: 'acme.reviewer[bot]' },
      });
    }
    return jsonResponse(404, { code: 'not_found', message: key });
  });
}

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OrganizationsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function requests(spy: ReturnType<typeof vi.spyOn>): string[] {
  const calls = spy.mock.calls as Array<[unknown, RequestInit | undefined]>;
  return calls.map(([input, init]) => {
    const url = new URL(String(input), 'http://localhost');
    return `${(init?.method ?? 'GET').toUpperCase()} ${url.pathname} ${String(init?.body ?? '')}`.trim();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  auth.role = 'user';
});

describe('parseLogins', () => {
  it('splits on commas and spaces, lowercases, and keeps each login once', () => {
    expect(parseLogins(' Ada, bob  ada\ncarol ')).toEqual(['ada', 'bob', 'carol']);
    expect(parseLogins('  ')).toEqual([]);
  });
});

describe('OrganizationsPage', () => {
  it('shows an owner the owners and teams, and adds a member and a team agent', async () => {
    const spy = mockFetch(ACME);
    renderPage();
    const detail = await screen.findByTestId('organization-detail');
    expect(within(detail).getByText('olive')).toBeTruthy();
    const team = within(detail).getByTestId('org-team');
    expect(within(team).getByText('sam')).toBeTruthy();
    // The last owner has no remove button.
    expect(within(detail).queryByRole('button', { name: 'Remove owner olive' })).toBeNull();
    expect(screen.queryByTestId('org-create-form')).toBeNull();

    await userEvent.type(within(team).getByLabelText('Add a member'), 'Tess');
    await userEvent.click(within(team).getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(requests(spy)).toContain('PUT /api/v1/orgs/acme/teams/stewards/members/tess')
    );

    const form = screen.getByTestId('team-bot-create-form');
    await userEvent.type(within(form).getByLabelText('Display name'), 'Reviewer');
    await userEvent.type(within(form).getByLabelText('Slug'), 'reviewer');
    expect(within(form).getByText('acme.reviewer[bot]')).toBeTruthy();
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }));
    expect(await screen.findByTestId('team-bot-enrolled')).toHaveTextContent('acme.reviewer[bot]');
    expect(requests(spy)).toContain(
      'POST /api/v1/orgs/acme/bots {"steward_team":"stewards","slug":"reviewer","display_name":"Reviewer"}'
    );
  });

  it('offers a member no management and a forge administrator the create form', async () => {
    mockFetch({ ...ACME, can_manage: false });
    renderPage();
    const detail = await screen.findByTestId('organization-detail');
    expect(within(detail).queryByLabelText('Add a member')).toBeNull();
    expect(screen.queryByTestId('team-bot-create-form')).toBeNull();
    expect(screen.queryByTestId('org-create-form')).toBeNull();
  });

  it('lets a forge administrator create an organization', async () => {
    auth.role = 'admin';
    mockFetch(ACME);
    renderPage();
    expect(await screen.findByTestId('org-create-form')).toBeTruthy();
  });
});
