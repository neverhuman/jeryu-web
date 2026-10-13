import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BotSummary } from '../../api/types';
import { TeamBots, parseRepoName } from './TeamBots';

const REVIEWER: BotSummary = {
  id: 'b1',
  owner: 'acme',
  owner_kind: 'organization',
  steward_team: 'stewards',
  acting_login: 'acme.reviewer[bot]',
  slug: 'reviewer',
  display_name: 'Reviewer',
  kind: 'agent',
  status: 'active',
  reach: { mode: 'general' },
  credential_generation: 1,
  last_successful_access: null,
  last_auth: null,
  last_mutation: null,
  last_heartbeat: null,
  last_action: null,
  last_outcome: null,
  last_repo: null,
  created_at: '2026-10-13T00:00:00Z',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    const key = `${(init?.method ?? 'GET').toUpperCase()} ${url.pathname}`;
    switch (key) {
      case 'GET /api/v1/bots/b1/grants':
        return jsonResponse(200, {
          grants: [
            {
              bot_id: 'b1',
              owner: 'acme',
              repo: 'widgets',
              access: 'write',
              granted_by: 'ria',
              granted_at: '2026-10-13T00:00:00Z',
            },
          ],
        });
      case 'GET /api/v1/bots/b1/tokens':
        return jsonResponse(200, {
          tokens: [
            {
              token_id: 't1',
              bot_id: 'b1',
              label: 'ci',
              issued_by: 'sam',
              created_at: '2026-10-13T00:00:00Z',
              expires_at: '2027-01-11T00:00:00Z',
              last_used_at: null,
              revoked_at: null,
            },
          ],
        });
      case 'PUT /api/v1/bots/b1/grants/acme/docs':
        return jsonResponse(403, {
          code: 'permission_denied',
          message: 'repository administrator required to change a bot\'s grant',
        });
      case 'POST /api/v1/bots/tokens/revoke-issued':
        return jsonResponse(200, { revoked: 2 });
      default:
        return jsonResponse(404, { code: 'not_found', message: key });
    }
  });
}

function renderBots(bots: BotSummary[]): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TeamBots bots={bots} onChanged={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseRepoName', () => {
  it('takes exactly owner/name', () => {
    expect(parseRepoName(' acme/widgets ')).toEqual({ owner: 'acme', name: 'widgets' });
    expect(parseRepoName('acme')).toBeNull();
    expect(parseRepoName('acme/widgets/extra')).toBeNull();
    expect(parseRepoName('/widgets')).toBeNull();
  });
});

describe('TeamBots', () => {
  it('says when the viewer stewards no team agent', () => {
    renderBots([]);
    expect(screen.getByTestId('team-bots-empty')).toBeTruthy();
  });

  it('shows the acting name, grants, and who issued each token', async () => {
    mockFetch();
    renderBots([REVIEWER]);
    const card = screen.getByTestId('team-bot');
    expect(within(card).getByTestId('team-bot-acting-login')).toHaveTextContent(
      'acme.reviewer[bot]'
    );
    expect(within(card).getByText('acme/stewards')).toBeTruthy();
    expect(await within(card).findByTestId('team-bot-grant')).toHaveTextContent(
      'acme/widgets · Write · granted by ria'
    );
    expect(await within(card).findByTestId('agent-token-issuer')).toHaveTextContent('sam');
  });

  it('surfaces the server refusing a steward who is not the repository administrator', async () => {
    mockFetch();
    renderBots([REVIEWER]);
    const form = screen.getByTestId('team-bot-grant-form');
    await userEvent.type(within(form).getByLabelText('Repository'), 'acme/docs');
    await userEvent.click(within(form).getByRole('button', { name: 'Grant' }));
    expect(await screen.findByText('Could not grant it.')).toBeTruthy();
  });

  it('rejects a repository that is not owner/name before asking the server', async () => {
    const spy = mockFetch();
    renderBots([REVIEWER]);
    const form = screen.getByTestId('team-bot-grant-form');
    await userEvent.type(within(form).getByLabelText('Repository'), 'widgets');
    await userEvent.click(within(form).getByRole('button', { name: 'Grant' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('owner/name');
    const calls = spy.mock.calls as Array<[unknown, RequestInit | undefined]>;
    expect(calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('revokes every token the viewer issued in one action', async () => {
    mockFetch();
    renderBots([REVIEWER]);
    await userEvent.click(screen.getByTestId('team-bot-revoke-issued'));
    await waitFor(() =>
      expect(screen.getByTestId('team-bot-revoked-count')).toHaveTextContent('Revoked 2 tokens.')
    );
  });
});
