// ToolFleetToolPage.test.tsx — one tool's adoption page: the repos that should
// adopt it come first, grouped by family, and an admin files their work from
// there with one todo per repo.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolFleetResponse } from '../../api/types';
import { ToolFleetToolPage } from '../ToolFleetToolPage';
import { FAMILIES } from './shiftTestData';
import { json, renderAt, type Recorded } from './shiftPageHelpers';

let role: 'admin' | 'user' = 'admin';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role } }),
}));

const FLEET: ToolFleetResponse = {
  repos_scored: 2,
  tools: [
    {
      tool: 'secret-scan',
      category: 'security',
      adopting_repos: ['jeryu/jeryu-deploy'],
      applicable_missing_repos: ['jeryu/jeryu-web', 'zz/outsider'],
    },
  ],
};

/** Serve the adoption payload and the shift families; record every request. */
function mockPage(): Recorded[] {
  const calls: Recorded[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    calls.push({
      method: init?.method ?? 'GET',
      pathname: url.pathname,
      search: url.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (url.pathname === '/api/v1/fleet/tool-adoption') return json(FLEET);
    if (url.pathname === '/api/v1/shift/families') return json(FAMILIES);
    if (url.pathname === '/api/v1/shift/todos') return json({ id: 't-1', family: 'jeryu' });
    return json({ error: { code: 'x', message: `unmocked ${url.pathname}` } }, 404);
  });
  return calls;
}

function renderTool(): void {
  renderAt(
    '/shared-tools/adoption/secret-scan',
    '/shared-tools/adoption/:tool',
    <ToolFleetToolPage />
  );
}

describe('ToolFleetToolPage', () => {
  beforeEach(() => {
    role = 'admin';
  });
  afterEach(() => vi.restoreAllMocks());

  it('puts "Should adopt" first and groups both lists by family', async () => {
    mockPage();
    renderTool();

    await screen.findByTestId('tool-fleet-missing');
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Should adopt (2)',
      'Adopting (1)',
    ]);
    const missing = screen.getByTestId('tool-fleet-missing');
    expect(within(missing).getByTestId('tool-fleet-family-jeryu')).toHaveTextContent(
      'jeryu/jeryu-web'
    );
    // A repo no queue owns is still listed, under its own group.
    expect(within(missing).getByTestId('tool-fleet-family-other')).toHaveTextContent(
      'zz/outsider'
    );
    expect(
      within(screen.getByTestId('tool-fleet-adopting')).getByTestId('tool-fleet-family-jeryu')
    ).toHaveTextContent('jeryu/jeryu-deploy');
  });

  it('files one todo per repo of a family, scoped to that repo', async () => {
    const calls = mockPage();
    renderTool();

    const button = await screen.findByTestId('tool-fleet-file-jeryu');
    expect(button).toHaveTextContent('File 1 todo');
    fireEvent.click(button);

    await screen.findByText('Filed 1 todo');
    const filed = calls.filter((call) => call.method === 'POST');
    expect(filed).toHaveLength(1);
    expect(filed[0]?.body).toMatchObject({
      family: 'jeryu',
      mode: 'night',
      repos: ['jeryu-web'],
    });
    expect(String((filed[0]?.body as { text: string }).text)).toContain(
      'Adopt secret-scan in jeryu/jeryu-web'
    );
  });

  it('offers no filing to a non-admin, and none for repos no queue owns', async () => {
    role = 'user';
    mockPage();
    renderTool();

    await screen.findByTestId('tool-fleet-missing');
    expect(screen.queryByTestId('tool-fleet-file-jeryu')).not.toBeInTheDocument();

    role = 'admin';
    vi.restoreAllMocks();
    mockPage();
    renderTool();
    await waitFor(() => expect(screen.queryAllByTestId('tool-fleet-file-other')).toHaveLength(0));
  });
});
