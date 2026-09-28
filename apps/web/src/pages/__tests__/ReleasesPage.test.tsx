// ReleasesPage.test.tsx — the staged-release banner, the deploy log link,
// linked unshipped PRs, the folded environments and the link to the timeline.

import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReleasesPage } from '../ReleasesPage';
import { mockPipelineApi } from './pipelinePageHelpers';
import { DEPLOY_COMMAND, DEPLOY_RUN_IN } from './pipelineTestData';
import { json, renderAt } from './shiftPageHelpers';

let role: 'admin' | 'user' = 'admin';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role } }),
}));

const sha = (c: string): string => c.repeat(40);

function deployment(id: number, commit: string, state: string, logUrl: string | null = null): unknown {
  return {
    deployment: {
      id,
      sha: sha(commit),
      ref: 'main',
      task: 'deploy',
      environment: 'production',
      description: null,
      payload: { release: `rel-${commit}` },
      creator: { login: 'alton2' },
      created_at: '2026-09-19T12:29:36Z',
      production_environment: true,
      transient_environment: false,
    },
    status: {
      id: id * 10,
      state,
      description: null,
      environment_url: null,
      log_url: logUrl,
      creator: { login: 'alton2' },
      created_at: '2026-09-19T12:30:00Z',
    },
    succeeded: state === 'success',
  };
}

function mockReleases(): void {
  mockPipelineApi((req) => {
    if (req.pathname === '/api/v3/repos/jeryu/jeryu-deploy/environments') {
      return json({
        total_count: 1,
        environments: [
          {
            name: 'production',
            latest: deployment(3, 'c', 'failure', 'https://git.neverhuman.org/logs/rel-c.txt'),
            current: deployment(2, 'b', 'success'),
            previous: null,
          },
        ],
      });
    }
    if (req.pathname === '/api/v1/repos/jeryu%2Fjeryu-deploy/pulls') {
      return json({ items: [{ number: 48, title: 'Shift PR', author: 'alton2', head_sha: sha('c'), state: 'merged' }] });
    }
    if (req.pathname === '/api/v1/repos/jeryu%2Fjeryu-deploy/compare') {
      return json({
        base: sha('b'),
        head: 'main',
        base_sha: sha('b'),
        head_sha: sha('c'),
        ahead_by: 1,
        behind_by: 0,
        commits: [{ sha: sha('c'), summary: 'c', author: 'dev', committed_at: '2026-09-19T12:00:00Z' }],
        truncated: false,
      });
    }
    return undefined;
  });
}

describe('ReleasesPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    role = 'admin';
  });

  it('shows the staged release with its deploy command, the deploy log, and linked unshipped PRs', async () => {
    mockReleases();
    renderAt('/releases?repo=jeryu%2Fjeryu-deploy', '/releases', <ReleasesPage />);

    const staged = await screen.findByTestId('releases-staged');
    expect(within(staged).getByText('Staged, awaiting deploy')).toBeInTheDocument();
    expect(within(staged).getByText(DEPLOY_COMMAND)).toBeInTheDocument();
    // The same where-line Needs you shows, and it describes the copy button.
    expect(within(staged).getByRole('button', { name: 'Copy deploy command' })).toHaveAccessibleDescription(
      `Run on ${DEPLOY_RUN_IN}`
    );

    const prod = await screen.findByTestId('releases-env-production');
    expect(within(prod).getByRole('link', { name: 'deploy log' })).toHaveAttribute(
      'href',
      'https://git.neverhuman.org/logs/rel-c.txt'
    );
    expect(await within(prod).findByRole('link', { name: '#48 Shift PR' })).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-deploy/pulls/48'
    );
    // A dependency merged work this repo's pin does not carry: one line, one link.
    const unpinned = await screen.findByTestId('releases-unpinned');
    expect(unpinned).toHaveTextContent("jeryu-web has 9 merged commits not in this repo's pin.");
    expect(unpinned).not.toHaveTextContent('jeryu-core');
    expect(within(unpinned).getByRole('link', { name: 'See what a bump would ship' })).toHaveAttribute(
      'href',
      '/pull-room?repo=jeryu%2Fjeryu-deploy'
    );
    // This page is about environments: pull requests are the timeline's job,
    // and the header says so with a link instead of listing them here.
    expect(screen.queryByRole('heading', { name: 'Merged, not yet released' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Pull requests timeline' })
    ).toHaveAttribute('href', '/pull-room?repo=jeryu%2Fjeryu-deploy');
    // The scope is a real select that always offers the current repository.
    expect(screen.getByLabelText('Repository or family')).toHaveValue('repo:jeryu/jeryu-deploy');
    // Environments with nothing live fold away; production is the only row shown.
    const other = screen.getByTestId('releases-other-environments');
    expect(other).not.toHaveAttribute('open');
    expect(within(other).getByText(/3 other environments with nothing\s+live \(stable, canary, dev\)/)).toBeInTheDocument();
  });

  it('shows no staged banner to non-admins and never asks for attention', async () => {
    role = 'user';
    mockReleases();
    const fetchSpy = vi.mocked(globalThis.fetch);
    renderAt('/releases?repo=jeryu%2Fjeryu-deploy', '/releases', <ReleasesPage />);
    await screen.findByTestId('releases-env-production');
    expect(screen.queryByTestId('releases-staged')).toBeNull();
    expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/api/v1/attention'))).toBe(false);
    expect(screen.queryByTestId('releases-unpinned')).toBeNull();
    expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/api/v1/pins'))).toBe(false);
  });
});
