// ReadyToPin.test.tsx — the top of the Unreleased page: pins that are not
// current, their one next step, the quiet line for current pins, and graceful
// degradation (older server, non-admin).

import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReadyToPin } from '../ReadyToPin';
import { htmlShell, mockPipelineApi } from './pipelinePageHelpers';
import { PINS } from './pipelineTestData';
import { json, renderAt } from './shiftPageHelpers';

let role: 'admin' | 'user' = 'admin';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role } }),
}));

const DEPLOY_SCOPE = { repo: 'jeryu/jeryu-deploy', family: null, familyRepos: [] };

function renderSection(scope = DEPLOY_SCOPE): void {
  renderAt('/unreleased', '/unreleased', <ReadyToPin scope={scope} />);
}

describe('ReadyToPin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    role = 'admin';
  });

  it('lists what is merged but not pinned, one next step each, and folds current pins', async () => {
    mockPipelineApi();
    renderSection();

    const section = await screen.findByTestId('ready-to-pin');
    const consumer = within(section).getByTestId('pins-consumer-jeryu/jeryu-deploy');
    expect(within(section).queryByTestId('pins-consumer-veox/jain-deploy')).toBeNull();

    const web = within(consumer).getByTestId('pin-jeryu/jeryu-web');
    expect(within(web).getByText('9 merged commits not pinned yet')).toBeInTheDocument();
    expect(within(web).getByText('the pin bump opens by itself within minutes')).toBeInTheDocument();
    // A pin that bumps itself is not red.
    expect(within(web).getByText('9 merged commits not pinned yet')).not.toHaveClass('page__pill--danger');
    expect(within(web).getByRole('link', { name: 'jeryu-web' })).toHaveAttribute(
      'href',
      '/releases?repo=jeryu%2Fjeryu-web#unreleased'
    );
    const ships = within(web).getByText('What a bump would ship (2 of 9)');
    expect(ships.closest('details')).not.toHaveAttribute('open');
    expect(within(web).getByText('test: the dock test brings its own Storage')).toBeInTheDocument();

    // The trailing tag sits inside the folded line, after the commit pin.
    const tagged = within(consumer).getByTestId('pins-tagged-jeryu/jeryu-deploy');
    expect(tagged).not.toHaveAttribute('open');
    expect(within(tagged).getByText('1 dependency has commits since its pinned tag')).toBeInTheDocument();
    expect(web.compareDocumentPosition(tagged) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const core = within(tagged).getByTestId('pin-jeryu/jeryu-core');
    expect(
      within(core).getByText('3 commits since tag jeryu-core-v5.0.0-split.6, needs a new tag')
    ).toHaveClass('pins__label');
    // A trailing tag is a watch item: a plain sentence, no pill.
    expect(core.querySelector('.page__pill')).toBeNull();

    expect(within(consumer).getByTestId('pins-current-jeryu/jeryu-deploy')).toHaveTextContent('2 pins current');
    expect(within(consumer).queryByTestId('pin-jeryu/jeryu-cache')).toBeNull();
  });

  it('links the open bump PR as the one next step', async () => {
    mockPipelineApi((req) => {
      if (req.pathname !== '/api/v1/pins') return undefined;
      const consumer = PINS.consumers[0];
      return json({
        ...PINS,
        some_future_field: 1,
        consumers: [
          {
            ...consumer,
            pins: [
              {
                ...consumer.pins[0],
                bump_pr: { number: 53, state: 'open', url: '/repos/jeryu/jeryu/jeryu-deploy/pulls/53' },
              },
            ],
          },
        ],
      });
    });
    renderSection();
    const web = await screen.findByTestId('pin-jeryu/jeryu-web');
    expect(within(web).getByRole('link', { name: 'bump PR #53 is open' })).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-deploy/pulls/53'
    );
    expect(within(web).queryByText(/opens by itself/)).toBeNull();
  });

  it('says so in one quiet line when every pin is current', async () => {
    mockPipelineApi();
    renderSection({ repo: 'veox/jain-deploy', family: null, familyRepos: [] });
    expect(await screen.findByTestId('pins-current-veox/jain-deploy')).toHaveTextContent(
      'All 1 pin current: nothing merged is waiting for a pin.'
    );
  });

  it('degrades to one quiet sentence on a server without the route', async () => {
    mockPipelineApi((req) => (req.pathname === '/api/v1/pins' ? htmlShell() : undefined));
    renderSection();
    expect(await screen.findByTestId('ready-to-pin-unavailable')).toHaveTextContent(
      'Pins are not available on this server version.'
    );
  });

  it('renders nothing for a scope with no deploy repo, and never asks as a non-admin', async () => {
    const calls = mockPipelineApi();
    renderSection({ repo: 'other/repo', family: null, familyRepos: [] });
    await waitFor(() => expect(calls.some((c) => c.pathname === '/api/v1/pins')).toBe(true));
    await waitFor(() => expect(screen.queryByTestId('ready-to-pin')).toBeNull());

    role = 'user';
    const before = calls.length;
    renderSection();
    expect(screen.queryByTestId('ready-to-pin')).toBeNull();
    expect(calls.slice(before).some((c) => c.pathname === '/api/v1/pins')).toBe(false);
  });
});
