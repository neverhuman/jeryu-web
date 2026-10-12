// BotAgentTokens.test.tsx — each bot's agent tokens on the account Bots page:
// the list and its statuses, a token shown once with setup lines for this
// origin, the in-page revoke confirmation, server errors, and bots that
// cannot get new tokens.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BotsPage } from '../bots/BotsPage';
import { agentTokenSnippets, agentTokenStatus, parseTtlDays } from '../bots/botModel';

const NOW = '2026-09-21T00:21:16Z';
const FUTURE = '2099-01-01T00:00:00Z';
const PAST = '2020-01-01T00:00:00Z';
const ONCE = 'jat_example_shown_once';
const BOT_TOKENS = '/api/v1/bots/bot-1/tokens';

describe('agent token model', () => {
  it('reads revoked before expired, and a past expiry reads expired', () => {
    const now = Date.parse(NOW);
    expect(agentTokenStatus({ expires_at: FUTURE, revoked_at: null }, now)).toBe('active');
    expect(agentTokenStatus({ expires_at: PAST, revoked_at: null }, now)).toBe('expired');
    expect(agentTokenStatus({ expires_at: FUTURE, revoked_at: NOW }, now)).toBe('revoked');
    expect(agentTokenStatus({ expires_at: 'not a time', revoked_at: null }, now)).toBe('expired');
  });

  it('takes whole days from 1 to 365', () => {
    expect(parseTtlDays('90')).toEqual({ days: 90, error: null });
    expect(parseTtlDays(' 1 ').days).toBe(1);
    expect(parseTtlDays('365').days).toBe(365);
    expect(parseTtlDays('0').error).toMatch(/1 to 365/);
    expect(parseTtlDays('366').error).toMatch(/1 to 365/);
    expect(parseTtlDays('2.5').error).toMatch(/whole number/);
    expect(parseTtlDays('').error).toMatch(/whole number/);
  });

  it('builds setup lines from the origin it is given', () => {
    const snippets = agentTokenSnippets('https://forge.example', 'jat_x');
    expect(snippets.map((snippet) => snippet.text)).toEqual([
      'claude mcp add --transport http jeryu https://forge.example/mcp --header "Authorization: Bearer jat_x"',
      '{"mcpServers":{"jeryu":{"url":"https://forge.example/mcp","headers":{"Authorization":"Bearer jat_x"}}}}',
      'GH_TOKEN=jat_x',
    ]);
  });
});

