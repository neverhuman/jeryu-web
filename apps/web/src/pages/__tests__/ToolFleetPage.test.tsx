// ToolFleetPage.test.tsx — Shared tools → Adoption keeps its filters and its
// sort in the URL (the contract in README §6), so a filtered, sorted table is
// a link and Back leaves the page instead of retracing the filter box.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { ToolFleetResponse } from '../../api/types';
import { ADOPTION_PATH } from '../sharedTools/SharedToolsTabs';
import { ToolFleetPage } from '../ToolFleetPage';

const FLEET: ToolFleetResponse = {
  repos_scored: 3,
  tools: [
    {
      tool: 'secret-scan',
      category: 'security',
      adopting_repos: ['acme/ledger', 'acme/portal'],
      applicable_missing_repos: [],
    },
    {
      tool: 'bundle-budget',
      category: 'build',
      adopting_repos: [],
      applicable_missing_repos: ['globex/web'],
    },
  ],
};

function open(path: string): ReturnType<typeof createMemoryRouter> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['fleet', 'tool-adoption'], FLEET);
  const router = createMemoryRouter([{ path: ADOPTION_PATH, element: <ToolFleetPage /> }], {
    initialEntries: [path],
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
}

/** The tool names in the order the table lists them. */
function toolOrder(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.getAttribute('data-testid')?.replace('tool-row-', '') ?? '');
}

describe('ToolFleetPage URL view state', () => {
  it('round-trips the filters and the sort through the URL', async () => {
    const user = userEvent.setup();
    const router = open(ADOPTION_PATH);
    expect(toolOrder()).toEqual(['bundle-budget', 'secret-scan']);

    await user.type(screen.getByTestId('tool-fleet-search'), 'acme');
    await user.selectOptions(screen.getByTestId('tool-fleet-category'), 'security');
    await user.selectOptions(screen.getByTestId('tool-fleet-status'), 'complete');
    await user.click(screen.getByTestId('tool-fleet-sort-adopted'));

    const search = router.state.location.search;
    expect(Object.fromEntries(new URLSearchParams(search))).toEqual({
      q: 'acme',
      category: 'security',
      status: 'complete',
      sort: 'adopted',
      dir: 'desc',
    });
    // Filters and sort replace, so the whole run of them is one entry.
    await act(async () => { await router.navigate(-1); });
    expect(router.state.location.search).toBe(search);

    cleanup();
    open(`${ADOPTION_PATH}${search}`);
    expect(screen.getByTestId('tool-fleet-search')).toHaveValue('acme');
    expect(screen.getByTestId('tool-fleet-category')).toHaveValue('security');
    expect(screen.getByTestId('tool-fleet-status')).toHaveValue('complete');
    expect(toolOrder()).toEqual(['secret-scan']);
    expect(screen.getByTestId('tool-fleet-sort-adopted').closest('th')).toHaveAttribute(
      'aria-sort',
      'descending'
    );
  });

  it('sorts from a shared link, and a second press turns the column round', async () => {
    const user = userEvent.setup();
    const router = open(`${ADOPTION_PATH}?sort=adopted&dir=asc`);
    expect(toolOrder()).toEqual(['bundle-budget', 'secret-scan']);

    await user.click(screen.getByTestId('tool-fleet-sort-adopted'));
    expect(new URLSearchParams(router.state.location.search).get('dir')).toBe('desc');
    expect(toolOrder()).toEqual(['secret-scan', 'bundle-budget']);

    // The default column and direction leave the URL rather than spelling
    // themselves out: `/shared-tools/adoption` is the default view.
    await user.click(screen.getByTestId('tool-fleet-sort-tool'));
    expect(router.state.location.search).toBe('');
  });
});
