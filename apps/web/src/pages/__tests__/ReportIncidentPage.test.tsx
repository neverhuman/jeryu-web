// ReportIncidentPage.test.tsx — the Report incident form on a mocked
// `POST /api/v1/incidents`: the request it sends, the one field it insists on,
// a retry that names the same incident, and what a refused or older server shows.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReportIncidentPage } from '../incidents/ReportIncidentPage';
import { errorResponse, json, recordHeaders, renderAt, type Override, type Recorded } from './shiftPageHelpers';

afterEach(() => vi.restoreAllMocks());

function mockIncidentsApi(override?: Override): Recorded[] {
  const calls: Recorded[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, 'http://localhost');
    const req: Recorded = {
      method: init?.method ?? 'GET',
      pathname: url.pathname,
      search: url.search,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: recordHeaders(init?.headers),
    };
    calls.push(req);
    const custom = override?.(req);
    if (custom) return custom;
    if (url.pathname === '/api/v1/incidents' && req.method === 'POST') {
      const id = (req.body as { incident_id: string }).incident_id;
      return json({ schema_version: '1', ok: true, incident_id: id, seqs: [1, 2] }, 201);
    }
    return errorResponse(404, `unmocked ${url.pathname}`);
  });
  return calls;
}

const posts = (calls: Recorded[]): Recorded[] => calls.filter((call) => call.method === 'POST');

function fill(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('ReportIncidentPage', () => {
  it('insists on a summary and sends nothing without one', async () => {
    const calls = mockIncidentsApi();
    renderAt('/report-incident', '/report-incident', <ReportIncidentPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Report incident' }));
    expect(await screen.findByText('Say in one line what is wrong.')).toBeInTheDocument();
    expect(posts(calls)).toHaveLength(0);
  });

  it('posts what was typed and says which incident it filed', async () => {
    const calls = mockIncidentsApi();
    renderAt('/report-incident', '/report-incident', <ReportIncidentPage />);
    fill('Summary *', 'Checkout returns 500');
    fill('Service', 'checkout');
    fill('Severity', 'high');
    fill('Changes that caused it', 'lot-1\nlot-2');
    fireEvent.click(screen.getByRole('button', { name: 'Report incident' }));

    const done = await screen.findByTestId('report-incident-done');
    const [post] = posts(calls);
    expect(post?.pathname).toBe('/api/v1/incidents');
    expect(post?.body).toMatchObject({
      summary: 'Checkout returns 500',
      service: 'checkout',
      severity: 'high',
      changes: ['lot-1', 'lot-2'],
    });
    const sent = (post?.body as { incident_id: string }).incident_id;
    expect(done).toHaveTextContent(sent);
  });

  it('names the same incident when a failed report is sent again', async () => {
    let attempt = 0;
    const calls = mockIncidentsApi((req) => {
      if (req.method !== 'POST') return undefined;
      attempt += 1;
      return attempt === 1 ? errorResponse(500, 'store busy') : undefined;
    });
    renderAt('/report-incident', '/report-incident', <ReportIncidentPage />);
    fill('Summary *', 'Checkout returns 500');
    fireEvent.click(screen.getByRole('button', { name: 'Report incident' }));
    expect(await screen.findByTestId('report-incident-error')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Report incident' }));
    await screen.findByTestId('report-incident-done');
    const ids = posts(calls).map((call) => (call.body as { incident_id: string }).incident_id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it('says plainly when the account may not report, or the server cannot take it', async () => {
    mockIncidentsApi(() => errorResponse(403, 'events_reporter_required'));
    renderAt('/report-incident', '/report-incident', <ReportIncidentPage />);
    fill('Summary *', 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Report incident' }));
    expect(await screen.findByText('You are not allowed to report incidents.')).toBeInTheDocument();
  });

  it('shows a server without the route as not available', async () => {
    mockIncidentsApi(() => errorResponse(404, 'nope'));
    renderAt('/report-incident', '/report-incident', <ReportIncidentPage />);
    fill('Summary *', 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Report incident' }));
    await waitFor(() =>
      expect(screen.getByText('Not available on this server version.')).toBeInTheDocument(),
    );
  });
});
