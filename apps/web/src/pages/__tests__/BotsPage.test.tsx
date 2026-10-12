import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BotReach } from '../../api/types';
import { BotsPage } from '../bots/BotsPage';
import {
  MIXED_REACH_ERROR,
  accountReachRows,
  addBotHref,
  kindLabel,
  parseKind,
  parseOwnerName,
  parseRepoLines,
  reachFromLines,
  repoRosterReachLabel,
} from '../bots/botModel';

const NOW = '2026-09-21T00:21:16Z';

describe('bot reach labels', () => {
  it('names general, this repo, a numbered id, and a branch', () => {
    expect(repoRosterReachLabel({ mode: 'general' })).toBe('General');
    expect(
      repoRosterReachLabel({ mode: 'repositories', repos: [{ owner: 'ada', name: 'widgets' }] })
    ).toBe('This repo');
    expect(repoRosterReachLabel(taskReach('issue', '17'))).toBe('Task #17');
    expect(repoRosterReachLabel(taskReach('pull', '3'))).toBe('Task #3');
    expect(repoRosterReachLabel(taskReach('branch', 'feature/login'))).toBe('feature/login');
    expect(repoRosterReachLabel({ mode: 'owners', owners: ['ada'] })).toBe('Whole owner');
    expect(accountReachRows({ mode: 'general' })).toEqual(['General']);
    expect(
      accountReachRows({
        mode: 'repositories',
        repos: [
          { owner: 'ada', name: 'widgets' },
          { owner: 'bob', name: 'other' },
        ],
      })
    ).toEqual(['ada/widgets', 'bob/other']);
    expect(accountReachRows({ mode: 'repositories', repos: [] })).toEqual(['No repositories']);
    expect(accountReachRows({ mode: 'owners', owners: ['acme', 'ada'] })).toEqual([
      'acme/*',
      'ada/*',
    ]);
    expect(accountReachRows(taskReach('issue', '17'))).toEqual(['ada/widgets · Task #17']);
    expect(accountReachRows(taskReach('branch', 'feature/login'))).toEqual([
      'ada/widgets · feature/login',
    ]);
  });

  it('renders a reach mode or a kind it does not know without throwing', () => {
    expect(accountReachRows({ mode: 'galaxy', stars: 3 })).toEqual(['Unknown reach: galaxy']);
    expect(accountReachRows({ mode: 'owners' })).toEqual(['No owners']);
    expect(accountReachRows({ mode: 'repositories', repos: 'nope' })).toEqual([
      'No repositories',
    ]);
    expect(accountReachRows(null)).toEqual(['Unknown reach']);
    expect(accountReachRows(undefined)).toEqual(['Unknown reach']);
    expect(repoRosterReachLabel({ mode: 'galaxy' })).toBe('Unknown reach');
    expect(repoRosterReachLabel(null)).toBe('Unknown reach');
    expect(kindLabel('grok')).toBe('Grokbot');
    expect(kindLabel('muse')).toBe('Musebot');
    expect(kindLabel('claude')).toBe('claude');
    expect(kindLabel('agent')).toBe('agent');
    expect(kindLabel('')).toBe('Unknown');
    expect(kindLabel(null)).toBe('Unknown');
  });

  it('checks a kind with the server rule, and leaves an empty kind out', () => {
    expect(parseKind('')).toEqual({ kind: null, error: null });
    expect(parseKind('  codex ')).toEqual({ kind: 'codex', error: null });
    expect(parseKind('a')).toEqual({ kind: 'a', error: null });
    expect(parseKind(`a${'b'.repeat(31)}`).kind).toBe(`a${'b'.repeat(31)}`);
    expect(parseKind(`a${'b'.repeat(32)}`).error).toMatch(/up to 31/);
    expect(parseKind('Claude').error).toMatch(/lowercase/);
    expect(parseKind('9lives').error).toMatch(/lowercase letter/);
    expect(parseKind('my_agent').error).not.toBeNull();
  });

  it('makes whole owners from owner/* lines and refuses a mix', () => {
    expect(reachFromLines('acme/*\n\nada/*\nacme/*')).toEqual({
      reach: { mode: 'owners', owners: ['acme', 'ada'] },
      error: null,
    });
    expect(reachFromLines('acme/widgets\nacme/widgets\nada/gears')).toEqual({
      reach: {
        mode: 'repositories',
        repos: [
          { owner: 'acme', name: 'widgets' },
          { owner: 'ada', name: 'gears' },
        ],
      },
      error: null,
    });
    expect(reachFromLines('acme/*\nada/gears')).toEqual({ reach: null, error: MIXED_REACH_ERROR });
    expect(reachFromLines('*/widgets').error).toMatch(/is neither/);
    expect(reachFromLines('acme/wid*').error).toMatch(/is neither/);
    expect(reachFromLines('').error).toMatch(/at least one/);
    const owners = Array.from({ length: 21 }, (_, index) => `o${index}/*`).join('\n');
    expect(reachFromLines(owners).error).toBe('Name at most 20 owners.');
    const repos = Array.from({ length: 101 }, (_, index) => `ada/r${index}`).join('\n');
    expect(reachFromLines(repos).error).toBe('Name at most 100 repositories.');
    expect(parseRepoLines('acme/*').error).toMatch(/whole owner/);
  });

  it('parses owner/name lines and a preselected repository', () => {
    expect(parseRepoLines('ada/widgets\n\nbob/other\n').repos).toEqual([
      { owner: 'ada', name: 'widgets' },
      { owner: 'bob', name: 'other' },
    ]);
    expect(parseRepoLines('not-a-repo').error).toMatch(/owner\/name/);
    expect(parseOwnerName('ada/*')).toBeNull();
    expect(parseRepoLines('   ').error).toMatch(/at least one/);
    expect(parseOwnerName('ada/widgets')).toEqual({ owner: 'ada', name: 'widgets' });
    expect(parseOwnerName('ada/widgets\nbob/other')).toBeNull();
    expect(parseOwnerName('not-a-repo')).toBeNull();
    expect(parseOwnerName(null)).toBeNull();
    expect(parseOwnerName('')).toBeNull();
    expect(addBotHref('alice', 'jeryu')).toBe('/bots?repo=alice%2Fjeryu');
  });
});