describe('BotsPage agent tokens', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('lists each token with created, expires, last used or never, and its status', async () => {
    mockFetch({
      'GET /api/v1/bots': { bots: [summary()] },
      [`GET ${BOT_TOKENS}`]: {
        tokens: [
          tokenRow({ token_id: 'tok-live', label: 'laptop', last_used_at: NOW }),
          tokenRow({ token_id: 'tok-old', label: 'old ci', expires_at: PAST }),
          tokenRow({ token_id: 'tok-dead', label: null, revoked_at: NOW }),
        ],
      },
    });

    renderPage();
    const list = await screen.findByTestId('agent-token-list');
    const rows = within(list).getAllByTestId('agent-token-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('laptop');
    expect(rows[1]).toHaveTextContent('old ci');
    expect(rows[2]).toHaveTextContent('Unlabelled token');
    expect(
      within(list)
        .getAllByTestId('agent-token-status')
        .map((cell) => cell.textContent)
    ).toEqual(['Active', 'Expired', 'Revoked']);
    expect(rows[1]).toHaveTextContent('Never');
    expect(rows[0]).not.toHaveTextContent('Never');
    expect(within(rows[0]).getByTestId('agent-token-revoke')).toBeEnabled();
    expect(within(rows[1]).getByTestId('agent-token-revoke')).toBeDisabled();
    expect(within(rows[2]).getByTestId('agent-token-revoke')).toBeDisabled();
    expect(screen.getByTestId('agent-tokens')).toHaveTextContent('Northwind');
  });

  it('shows a new token once with setup lines for this origin, then forgets it', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fetchSpy = mockFetch({
      'GET /api/v1/bots': { bots: [summary()] },
      [`GET ${BOT_TOKENS}`]: { tokens: [] },
      [`POST ${BOT_TOKENS}`]: { status: 201, body: issued('laptop') },
    });

    const { client } = renderPage();
    await screen.findByText('No agent tokens yet.');
    expect(screen.queryByTestId('agent-token-issued')).not.toBeInTheDocument();

    const form = screen.getByTestId('agent-token-form');
    expect(within(form).getByLabelText('Days valid')).toHaveValue(90);
    await userEvent.type(within(form).getByLabelText('Label (optional)'), 'laptop');
    await userEvent.clear(within(form).getByLabelText('Days valid'));
    await userEvent.type(within(form).getByLabelText('Days valid'), '30');
    await userEvent.click(within(form).getByRole('button', { name: 'Create token' }));

    const panel = await screen.findByTestId('agent-token-issued');
    expect(postBodies(fetchSpy, BOT_TOKENS)).toEqual([{ label: 'laptop', ttl_days: 30 }]);
    await waitFor(() => expect(panel).toHaveFocus());
    expect(within(panel).getByTestId('agent-token-value')).toHaveTextContent(ONCE);
    expect(within(panel).getByTestId('agent-token-once')).toHaveTextContent(
      'You will not see it again'
    );

    const origin = window.location.origin;
    expect(within(panel).getByTestId('agent-token-snippet-claude-code')).toHaveTextContent(
      `claude mcp add --transport http jeryu ${origin}/mcp --header "Authorization: Bearer ${ONCE}"`
    );
    expect(within(panel).getByTestId('agent-token-snippet-mcp-json')).toHaveTextContent(
      `{"mcpServers":{"jeryu":{"url":"${origin}/mcp","headers":{"Authorization":"Bearer ${ONCE}"}}}}`
    );
    expect(within(panel).getByTestId('agent-token-snippet-gh-git')).toHaveTextContent(
      `GH_TOKEN=${ONCE}`
    );

    await userEvent.click(within(panel).getByRole('button', { name: 'Copy agent token' }));
    expect(writeText).toHaveBeenCalledWith(ONCE);

    await userEvent.click(screen.getByTestId('agent-token-dismiss'));
    expect(screen.queryByTestId('agent-token-issued')).not.toBeInTheDocument();
    expect(screen.queryByText(ONCE, { exact: false })).not.toBeInTheDocument();
    await waitFor(() => expect(cachedText(client)).not.toContain(ONCE));
    expect(window.location.href).not.toContain(ONCE);
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(ONCE);
  });

  it('asks in the page before revoking, and cancel sends nothing', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    let live = tokenRow({ token_id: 'tok-live', label: 'laptop' });
    const fetchSpy = mockFetch({
      'GET /api/v1/bots': { bots: [summary()] },
      [`GET ${BOT_TOKENS}`]: () => ({ tokens: [live] }),
      [`POST ${BOT_TOKENS}/tok-live/revoke`]: () => {
        live = { ...live, revoked_at: NOW };
        return live;
      },
    });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke laptop' }));
    const confirm = screen.getByTestId('agent-token-confirm');
    expect(confirm).toHaveTextContent('Revoke laptop?');
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(postUrls(fetchSpy)).toEqual([]);

    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('agent-token-confirm')).not.toBeInTheDocument();
    expect(postUrls(fetchSpy)).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Revoke laptop' }));
    await userEvent.click(screen.getByTestId('agent-token-revoke-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('agent-token-status')).toHaveTextContent('Revoked')
    );
    expect(postUrls(fetchSpy)).toEqual([`${BOT_TOKENS}/tok-live/revoke`]);
    expect(screen.queryByTestId('agent-token-confirm')).not.toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('shows the server message when create or revoke fails, and no token', async () => {
    const fetchSpy = mockFetch({
      'GET /api/v1/bots': { bots: [summary()] },
      [`GET ${BOT_TOKENS}`]: { tokens: [tokenRow({ token_id: 'tok-live', label: 'laptop' })] },
      [`POST ${BOT_TOKENS}`]: {
        status: 409,
        body: { error: { code: 'conflict', message: 'This bot already has 10 live tokens.' } },
      },
      [`POST ${BOT_TOKENS}/tok-live/revoke`]: {
        status: 404,
        body: { error: { code: 'not_found', message: 'No such token.' } },
      },
    });

    renderPage();
    const form = await screen.findByTestId('agent-token-form');

    await userEvent.clear(within(form).getByLabelText('Days valid'));
    await userEvent.type(within(form).getByLabelText('Days valid'), '400');
    await userEvent.click(within(form).getByRole('button', { name: 'Create token' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('from 1 to 365');
    expect(postBodies(fetchSpy, BOT_TOKENS)).toEqual([]);

    await userEvent.clear(within(form).getByLabelText('Days valid'));
    await userEvent.type(within(form).getByLabelText('Days valid'), '7');
    await userEvent.click(within(form).getByRole('button', { name: 'Create token' }));
    expect(await screen.findByTestId('agent-token-create-error')).toHaveTextContent(
      'This bot already has 10 live tokens.'
    );
    expect(screen.queryByTestId('agent-token-issued')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Revoke laptop' }));
    await userEvent.click(screen.getByTestId('agent-token-revoke-confirm'));
    expect(await screen.findByTestId('agent-token-revoke-error')).toHaveTextContent(
      'No such token.'
    );
  });

  it('does not offer new tokens for a suspended or revoked bot', async () => {
    mockFetch({
      'GET /api/v1/bots': {
        bots: [
          summary({ id: 'held-1', display_name: 'Southwind', status: 'suspended' }),
          summary({ id: 'dead-1', display_name: 'Branchwind', status: 'revoked' }),
        ],
      },
      'GET /api/v1/bots/held-1/tokens': { tokens: [] },
      'GET /api/v1/bots/dead-1/tokens': { tokens: [] },
    });

    renderPage();
    await waitFor(() => expect(screen.getAllByTestId('agent-token-form')).toHaveLength(2));
    const [held, dead] = screen.getAllByTestId('agent-token-form');
    expect(within(held).getByRole('button', { name: 'Create token' })).toBeDisabled();
    expect(within(held).getByLabelText('Label (optional)')).toBeDisabled();
    expect(within(held).getByLabelText('Days valid')).toBeDisabled();
    expect(within(held).getByTestId('agent-token-disabled')).toHaveTextContent(
      'A suspended Grokbot cannot get new tokens.'
    );
    expect(within(dead).getByRole('button', { name: 'Create token' })).toBeDisabled();
    expect(within(dead).getByTestId('agent-token-disabled')).toHaveTextContent(
      'A revoked Grokbot cannot get new tokens.'
    );
  });
});

function summary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'bot-1',
    owner: 'ada',
    slug: 'north',
    display_name: 'Northwind',
    kind: 'grok',
    status: 'active',
    reach: { mode: 'general' },
    credential_generation: 1,
    last_successful_access: NOW,
    last_auth: null,
    last_mutation: null,
    last_heartbeat: null,
    last_action: null,
    last_outcome: null,
    last_repo: null,
    created_at: NOW,
    ...overrides,
  };
}

function tokenRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    token_id: 'tok-1',
    bot_id: 'bot-1',
    label: 'laptop',
    created_at: NOW,
    expires_at: FUTURE,
    last_used_at: null,
    revoked_at: null,
    ...overrides,
  };
}

