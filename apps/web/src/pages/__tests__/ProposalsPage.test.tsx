// ProposalsPage.test.tsx — Shared tools → Proposals: registry grouped by
// status, admin-only Approve / Reject posting the decision endpoint.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProposalsPage } from '../ProposalsPage';

let role: 'admin' | 'user' = 'admin';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role } }),
}));

const tool = (id: string, status: string) => ({
  id,
  name: id,
  kind: 'rust-crate',
  status,
  adopting_repo_count: 1,
  candidate_repo_count: 3,
  loc_saved: 10,
  loc_saved_estimate: 90,
});

const REGISTRY = {
  generated_at: '2026-09-18T00:00:00Z',
  tool_count: 3,
  published_count: 1,
  building_count: 1,
  proposed_count: 1,
  deprecated_count: 0,
  adopting_repo_count: 1,
  candidate_repo_count: 3,
  open_task_count: 1,
  realized_loc_saved: 30,
  anticipated_loc_saved: 270,
  tools: [tool('retry-kit', 'proposed'), tool('forge-gate', 'building'), tool('diff', 'published')],
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ProposalsPage', () => {
  const posts: Array<{ pathname: string; body: string }> = [];

  beforeEach(() => {
    role = 'admin';
    posts.length = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const rawUrl = input instanceof Request ? input.url : String(input);
      const { pathname } = new URL(rawUrl, 'http://localhost');
      if (init?.method === 'POST') {
        posts.push({ pathname, body: String(init.body ?? '') });
        return jsonResponse({ tool_id: 'retry-kit', decision: 'approve', status: 'building' });
      }
      return jsonResponse(REGISTRY);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderPage(): void {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/shared-tools/proposals']}>
          <ProposalsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it('groups tools by status and approves a proposal', async () => {
    renderPage();
    const proposal = await screen.findByTestId('proposal-retry-kit');
    expect(screen.getByRole('region', { name: 'Awaiting decision' })).toContainElement(proposal);
    expect(
      within(screen.getByRole('region', { name: 'Approved · building' })).getByText('forge-gate')
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('proposal-diff')).queryByRole('button')).toBeNull();

    fireEvent.click(within(proposal).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].pathname).toBe('/api/v1/tool-finder/proposals/retry-kit/decision');
    expect(JSON.parse(posts[0].body)).toMatchObject({ decision: 'approve' });
  });

  it('asks for a reason before rejecting', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('already covered by forge-gate');
    renderPage();
    const proposal = await screen.findByTestId('proposal-retry-kit');
    fireEvent.click(within(proposal).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(JSON.parse(posts[0].body)).toEqual({
      decision: 'reject',
      reason: 'already covered by forge-gate',
    });
  });

  it('hides decisions from non-admins', async () => {
    role = 'user';
    renderPage();
    const proposal = await screen.findByTestId('proposal-retry-kit');
    expect(within(proposal).queryByRole('button')).toBeNull();
  });
});
