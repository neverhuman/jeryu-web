import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiGet, apiSend } from '../../api/client';
import type { BotActivityEvent } from '../../api/types';
import type { SessionStatus } from '../../api/types/sessions';
import { SessionPage, controlSender } from '../SessionPage';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  apiGet: vi.fn(),
  apiSend: vi.fn()
}));

vi.mock('../../hooks/useForgeHost', () => ({
  useForgeHost: () => () => 'jeryu'
}));

function status(overrides: Partial<SessionStatus> = {}): SessionStatus {
  return {
    session_id: 'vm-ar-1',
    run_id: 'ar-1',
    shell_run_id: 'ar-2',
    repo: 'alice/demo',
    provider: 'grok',
    profile_id: 'mock-grok',
    owner: 'alice',
    started_by: 'bot/atlas',
    labels: { model: 'grok-4', todo_id: '42', slot: 'w2' },
    runner_id: 'node-a',
    generation: 2,
    dispatch_state: 'running',
    state_reason: null,
    agent_state: 'running',
    shell_state: 'running',
    created_at_ms: Date.now() - 120_000,
    updated_at_ms: Date.now() - 60_000,
    lease_expires_at_ms: Date.now() + 3_600_000,
    source_revision: 'b'.repeat(40),
    main_revision: 'a'.repeat(40),
    channels: {
      agent: {
        run_id: 'ar-1',
        state: 'running',
        error_code: null,
        exit_code: null,
        recent_controls: []
      },
      shell: {
        run_id: 'ar-2',
        state: 'running',
        error_code: null,
        exit_code: null,
        recent_controls: [
          { seq: 2, command: 'send_input', actor: 'api:alice', outcome: null },
          {
            seq: 1,
            command: 'send_input',
            actor: 'bot/atlas',
            outcome: 'applied'
          }
        ]
      }
    },
    ...overrides
  };
}

function event(overrides: Partial<BotActivityEvent>): BotActivityEvent {
  return {
    id: 'e-1',
    bot_id: 'bot-1',
    key_id: 'k-1',
    repo: 'alice/demo',
    session_id: 'vm-ar-1',
    action: 'session.read',
    outcome: 'ok',
    scope: 'mcp',
    created_at: new Date(Date.now() - 30_000).toISOString(),
    ...overrides
  };
}

/** Answer GETs by path. */
function serve(
  session: SessionStatus | Error,
  events: BotActivityEvent[] = []
): void {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/v1/me/sessions/vm-ar-1') {
      if (session instanceof Error) throw session;
      return session;
    }
    if (path === '/api/v1/repos/alice%2Fdemo/bot-activity') return { events };
    if (path === '/api/v1/repos/alice%2Fdemo/bots') {
      return { bots: [{ id: 'bot-1', display_name: 'Atlas' }] };
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

function mount(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/sessions/vm-ar-1']}>
        <Routes>
          <Route path="/sessions/:sessionId" element={<SessionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SessionPage', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiSend).mockReset();
  });

  it('says where the VM runs, what it started from and who started it', async () => {
    serve(status());
    mount();
    const facts = await screen.findByTestId('session-facts');
    expect(
      within(facts).getByRole('link', { name: 'alice/demo' })
    ).toHaveAttribute('href', '/repos/jeryu/alice/demo');
    expect(facts).toHaveTextContent('grok-4');
    expect(facts).toHaveTextContent('bot/atlas');
    expect(facts).toHaveTextContent('node-a generation 2');
    expect(facts).toHaveTextContent('running');
    expect(
      within(facts).getByRole('link', { name: 'todo 42' })
    ).toHaveAttribute('href', '/work/42');
    // Started from a branch commit, on a newer main: both are named.
    expect(
      within(facts).getByRole('link', { name: 'b'.repeat(12) })
    ).toHaveAttribute(
      'href',
      `/repos/jeryu/alice/demo/commit/${'b'.repeat(40)}`
    );
    expect(
      within(facts).getByRole('link', { name: 'a'.repeat(12) })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open its terminals' })
    ).toHaveAttribute('href', '/repos/jeryu/alice/demo/agents/ar-1');
  });

  it('names who sent each control: a bot by its slug, the owner by login', async () => {
    serve(status());
    mount();
    const shell = await screen.findByTestId('session-channel-shell');
    const rows = within(shell).getAllByTestId('session-control');
    expect(rows[0]).toHaveTextContent('send_input');
    expect(rows[0]).toHaveTextContent('alice');
    expect(rows[0]).toHaveTextContent('pending');
    expect(rows[1]).toHaveTextContent('bot/atlas');
    expect(rows[1]).toHaveTextContent('applied');
    expect(
      within(screen.getByTestId('session-channel-agent')).getByText(
        'No control sent yet.'
      )
    ).toBeInTheDocument();
  });

  it('lists what bots did in this session only, newest first', async () => {
    serve(status(), [
      event({
        id: 'e-1',
        action: 'POST /api/v1/repos/r/sessions',
        outcome: '201',
        scope: 'http'
      }),
      event({ id: 'e-2', session_id: 'vm-ar-9', action: 'session.stop' }),
      event({ id: 'e-3', action: 'session.read' })
    ]);
    mount();
    const list = await screen.findByTestId('session-bot-activity');
    await waitFor(() =>
      expect(
        within(list).getAllByTestId('session-bot-activity-row')
      ).toHaveLength(2)
    );
    const rows = within(list).getAllByTestId('session-bot-activity-row');
    expect(rows[0]).toHaveTextContent('session.read');
    expect(rows[1]).toHaveTextContent('POST /api/v1/repos/r/sessions');
    expect(rows[1]).toHaveTextContent('201');
    await waitFor(() => expect(rows[0]).toHaveTextContent('Atlas'));
    expect(list).not.toHaveTextContent('session.stop');
  });

  it('stops the session after a confirmation', async () => {
    serve(status({ agent_state: 'succeeded' }));
    vi.mocked(apiSend).mockResolvedValue({ accepted: true });
    mount();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Stop vm-ar-1' })
    );
    expect(apiSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm stop' }));
    await waitFor(() =>
      expect(apiSend).toHaveBeenCalledWith('/api/v1/agent-runs/ar-2/control', {
        kind: 'terminate'
      })
    );
  });

  it('says so when no session of yours has the id', async () => {
    serve(new ApiError(404, { code: 'not_found', message: 'no such session' }));
    mount();
    expect(await screen.findByTestId('session-missing')).toHaveTextContent(
      'No session of yours has this id.'
    );
  });

  it('reads a sender', () => {
    expect(controlSender('api:alice')).toBe('alice');
    expect(controlSender('bot/atlas')).toBe('bot/atlas');
    expect(controlSender('attach:1f2e')).toBe('an attached terminal');
    expect(controlSender(null)).toBe('unknown');
  });
});
