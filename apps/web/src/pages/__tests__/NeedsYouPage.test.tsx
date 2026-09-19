// NeedsYouPage.test.tsx — the landing page: severity groups, the copyable
// command, the empty state, and graceful degradation on an older server.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NeedsYouPage } from '../needsYou';
import { htmlShell, mockPipelineApi } from './pipelinePageHelpers';
import { ATTENTION, DEPLOY_COMMAND } from './pipelineTestData';
import { errorResponse, json, renderAt } from './shiftPageHelpers';

function renderPage(): void {
  renderAt('/needs-you', '/needs-you', <NeedsYouPage />);
}

describe('NeedsYouPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows red rows with one action each and folds watch rows behind a count', async () => {
    mockPipelineApi();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();

    const critical = await screen.findByTestId('needs-you-critical');
    expect(within(critical).getByText('No healthy worker slot for jain')).toBeInTheDocument();
    const action = screen.getByTestId('needs-you-action');

    // Off-site act: the command is the one action; there is no second link.
    const staged = within(action).getByTestId('needs-you-item-release_staged:jeryu/jeryu-deploy');
    expect(staged).toHaveClass('needs-you__row--danger');
    expect(within(staged).getByText(DEPLOY_COMMAND)).toBeInTheDocument();
    expect(within(staged).queryByRole('link')).toBeNull();
    expect(within(staged).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(within(staged).getByRole('button', { name: /^Copy Deploy command for Release/ }));
    expect(writeText).toHaveBeenCalledWith(DEPLOY_COMMAND);
    expect(await within(staged).findByText('Copied')).toBeInTheDocument();

    // In-app act: one link, a plain-language kind, one line of reason.
    const blocked = within(action).getByTestId('needs-you-item-todo-blocked:jeryu:20260919-130515-f8cc66');
    expect(within(blocked).getByText(/^Blocked todo · jeryu/)).toBeInTheDocument();
    expect(within(blocked).queryByText(/todo_blocked/)).toBeNull();
    expect(within(blocked).getByText('Both halves of this todo need jeryu-core changes.')).toBeInTheDocument();
    expect(within(blocked).getAllByRole('link')).toHaveLength(1);
    expect(within(blocked).getByRole('link', { name: /^Open: Allow PATCH/ })).toHaveAttribute(
      'href',
      '/work/shift?family=jeryu&todo=20260919-130515-f8cc66'
    );
    expect(within(blocked).queryByRole('button')).toBeNull();

    // Watch rows are neutral and collapsed behind a count.
    const watch = screen.getByTestId('needs-you-watch');
    expect(watch).not.toHaveAttribute('open');
    expect(within(watch).getByText('1 thing worth a look, none waiting on you')).toBeInTheDocument();
    expect(watch.querySelector('.needs-you__row--neutral')).not.toBeNull();
    expect(watch.querySelector('.needs-you__row--danger')).toBeNull();
    expect(screen.queryByTestId('needs-you-pulse')).toBeNull();
  });

  it('says nothing needs you in one sentence, with a line about what the system is doing', async () => {
    mockPipelineApi((req) => {
      if (req.pathname === '/api/v1/attention') {
        return json({
          schema_version: 1,
          generated_at: '2026-09-19T13:15:00Z',
          items: [],
          counts: { critical: 0, action: 0, watch: 0 },
          some_future_field: true,
        });
      }
      if (req.pathname === '/api/v1/shift/workers') {
        return json({
          generated_at: 'x',
          workers: [
            { operator: 'alton', host: 'xbabe0', slot: 'w1', family: 'jeryu', state: 'working', last_seen: 'x', healthy: true },
            { operator: 'alton', host: 'xbabe0', slot: 'w2', family: 'jeryu', state: 'idle', last_seen: 'x', healthy: true },
          ],
        });
      }
      return undefined;
    });
    renderPage();
    expect(await screen.findByText('Nothing needs you.')).toBeInTheDocument();
    const pulse = await screen.findByTestId('needs-you-pulse');
    await waitFor(() => expect(pulse).toHaveTextContent('1 of 2 worker slots busy'));
    await waitFor(() => expect(pulse).toHaveTextContent(/last event .*: Staged prod-20260919T130210Z/));
    // Runners are unmocked (404): that part is simply left out.
    expect(pulse).not.toHaveTextContent('gate runners');
    expect(within(pulse).getByRole('link', { name: 'Activity' })).toHaveAttribute('href', '/activity');
  });

  it('stays calm when only watch rows exist', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/attention'
        ? json({
            generated_at: '2026-09-19T13:15:00Z',
            items: [ATTENTION.items[3]],
            counts: { critical: 0, action: 0, watch: 1 },
          })
        : undefined
    );
    renderPage();
    expect(await screen.findByText('Nothing needs you.')).toBeInTheDocument();
    expect(screen.getByTestId('needs-you-watch')).toBeInTheDocument();
  });

  it.each([
    ['a 404', () => errorResponse(404, 'no route')],
    ['the SPA shell', () => htmlShell()],
  ])('degrades to "not available" when the server answers with %s', async (_name, response) => {
    mockPipelineApi((req) => (req.pathname === '/api/v1/attention' ? response() : undefined));
    renderPage();
    expect(await screen.findByText('Not available on this server version.')).toBeInTheDocument();
  });

  it('explains admin-only on a 403 and surfaces other errors', async () => {
    mockPipelineApi((req) => (req.pathname === '/api/v1/attention' ? errorResponse(403, 'admin only') : undefined));
    renderPage();
    expect(await screen.findByText('Only admins can see the Needs you list.')).toBeInTheDocument();
  });
});
