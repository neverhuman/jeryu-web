// useViewState.test.tsx — the push/replace rule the pages share (README §6):
// a parameter equal to the default leaves the URL, unrelated parameters are
// left alone, and `replace` writes do not pile up history entries.

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { useViewState } from '../useViewState';

function Probe(): JSX.Element {
  const view = useViewState();
  return (
    <div>
      <output data-testid="tab">{view.read('tab', 'deliverables')}</output>
      <output data-testid="kinds">{view.readList('kind').join('|')}</output>
      <button type="button" onClick={() => view.write({ q: 'acme' }, 'replace')}>
        type
      </button>
      <button type="button" onClick={() => view.write({ q: '' }, 'replace')}>
        clear
      </button>
      <button type="button" onClick={() => view.write({ kind: ['repo', 'tool'] }, 'replace')}>
        toggle
      </button>
      <button type="button" onClick={() => view.write({ tab: 'notes' }, 'push')}>
        switch
      </button>
    </div>
  );
}

function open(path: string): ReturnType<typeof createMemoryRouter> {
  const router = createMemoryRouter([{ path: '/board', element: <Probe /> }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('useViewState', () => {
  it('reads defaults, lists and the parameters a URL names', () => {
    open('/board?kind=repo,tool');
    expect(screen.getByTestId('tab')).toHaveTextContent('deliverables');
    expect(screen.getByTestId('kinds')).toHaveTextContent('repo|tool');
  });

  it('writes beside the parameters it does not name, and drops empty ones', async () => {
    const user = userEvent.setup();
    const router = open('/board?family=acme');
    await user.click(screen.getByText('type'));
    expect(router.state.location.search).toBe('?family=acme&q=acme');
    await user.click(screen.getByText('toggle'));
    expect(router.state.location.search).toBe('?family=acme&q=acme&kind=repo%2Ctool');
    await user.click(screen.getByText('clear'));
    expect(router.state.location.search).toBe('?family=acme&kind=repo%2Ctool');
  });

  it('replaces for filters and pushes for a view switch', async () => {
    const user = userEvent.setup();
    const router = open('/board');
    await user.click(screen.getByText('type'));
    await user.click(screen.getByText('toggle'));
    // Three replaces, still one entry: Back leaves the page.
    expect(router.state.location.search).toBe('?q=acme&kind=repo%2Ctool');

    await user.click(screen.getByText('switch'));
    expect(screen.getByTestId('tab')).toHaveTextContent('notes');
    await act(async () => { await router.navigate(-1); });
    expect(screen.getByTestId('tab')).toHaveTextContent('deliverables');
    expect(router.state.location.search).toBe('?q=acme&kind=repo%2Ctool');
  });
});
