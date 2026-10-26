import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiGet, apiSend } from '../../api/client';
import type { RunnerStatus, SessionSummary } from '../../api/types/sessions';
import {
  CERTIFICATE_DUE_MS,
  SessionsPage,
  certificateNote,
  isLiveSession,
  stopChannel
} from '../SessionsPage';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  apiGet: vi.fn(),
  apiSend: vi.fn()
}));

vi.mock('../../hooks/useForgeHost', () => ({
  useForgeHost: () => () => 'jeryu'
}));

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: 'vm-ar-1',
    run_id: 'ar-1',
    shell_run_id: 'ar-2',
    repo: 'alice/demo',
    provider: 'grok',
    profile_id: 'mock-grok',
    owner: 'alice',
    started_by: 'bot/atlas',
    labels: {
      model: 'grok-4',
      todo_id: '42',
      slot: 'w2',
      branch: 'nightshift/2026-10-09'
    },
    runner_id: 'node-a',
    generation: 1,
    dispatch_state: 'running',
    state_reason: null,
    agent_state: 'running',
    shell_state: 'running',
    created_at_ms: Date.now() - 120_000,
    updated_at_ms: Date.now() - 60_000,
    lease_expires_at_ms: Date.now() + 3_600_000,
    source_revision: 'a'.repeat(40),
    main_revision: 'a'.repeat(40),
    ...overrides
  };
}

const READY: RunnerStatus = {
  ready: true,
  runtime: 'firecracker',
  runner_id: 'node-a',
  profiles: { grok: 'mock-grok', claude: 'mock-claude', codex: 'mock-codex' },
  open_sessions: { mine: 1, all: null }
};

