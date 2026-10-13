import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiGet } from '../../../api/client';
import type { BotActivityEvent } from '../../../api/types';
import {
  BotActivityList,
  botActivityFeed,
  recentBotActivity
} from '../BotActivityList';

vi.mock('../../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/client')>()),
  apiGet: vi.fn()
}));

function event(
  id: string,
  overrides: Partial<BotActivityEvent> = {}
): BotActivityEvent {
  return {
    id,
    bot_id: 'bot-1',
    key_id: 'k-1',
    repo: 'alice/demo',
    session_id: null,
    action: `GET /api/v1/repos/r/${id}`,
    outcome: '200',
    scope: 'http',
    created_at: '2026-10-10T16:30:00Z',
    ...overrides
  };
}

function mount(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BotActivityList repo="repo-1" emptyTitle="Nothing yet" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function serve(activity: BotActivityEvent[] | Error): void {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/api/v1/repos/repo-1/bot-activity') {
      if (activity instanceof Error) throw activity;
      return { events: activity };
    }
    if (path === '/api/v1/repos/repo-1/bots') {
      return { bots: [{ id: 'bot-1', display_name: 'Atlas' }] };
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

describe('BotActivityList', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
  });

  it('shows the newest first, names the bot and links the session it worked', async () => {
    serve([
      event('a'),
      event('b', {
        action: 'session.send_input',
        outcome: 'ok',
        scope: 'mcp',
        session_id: 'vm-ar-7'
      }),
      event('c', { bot_id: 'gone' })
    ]);
    mount();
    const rows = await screen.findAllByTestId('bot-activity-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('A Grokbot or Musebot no longer listed');
    expect(rows[1]).toHaveTextContent('session.send_input');
    expect(
      within(rows[1]).getByRole('link', { name: 'vm-ar-7' })
    ).toHaveAttribute('href', '/sessions/vm-ar-7');
    await waitFor(() => expect(rows[1]).toHaveTextContent('Atlas'));
    expect(within(rows[2]).queryByRole('link')).toBeNull();
  });

  it('says when no bot has done anything', async () => {
    serve([]);
    mount();
    expect(await screen.findByTestId('bot-activity-empty')).toHaveTextContent(
      'Nothing yet'
    );
  });

  it('is absent for a reader the feed refuses', async () => {
    serve(
      new ApiError(403, {
        code: 'forbidden',
        message: 'repo write access required'
      })
    );
    mount();
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByTestId('bot-activity')).toBeNull()
    );
    expect(screen.queryByTestId('bot-activity-error')).toBeNull();
  });

  it('keeps at most the limit, and only one session when asked', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      event(`e${i}`, { session_id: i % 2 ? 'vm-1' : null })
    );
    expect(recentBotActivity(many)).toHaveLength(20);
    expect(recentBotActivity(many)[0].id).toBe('e24');
    expect(
      recentBotActivity(many, 'vm-1').every((e) => e.session_id === 'vm-1')
    ).toBe(true);
  });
});

describe('botActivityFeed', () => {
  const envelope = { code: 'forbidden', message: 'refused' };

  it('is refused for a 403 or a 404, and failed for any other error', () => {
    for (const status of [403, 404]) {
      expect(
        botActivityFeed({
          isPending: false,
          isError: true,
          error: new ApiError(status, envelope)
        })
      ).toBe('refused');
    }
    expect(
      botActivityFeed({
        isPending: false,
        isError: true,
        error: new ApiError(500, envelope)
      })
    ).toBe('failed');
    expect(
      botActivityFeed({
        isPending: false,
        isError: true,
        error: new Error('network')
      })
    ).toBe('failed');
  });

  it('is loading while pending, and ready once answered', () => {
    expect(
      botActivityFeed({ isPending: true, isError: false, error: null })
    ).toBe('loading');
    expect(
      botActivityFeed({ isPending: false, isError: false, error: null })
    ).toBe('ready');
  });
});