describe('BotsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists kind badges, reach, status, and last access', async () => {
    mockFetch({
      'GET /api/v1/bots': {
        bots: [
          summary({ id: 'active-1', display_name: 'Northwind', kind: 'grok' }),
          summary({
            id: 'held-1',
            display_name: 'Southwind',
            slug: 'south',
            kind: 'muse',
            status: 'suspended',
            reach: {
              mode: 'repositories',
              repos: [{ owner: 'ada', name: 'widgets' }],
            },
          }),
          summary({
            id: 'dead-1',
            display_name: 'Branchwind',
            slug: 'branch',
            kind: 'grok',
            status: 'revoked',
            reach: taskReach('branch', 'feature/login'),
            last_successful_access: null,
          }),
          summary({
            id: 'owners-1',
            display_name: 'Ownerwind',
            slug: 'owners',
            kind: 'claude',
            reach: { mode: 'owners', owners: ['acme', 'ada'] },
          }),
          summary({
            id: 'future-1',
            display_name: 'Futurewind',
            slug: 'future',
            kind: 'codex',
            reach: { mode: 'galaxy' },
          }),
        ],
      },
    });

    renderPage();

    expect(await screen.findByText('Northwind')).toBeInTheDocument();
    const list = screen.getByTestId('bot-list');
    expect(list).toHaveTextContent('Northwind');
    expect(list).toHaveTextContent('Southwind');
    const kinds = within(list).getAllByTestId('bot-kind');
    expect(kinds.map((badge) => badge.textContent)).toEqual([
      'Grokbot',
      'Musebot',
      'Grokbot',
      'claude',
      'codex',
    ]);
    expect(kinds[0]).not.toHaveTextContent('Northwind');
    expect(list).toHaveTextContent('General');
    expect(list).toHaveTextContent('ada/widgets');
    expect(list).toHaveTextContent('feature/login');
    expect(list).not.toHaveTextContent('Task #feature/login');
    expect(list).toHaveTextContent('Active');
    expect(list).toHaveTextContent('Suspended');
    expect(list).toHaveTextContent('Revoked');

    const rows = within(list).getAllByRole('row');
    const revoked = rows.find((row) => row.textContent?.includes('Branchwind'));
    const held = rows.find((row) => row.textContent?.includes('Southwind'));
    expect(revoked).toBeTruthy();
    expect(held).toBeTruthy();
    expect(within(revoked as HTMLElement).getByTestId('bot-suspend')).toBeDisabled();
    expect(within(revoked as HTMLElement).getByTestId('bot-revoke')).toBeDisabled();
    expect(within(revoked as HTMLElement).getByTestId('bot-rotate')).toBeDisabled();
    expect(within(held as HTMLElement).getByTestId('bot-suspend')).toBeDisabled();
    expect(within(held as HTMLElement).getByTestId('bot-revoke')).toBeEnabled();

    const ownerRow = rows.find((row) => row.textContent?.includes('Ownerwind'));
    expect(
      within(ownerRow as HTMLElement)
        .getAllByTestId('bot-reach-row')
        .map((item) => item.textContent)
    ).toEqual(['acme/*', 'ada/*']);
    const futureRow = rows.find((row) => row.textContent?.includes('Futurewind'));
    expect(within(futureRow as HTMLElement).getByTestId('bot-reach')).toHaveTextContent(
      'Unknown reach: galaxy'
    );

    const kind = screen.getByTestId('bot-kind-input');
    expect(kind).toHaveValue('');
    const suggestions = document.getElementById(kind.getAttribute('list') ?? '');
    expect(
      Array.from(suggestions?.querySelectorAll('option') ?? []).map((option) => option.value)
    ).toEqual(['grok', 'muse', 'claude', 'codex']);
  });

  it('shows the key and script once, and does not invent one later', async () => {
    const fetchSpy = mockFetch({
      'GET /api/v1/bots': { bots: [] },
      'POST /api/v1/bots': receipt('enroll-once-key', 'setup-script-body'),
    });

    const view = renderPage();
    expect(screen.queryByTestId('bot-setup')).not.toBeInTheDocument();
    expect(await screen.findByText('No agent on this account yet.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Display name'), 'North');
    await userEvent.type(screen.getByLabelText('Slug'), 'north');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    const setup = await screen.findByTestId('bot-setup');
    expect(setup).toHaveTextContent('enroll-once-key');
    expect(setup).toHaveTextContent('setup-script-body');
    const warning = screen.getByTestId('bot-setup-warning');
    expect(warning).toHaveTextContent(
      "Pasting the script puts the key in that agent's transcript"
    );
    expect(warning).toHaveTextContent('only as private as that computer');
    expect(warning).toHaveTextContent(
      'Every Grokbot on one account shares that computer, its files, and its credentials'
    );
    expect(warning).toHaveTextContent(
      'General reach is live: later repository grants widen it and lost grants cut it off on the next call.'
    );
    expect(warning).toHaveTextContent('does not scrub a transcript');
    expect(warning).toHaveTextContent('will not invent one');

    const posted = postBodies(fetchSpy, '/api/v1/bots');
    expect(posted).toEqual([
      {
        slug: 'north',
        display_name: 'North',
        reach: { mode: 'general' },
      },
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Hide this key' }));
    expect(screen.queryByText('enroll-once-key')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show/i })).not.toBeInTheDocument();

    view.unmount();
    renderPage();
    expect(screen.queryByTestId('bot-setup')).not.toBeInTheDocument();
    expect(screen.queryByText('enroll-once-key')).not.toBeInTheDocument();
  });

  it('rotates, suspends, and revokes without inventing a key', async () => {
    const fetchSpy = mockFetch({
      'GET /api/v1/bots': { bots: [summary()] },
      'POST /api/v1/bots/bot-1/keys': receipt('rotated-key', 'rotated-script'),
      'POST /api/v1/bots/bot-1/suspend': summary({ status: 'suspended' }),
      'POST /api/v1/bots/bot-1/revoke': summary({ status: 'revoked' }),
    });

    renderPage();
    await screen.findByText('Northwind');

    await userEvent.click(screen.getByTestId('bot-rotate'));
    expect(await screen.findByTestId('bot-setup')).toHaveTextContent('rotated-key');
    expect(screen.getByTestId('bot-setup')).toHaveTextContent('rotated-script');

    await userEvent.click(screen.getByTestId('bot-suspend'));
    await userEvent.click(screen.getByTestId('bot-revoke'));

    await waitFor(() => {
      const calls = fetchSpy.mock.calls as Array<[unknown, RequestInit | undefined]>;
      const urls = calls
        .filter(([, init]) => (init?.method ?? 'GET') === 'POST')
        .map(([url]) => String(url));
      expect(urls).toEqual([
        '/api/v1/bots/bot-1/keys',
        '/api/v1/bots/bot-1/suspend',
        '/api/v1/bots/bot-1/revoke',
      ]);
    });
  });

  it('preselects a repository and posts selected repositories or one task', async () => {
    const fetchSpy = mockFetch({
      'GET /api/v1/bots': { bots: [] },
      'POST /api/v1/bots': receipt('repo-key', 'repo-script'),
    });

    const view = renderPage('/bots?repo=ada/widgets');
    expect(await screen.findByTestId('bot-reach-select')).toHaveValue('repositories');
    expect(screen.getByLabelText('Repositories, one per line')).toHaveValue('ada/widgets');

    await userEvent.type(screen.getByLabelText('Kind (optional)'), 'grok');
    await userEvent.type(screen.getByLabelText('Display name'), 'Ada');
    await userEvent.type(screen.getByLabelText('Slug'), 'ada');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await screen.findByText('repo-key');
    expect(postBodies(fetchSpy, '/api/v1/bots')).toEqual([
      {
        slug: 'ada',
        display_name: 'Ada',
        kind: 'grok',
        reach: { mode: 'repositories', repos: [{ owner: 'ada', name: 'widgets' }] },
      },
    ]);

    view.unmount();
    fetchSpy.mockRestore();
    const taskSpy = mockFetch({
      'GET /api/v1/bots': { bots: [] },
      'POST /api/v1/bots': receipt('task-key', 'task-script'),
    });
    renderPage('/bots');
    await userEvent.type(screen.getByLabelText('Kind (optional)'), 'muse');
    await userEvent.selectOptions(screen.getByTestId('bot-reach-select'), 'task');
    await userEvent.type(screen.getByLabelText('Display name'), 'Issue');
    await userEvent.type(screen.getByLabelText('Slug'), 'issue');
    await userEvent.type(screen.getByLabelText('Owner'), 'ada');
    await userEvent.type(screen.getByLabelText('Name'), 'widgets');
    await userEvent.selectOptions(screen.getByLabelText('Task kind'), 'pull');
    await userEvent.type(screen.getByLabelText('Task id'), '9');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await screen.findByText('task-key');
    expect(postBodies(taskSpy, '/api/v1/bots')).toEqual([
      {
        slug: 'issue',
        display_name: 'Issue',
        kind: 'muse',
        reach: {
          mode: 'task',
          repo: { owner: 'ada', name: 'widgets' },
          task_kind: 'pull',
          task_id: '9',
        },
      },
    ]);
  });

  it('refuses a bad repository line and a failed create without showing a key', async () => {
    const fetchSpy = mockFetch({
      'GET /api/v1/bots': { bots: [] },
      'POST /api/v1/bots': {
        status: 422,
        body: { error: { code: 'invalid', message: 'Slug is taken.' } },
      },
    });

    renderPage();
    await userEvent.selectOptions(await screen.findByTestId('bot-reach-select'), 'repositories');
    await userEvent.type(screen.getByLabelText('Display name'), 'Nope');
    await userEvent.type(screen.getByLabelText('Slug'), 'nope');
    await userEvent.type(
      screen.getByLabelText('Repositories, one per line'),
      'not-a-repo'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not-a-repo');
    expect(postBodies(fetchSpy, '/api/v1/bots')).toEqual([]);
    expect(screen.queryByTestId('bot-setup')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Repositories, one per line'));
    await userEvent.type(
      screen.getByLabelText('Repositories, one per line'),
      'ada/widgets'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByTestId('bot-form-error')).toHaveTextContent('Slug is taken.');
    expect(screen.queryByTestId('bot-setup')).not.toBeInTheDocument();
  });

  it('posts whole owners, refuses mixed lines and a bad kind without posting', async () => {
    const fetchSpy = mockFetch({
      'GET /api/v1/bots': { bots: [] },
      'POST /api/v1/bots': receipt('owners-key', 'owners-script'),
    });

    renderPage();
    await userEvent.selectOptions(await screen.findByTestId('bot-reach-select'), 'repositories');
    await userEvent.type(screen.getByLabelText('Display name'), 'Fam');
    await userEvent.type(screen.getByLabelText('Slug'), 'fam');
    const lines = screen.getByLabelText('Repositories, one per line');
    await userEvent.type(lines, 'acme/*{enter}ada/widgets');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MIXED_REACH_ERROR);

    await userEvent.clear(lines);
    await userEvent.type(lines, 'acme/*{enter}ada/*');
    await userEvent.type(screen.getByLabelText('Kind (optional)'), 'Claude');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('lowercase letter');
    expect(postBodies(fetchSpy, '/api/v1/bots')).toEqual([]);

    await userEvent.clear(screen.getByLabelText('Kind (optional)'));
    await userEvent.type(screen.getByLabelText('Kind (optional)'), 'claude');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('owners-key');
    expect(postBodies(fetchSpy, '/api/v1/bots')).toEqual([
      {
        slug: 'fam',
        display_name: 'Fam',
        kind: 'claude',
        reach: { mode: 'owners', owners: ['acme', 'ada'] },
      },
    ]);
  });

  it('links the agent setup page beside the agent tokens', async () => {
    mockFetch({
      'GET /api/v1/bots': { bots: [summary()] },
      'GET /api/v1/bots/bot-1/tokens': { tokens: [] },
    });
    renderPage();
    const doc = await screen.findByTestId('bots-connect-doc');
    const link = within(doc).getByRole('link', { name: 'Agent setup page' });
    expect(link).toHaveAttribute('href', '/api/v1/docs/connect-an-agent.md');
    expect(link).toHaveAttribute('target', '_blank');
    expect(doc).toHaveTextContent(
      'Send this page and an agent token to an external agent to connect it.'
    );
  });

  it('shows an error when the account list cannot be loaded', async () => {
    mockFetch({
      'GET /api/v1/bots': {
        status: 500,
        body: { error: { code: 'internal', message: 'List unavailable.' } },
      },
    });

    renderPage();
    expect(await screen.findByTestId('bot-list-error')).toHaveTextContent('List unavailable.');
  });
});

function taskReach(taskKind: 'issue' | 'pull' | 'branch', taskId: string): BotReach {
  return {
    mode: 'task',
    repo: { owner: 'ada', name: 'widgets' },
    task_kind: taskKind,
    task_id: taskId,
  };
}

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
    last_outcome: 'shipped',
    last_repo: null,
    created_at: NOW,
    ...overrides,
  };
}

function receipt(key: string, script: string): Record<string, unknown> {
  return {
    bot: summary(),
    key_id: 'key-1',
    enrollment_key: key,
    setup_script: script,
  };
}

function renderPage(entry = '/bots'): { unmount: () => void } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/bots" element={<BotsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { unmount: () => view.unmount() };
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
    const match = routes[key];
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

function postBodies(spy: ReturnType<typeof vi.spyOn>, path: string): unknown[] {
  const calls = spy.mock.calls as Array<[unknown, RequestInit | undefined]>;
  return calls
    .filter(([url, init]) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      return method === 'POST' && String(url).includes(path);
    })
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : null));
}
