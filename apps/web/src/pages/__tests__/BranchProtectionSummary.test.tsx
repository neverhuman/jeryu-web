import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BranchProtectionSummary } from '../BranchProtectionSummary';

function renderPanel(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BranchProtectionSummary owner="jeryu" repo="jeryu-web" branch="main" />
    </QueryClientProvider>
  );
}

function answer(status: number, body: unknown): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    expect(url).toContain('/api/v3/repos/jeryu/jeryu-web/branches/main/protection');
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('BranchProtectionSummary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says in sentences what protects the branch, the rules that are on first', async () => {
    answer(200, {
      enforce_admins: { enabled: true },
      required_linear_history: { enabled: true },
      required_pull_request_reviews: { required_approving_review_count: 1 },
      required_status_checks: { contexts: ['jeryu-web/required'], strict: true },
    });
    renderPanel();
    expect(await screen.findByText('main is protected by 6 rules.')).toBeInTheDocument();
    expect(
      screen.getByText(/merges only when jeryu-web\/required is green on a head that is up to date/)
    ).toBeInTheDocument();
    expect(screen.getByText('1 approving review required.')).toBeInTheDocument();
    expect(screen.getByText('The rules bind admins too.')).toBeInTheDocument();
  });

  it('treats a 404 as an unprotected branch, not as an error', async () => {
    answer(404, { code: 'not_found', message: 'branch protection jeryu/jeryu-web:main' });
    renderPanel();
    expect(
      await screen.findByText('main is not protected: anyone with write access can push to it.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Could not load/)).toBeNull();
  });
});
