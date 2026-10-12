// QualityGateLatestHeadPage.test.tsx — a repository's score badge opens the
// head that score belongs to: the newest score of the branch, not the gate's
// overview, and an honest empty page when nothing has been scored.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QualityGateLatestHeadPage } from '../qualityGate/QualityGateLatestHeadPage';
import { mockQualityGateApi } from './qualityGateHelpers';
import { json } from './shiftPageHelpers';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'operator', role: 'admin' } }),
}));

const NEWEST = 'c0ffee0000000000000000000000000000000001';
const OLDER = 'c0ffee0000000000000000000000000000000002';

function score(sha: string, createdAt: string, branch = 'trunk'): Record<string, unknown> {
  return {
    branch,
    commit_sha: sha,
    score: 91,
    hard_findings: 0,
    decision: 'pass',
    caps_applied: [],
    created_at: createdAt,
  };
}

function ScoredHeadPage(): JSX.Element {
  return <p data-testid="scored-head">{useLocation().pathname}</p>;
}

function renderLatest(path: string): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/quality-gate/heads/:owner/:name" element={<QualityGateLatestHeadPage />} />
          <Route path="/quality-gate/heads/:owner/:name/:sha" element={<ScoredHeadPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('QualityGateLatestHeadPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens the newest scored head of the branch the badge showed', async () => {
    const calls = mockQualityGateApi((req) =>
      req.pathname === '/api/v1/repos/repo-uuid-7/jankurai-scores'
        ? json({
            scores: [
              score(OLDER, '2026-10-11T10:00:00Z'),
              score('c0ffee0000000000000000000000000000000009', '2026-10-12T11:00:00Z', 'release'),
              score(NEWEST, '2026-10-12T10:00:00Z'),
            ],
          })
        : undefined
    );
    renderLatest('/quality-gate/heads/acme/widgets?branch=trunk&repo=repo-uuid-7');

    expect(await screen.findByTestId('scored-head')).toHaveTextContent(
      `/quality-gate/heads/acme/widgets/${NEWEST}`
    );
    expect(calls[0].search).toBe('?branch=trunk');
  });

  it('says nothing has been scored instead of opening some other repository', async () => {
    mockQualityGateApi((req) =>
      req.pathname.endsWith('/jankurai-scores') ? json({ scores: [] }) : undefined
    );
    renderLatest('/quality-gate/heads/acme/widgets?branch=trunk&repo=repo-uuid-7');

    expect(await screen.findByText('No score recorded for trunk yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All scores' })).toHaveAttribute('href', '/quality-gate');
    expect(screen.queryByTestId('scored-head')).toBeNull();
  });

  it('reads nothing when the link carries no repository id', async () => {
    const calls = mockQualityGateApi(() => undefined);
    renderLatest('/quality-gate/heads/acme/widgets?branch=trunk');

    expect(
      await screen.findByText('This link does not say which repository and branch to read.')
    ).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