/** Answer GETs by path: sessions by the `state` asked for, then the runner. */
function serve(
  sessionsByState: Record<string, SessionSummary[]>,
  runner: RunnerStatus | Error = READY
): void {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path.startsWith('/api/v1/me/sessions')) {
      const state =
        new URL(path, 'http://x').searchParams.get('state') ?? 'all';
      const rows = sessionsByState[state] ?? [];
      return { count: rows.length, sessions: rows };
    }
    if (path === '/api/v1/runner/status') {
      if (runner instanceof Error) throw runner;
      return runner;
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
      <MemoryRouter>
        <SessionsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SessionsPage', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiSend).mockReset();
  });

  it('lists running sessions with where they run, who started them and what for', async () => {
    serve({ running: [session()] });
    mount();
    const row = await screen.findByTestId('sessions-row');
    const open = within(row).getByRole('link', { name: 'vm-ar-1' });
    expect(open).toHaveAttribute('href', '/sessions/vm-ar-1');
    expect(
      within(row).getByRole('link', { name: 'alice/demo' })
    ).toHaveAttribute('href', '/repos/jeryu/alice/demo');
    expect(within(row).getByRole('link', { name: 'todo 42' })).toHaveAttribute(
      'href',
      '/work/42'
    );
    expect(row).toHaveTextContent('grok');
    expect(row).toHaveTextContent('grok-4');
    expect(row).toHaveTextContent('bot/atlas');
    // A session started from a named branch says which.
    expect(row).toHaveTextContent('nightshift/2026-10-09');
    expect(row).toHaveTextContent('agent running, shell running');
    expect(row).toHaveTextContent('2 min ago');
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/me/sessions?state=running',
      expect.anything()
    );
    await waitFor(() =>
      expect(screen.getByTestId('sessions-runner')).toHaveTextContent(
        'The session runner is ready on node-a, for claude, codex, grok. You have 1 open session.'
      )
    );
  });

  it('shows finished sessions on request, with nothing to stop', async () => {
    serve({
      running: [],
      finished: [
        session({
          dispatch_state: 'stopped',
          agent_state: 'succeeded',
          shell_state: 'failed'
        })
      ]
    });
    mount();
    expect(await screen.findByTestId('sessions-empty')).toHaveTextContent(
      'No session is running.'
    );
    fireEvent.change(screen.getByTestId('sessions-filter'), {
      target: { value: 'finished' }
    });
    const row = await screen.findByTestId('sessions-row');
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/me/sessions?state=finished',
      expect.anything()
    );
    expect(row).toHaveTextContent('stopped');
    expect(within(row).queryByRole('button', { name: /stop/i })).toBeNull();
  });

  it('stops a session through the channel that still runs, after a confirmation', async () => {
    serve({ running: [session({ agent_state: 'succeeded' })] });
    vi.mocked(apiSend).mockResolvedValue({ accepted: true });
    mount();
    const row = await screen.findByTestId('sessions-row');
    fireEvent.click(within(row).getByRole('button', { name: 'Stop vm-ar-1' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Stopping ends the VM: the agent and the shell in it stop together.'
    );
    expect(apiSend).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole('button', { name: 'Confirm stop' }));
    await waitFor(() =>
      expect(apiSend).toHaveBeenCalledWith('/api/v1/agent-runs/ar-2/control', {
        kind: 'terminate'
      })
    );
  });

  it('keeps a session when the stop is not confirmed', async () => {
    serve({ running: [session()] });
    mount();
    const row = await screen.findByTestId('sessions-row');
    fireEvent.click(within(row).getByRole('button', { name: 'Stop vm-ar-1' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Keep' }));
    expect(
      within(row).getByRole('button', { name: 'Stop vm-ar-1' })
    ).toBeInTheDocument();
    expect(apiSend).not.toHaveBeenCalled();
  });

  it('says why the session runner cannot take a session', async () => {
    serve(
      { running: [] },
      {
        ready: false,
        runtime: 'firecracker',
        reason: 'runner_not_configured',
        repair_hint:
          'an operator sets JERYU_RUNNER_SESSION_CONFIG to an enrolled session node',
        open_sessions: { mine: 0, all: null }
      }
    );
    mount();
    await waitFor(() =>
      expect(screen.getByTestId('sessions-runner')).toHaveTextContent(
        'The session runner cannot take a session now (runner_not_configured). an operator sets JERYU_RUNNER_SESSION_CONFIG to an enrolled session node'
      )
    );
  });

  it('wears the shared page header, with the one heading inside it', async () => {
    serve({ running: [] });
    mount();
    const header = await screen.findByTestId('sessions-header');
    expect(header).toHaveAttribute('data-page-header');
    expect(
      within(header).getByRole('heading', { level: 1, name: 'Agents' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(within(header).getByTestId('sessions-filter')).toBeInTheDocument();
  });

  it('calls out a node certificate that runs out within six hours', async () => {
    serve(
      { running: [session()] },
      {
        ...READY,
        node_certificate_expires_at: new Date(
          Date.now() + 3 * 3_600_000
        ).toISOString()
      }
    );
    mount();
    await waitFor(() =>
      expect(screen.getByTestId('sessions-runner')).toHaveTextContent(
        'Its node certificate expires in 3 h'
      )
    );
    expect(screen.getByTestId('sessions-runner')).toHaveClass(
      'sessions__runner--due'
    );
    expect(screen.getByTestId('sessions-runner')).toHaveTextContent(
      'a session that would outlive it is refused'
    );
  });

  it('shows a failed load with a retry, and a runner that does not answer', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('down'));
    mount();
    expect(await screen.findByTestId('sessions-error')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('sessions-runner')).toHaveTextContent(
        'The session runner did not answer.'
      )
    );
  });
});

describe('the node certificate', () => {
  const now = Date.parse('2026-10-10T03:00:00Z');

  it('says nothing until the server has reached the node', () => {
    expect(certificateNote(null, now)).toBeNull();
    expect(certificateNote(undefined, now)).toBeNull();
  });

  it('is plain while far off, and due inside six hours or once past', () => {
    const far = certificateNote('2026-10-12T03:00:00Z', now);
    expect(far?.due).toBe(false);
    expect(far?.text).toMatch(/^Its node certificate is valid until /);

    const soon = certificateNote(
      new Date(now + CERTIFICATE_DUE_MS - 60_000).toISOString(),
      now
    );
    expect(soon?.due).toBe(true);
    expect(soon?.text).toMatch(/^Its node certificate expires in 6 h /);

    const past = certificateNote('2026-10-10T02:59:00Z', now);
    expect(past).toEqual({
      text: 'Its node certificate has expired, so every new session is refused until it is renewed.',
      due: true
    });
  });

  it('reads both offset spellings the API emits', () => {
    expect(certificateNote('2026-10-10T05:00:00+00:00', now)?.text).toMatch(
      /^Its node certificate expires in 2 h /
    );
  });
});

describe('stopping and liveness', () => {
  it('stops through the agent while it runs, else through the shell', () => {
    expect(stopChannel(session())).toBe('ar-1');
    expect(stopChannel(session({ agent_state: 'succeeded' }))).toBe('ar-2');
  });

  it('treats a settled session as finished whatever its channels say', () => {
    expect(isLiveSession(session())).toBe(true);
    expect(isLiveSession(session({ dispatch_state: 'stopped' }))).toBe(false);
    expect(
      isLiveSession(
        session({ agent_state: 'failed', shell_state: 'succeeded' })
      )
    ).toBe(false);
  });
});
