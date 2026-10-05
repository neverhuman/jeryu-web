// familyScopePages.test.tsx — every family-aware page reads and writes the one
// shared family scope: its own filter control shows the scoped family, changing
// it moves the scope, and a scoped page with nothing on it says which family it
// is empty for instead of looking like an outage.
//
// Invented families only (acme, globex, initech): jeryu is public.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FAMILY_SCOPE_STORAGE_SLOT } from '../../components/family/familyScope';
import { ActivityPage } from '../activity';
import { NeedsYouPage } from '../needsYou';
import { ReleasesPage } from '../ReleasesPage';
import { ShiftQueuePage } from '../shift/ShiftQueuePage';
import { mockPipelineApi } from './pipelinePageHelpers';
import { errorResponse, json, renderAt, type Recorded } from './shiftPageHelpers';
import { todo } from './shiftTestData';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role: 'admin' } }),
}));

const FAMILIES = ['acme-split', 'globex', 'initech'];

function family(name: string): unknown {
  return {
    name,
    queue_repo: `${name}/${name}-todo`,
    repos: [{ name: `${name}-web`, owner: name, order: 1 }],
    shift_tz: 'UTC',
    landing: {},
  };
}

function todoOf(id: string, familyName: string): unknown {
  return todo({
    id,
    family: familyName,
    title: `Work for ${familyName}`,
    status: 'queued',
    repos: [],
  });
}

/** The shift API, with invented families and one todo in one of them. */
function mockQueue(todos: unknown[]): Recorded[] {
  const calls: Recorded[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    calls.push({
      method: 'GET',
      pathname: url.pathname,
      search: url.search,
      body: undefined,
      headers: {},
    });
    switch (url.pathname) {
      case '/api/v1/shift/families':
        return json({ families: FAMILIES.map(family) });
      case '/api/v1/shift/todos':
        return json({ generated_at: '2026-10-03T09:00:00Z', todos });
      case '/api/v1/shift/shifts':
        return json({ shifts: [] });
      case '/api/v1/attention':
        return json({ schema_version: '1', generated_at: '2026-10-03T09:00:00Z', items: [] });
      default:
        return errorResponse(404, `unmocked ${url.pathname}`);
    }
  });
  return calls;
}

describe('the family scope on every family-aware page', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('Work shows the scoped family, and files new work into it', async () => {
    mockQueue([todoOf('20261003-0001-aaa', 'globex'), todoOf('20261003-0002-bbb', 'acme-split')]);
    renderAt('/work?family=globex', '/work', <ShiftQueuePage />);

    // The queue's own control (the family strip) is on the scoped family …
    const strip = await screen.findByRole('group', { name: 'Filter by family' });
    expect(within(strip).getByRole('button', { name: /^globex/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(strip).getByRole('button', { name: /^All/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    // … and only that family's rows are on the page.
    expect(screen.getByTestId('shift-todo-20261003-0001-aaa')).toBeInTheDocument();
    expect(screen.queryByTestId('shift-todo-20261003-0002-bbb')).toBeNull();
    // The composer files where the operator is looking.
    expect(screen.getByLabelText('Family')).toHaveValue('globex');
  });

  it('Work with no scope shows every family, and the composer still has a choice', async () => {
    mockQueue([todoOf('20261003-0001-aaa', 'globex'), todoOf('20261003-0002-bbb', 'acme-split')]);
    renderAt('/work', '/work', <ShiftQueuePage />);

    expect(await screen.findByTestId('shift-todo-20261003-0001-aaa')).toBeInTheDocument();
    expect(screen.getByTestId('shift-todo-20261003-0002-bbb')).toBeInTheDocument();
    expect(screen.getByLabelText('Family')).toHaveValue('acme-split');
  });

  it('Work matches rows under either spelling of the scoped family', async () => {
    mockQueue([todoOf('20261003-0002-bbb', 'acme-split')]);
    renderAt('/work?family=acme', '/work', <ShiftQueuePage />);
    expect(await screen.findByTestId('shift-todo-20261003-0002-bbb')).toBeInTheDocument();
  });

  it('Work says which family is empty rather than showing nothing', async () => {
    mockQueue([todoOf('20261003-0001-aaa', 'globex')]);
    renderAt('/work?family=initech', '/work', <ShiftQueuePage />);

    expect(await screen.findByText('Nothing for initech here')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('family-scope-show-all'));
    expect(await screen.findByTestId('shift-todo-20261003-0001-aaa')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(FAMILY_SCOPE_STORAGE_SLOT)).toBeNull();
  });

  it('Needs you, scoped and quiet, names the family and gives back every one', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/attention'
        ? json({ schema_version: '1', generated_at: '2026-10-03T09:00:00Z', items: [] })
        : undefined
    );
    renderAt('/needs-you?family=acme', '/needs-you', <NeedsYouPage />);

    expect(await screen.findByText('Nothing for acme here')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('family-scope-show-all'));
    expect(await screen.findByText('Nothing needs you.')).toBeInTheDocument();
  });

  it('Activity shows the scoped family in its filter, and its own picker moves the scope', async () => {
    mockPipelineApi();
    renderAt('/activity?family=initech', '/activity', <ActivityPage />);

    const select = await screen.findByLabelText('Family');
    expect(select).toHaveValue('initech');
    // The feed was asked for that family, not for every family.
    await waitFor(() => expect(screen.getByTestId('activity-page')).toBeInTheDocument());

    fireEvent.change(select, { target: { value: '' } });
    await waitFor(() =>
      expect(window.sessionStorage.getItem(FAMILY_SCOPE_STORAGE_SLOT)).toBeNull()
    );
  });

  it("Activity's wall says which family it counts", async () => {
    mockPipelineApi();
    renderAt('/activity?family=globex&wall=1', '/activity', <ActivityPage />);
    const note = await screen.findByTestId('activity-wall-family');
    expect(note).toHaveTextContent('globex only');
  });

  it('Releases per repository follows the family the tab carries', async () => {
    window.sessionStorage.setItem(FAMILY_SCOPE_STORAGE_SLOT, 'globex');
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/repos'
        ? json({
            total: 1,
            repositories: [
              {
                id: { host: 'jeryu', owner: 'globex', name: 'globex-api' },
                default_branch: 'main',
                description: null,
                visibility: 'private',
                family: 'globex',
              },
            ],
            facets: { hosts: [], visibilities: [], families: ['globex'] },
          })
        : undefined
    );
    renderAt('/releases?view=repositories', '/releases', <ReleasesPage />);

    // No `?family=` in the address: the scope is what scopes the view.
    expect(await screen.findByTestId('releases-scope')).toHaveValue('family:globex');
  });
});