function issued(label: string | null): Record<string, unknown> {
  return {
    bot: summary(),
    token_id: 'tok-new',
    token: ONCE,
    label,
    created_at: NOW,
    expires_at: FUTURE,
  };
}

/** Everything the query and mutation caches hold, flattened to text. */
function cachedText(client: QueryClient): string {
  const queries = client
    .getQueryCache()
    .getAll()
    .map((entry) => entry.state.data);
  const mutations = client
    .getMutationCache()
    .getAll()
    .map((entry) => entry.state.data);
  return JSON.stringify({ queries, mutations });
}

function renderPage(entry = '/bots'): { client: QueryClient } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/bots" element={<BotsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { client };
}

interface RouteResult {
  status?: number;
  body: unknown;
}

function mockFetch(routes: Record<string, unknown>): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const parsed = new URL(rawUrl, 'http://localhost');
    const key = `${method} ${parsed.pathname}${parsed.search}`;
    const route = routes[key];
    const match = typeof route === 'function' ? route() : route;
    if (match === undefined) {
      return jsonResponse(404, { error: { code: 'not_found', message: key } });
    }
    if (isRouteResult(match)) {
      return jsonResponse(match.status ?? 200, match.body);
    }
    return jsonResponse(200, match);
  });
}

function isRouteResult(value: unknown): value is RouteResult {
  return typeof value === 'object' && value !== null && 'body' in value && 'status' in value;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function postCalls(spy: ReturnType<typeof vi.spyOn>): Array<[unknown, RequestInit | undefined]> {
  const calls = spy.mock.calls as Array<[unknown, RequestInit | undefined]>;
  return calls.filter(([, init]) => (init?.method ?? 'GET').toUpperCase() === 'POST');
}

function postUrls(spy: ReturnType<typeof vi.spyOn>): string[] {
  return postCalls(spy).map(([url]) => String(url));
}

function postBodies(spy: ReturnType<typeof vi.spyOn>, path: string): unknown[] {
  return postCalls(spy)
    .filter(([url]) => String(url) === path)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : null));
}
