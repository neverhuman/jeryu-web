// NeedsYouPage.test.tsx — the landing page: severity groups, the copyable
// command, the empty state, and graceful degradation on an older server.

import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NeedsYouPage } from '../needsYou';
import { htmlShell, mockPipelineApi } from './pipelinePageHelpers';
import { DEPLOY_COMMAND } from './pipelineTestData';
import { errorResponse, json, renderAt } from './shiftPageHelpers';

function renderPage(): void {
  renderAt('/needs-you', '/needs-you', <NeedsYouPage />);
}

describe('NeedsYouPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('groups rows by severity with links, chips and the copyable command', async () => {
    mockPipelineApi();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();

    const critical = await screen.findByTestId('needs-you-critical');
    expect(within(critical).getByText('No healthy worker slot for jain')).toBeInTheDocument();
    const action = screen.getByTestId('needs-you-action');
    const staged = within(action).getByTestId('needs-you-item-release_staged:jeryu/jeryu-deploy');
    expect(within(staged).getByText(DEPLOY_COMMAND)).toBeInTheDocument();
    expect(within(staged).getByRole('link', { name: /^Deploy: Release/ })).toHaveAttribute('href', '/releases');
    fireEvent.click(within(staged).getByRole('button', { name: /^Copy command for Release/ }));
    expect(writeText).toHaveBeenCalledWith(DEPLOY_COMMAND);
    expect(await within(staged).findByText('Copied')).toBeInTheDocument();

    const blocked = within(action).getByTestId('needs-you-item-todo-blocked:jeryu:20260919-130515-f8cc66');
    expect(within(blocked).getByText('todo blocked')).toBeInTheDocument();
    expect(within(blocked).getByText('Both halves of this todo need jeryu-core changes.')).toBeInTheDocument();
    expect(within(blocked).getByRole('link', { name: /^Open: Allow PATCH/ })).toHaveAttribute(
      'href',
      '/work/shift?family=jeryu&todo=20260919-130515-f8cc66'
    );
    // A watch row without an href is shown but is not a link.
    expect(within(screen.getByTestId('needs-you-watch')).queryByRole('link')).toBeNull();
    expect(screen.getByText(/^4 items · checked/)).toBeInTheDocument();
  });

  it('says nothing needs you, with the generated time', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/attention'
        ? json({ generated_at: '2026-09-19T13:15:00Z', items: [], counts: { critical: 0, action: 0, watch: 0 } })
        : undefined
    );
    renderPage();
    expect(await screen.findByText('Nothing needs you.')).toBeInTheDocument();
    expect(screen.getByText(/2026-09-19T13:15:00Z/)).toBeInTheDocument();
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
