// QualityGateHeadPage.test.tsx — one scored head: the score against the floor,
// each finding with where it is and what it read, the link into the code at
// that commit, and the admin-only dispute.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QualityGateHeadPage } from '../qualityGate/QualityGateHeadPage';
import { mockQualityGateApi } from './qualityGateHelpers';
import { errorResponse, json, renderAt } from './shiftPageHelpers';
import { HEAD } from './qualityGateTestData';

let role: 'admin' | 'user' = 'admin';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role } }),
}));

const PATH = `/quality-gate/heads/jeryu/jeryu-web/${HEAD.sha}`;
const ROUTE = '/quality-gate/heads/:owner/:name/:sha';

function renderHead(): void {
  renderAt(PATH, ROUTE, <QualityGateHeadPage />);
}

describe('QualityGateHeadPage', () => {
  beforeEach(() => {
    role = 'admin';
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the score, each finding and the line of code behind it', async () => {
    const calls = mockQualityGateApi();
    renderHead();

    const score = await screen.findByTestId('quality-gate-score');
    expect(score).toHaveTextContent('71 / 85');
    expect(score).toHaveTextContent('below the floor: the gate would have blocked this push.');

    const finding = screen.getByTestId('quality-gate-finding-f-1');
    expect(within(finding).getByText('stale-naming')).toBeInTheDocument();
    expect(
      within(finding).getByRole('link', { name: 'src/pages/ToolsPage.tsx:42' })
    ).toHaveAttribute(
      'href',
      `/repos/jeryu/jeryu/jeryu-web/blob/${HEAD.sha}/src/pages/ToolsPage.tsx#L42`
    );
    expect(within(finding).getByText('const oldToolMap = buildToolMap();')).toBeInTheDocument();

    expect(calls[0].pathname).toBe(
      `/api/v1/quality-gate/heads/jeryu/jeryu-web/${HEAD.sha}`
    );
  });

  it('lists every applied cap with what it means and how to clear it', async () => {
    mockQualityGateApi();
    renderHead();

    // The red check has no finding of its own for `thin-tests`, so the cap is
    // the only thing that explains the score: it must be on the page.
    const cap = await screen.findByTestId('quality-gate-cap-thin-tests');
    expect(within(cap).getByText('thin-tests')).toBeInTheDocument();
    expect(within(cap).getByText(/not proven by a test/)).toBeInTheDocument();
    expect(
      within(cap).getByText('Add the test that fails without the change and push.')
    ).toBeInTheDocument();
    expect(screen.getByTestId('quality-gate-cap-stale-naming')).toBeInTheDocument();
  });

  it('says so when no cap held the score down', async () => {
    mockQualityGateApi((req) =>
      req.pathname.startsWith('/api/v1/quality-gate/heads/')
        ? json({ ...HEAD, caps: [] })
        : undefined
    );
    renderHead();

    expect(await screen.findByTestId('quality-gate-no-caps')).toHaveTextContent(
      'No cap held this score down.'
    );
  });

  it('records a dispute with its reason and shows the finding as disputed', async () => {
    const calls = mockQualityGateApi((req) =>
      req.method === 'POST'
        ? json({
            finding: {
              ...HEAD.findings[0],
              disputed: true,
              dispute_reason: 'The name is current.',
              disputed_by: 'alton',
              disputed_at: '2026-09-19T17:00:00Z',
            },
          })
        : undefined
    );
    renderHead();

    const finding = await screen.findByTestId('quality-gate-finding-f-1');
    fireEvent.click(within(finding).getByRole('button', { name: 'Dispute this finding' }));
    fireEvent.change(within(finding).getByLabelText('Why is this finding wrong?'), {
      target: { value: 'The name is current.' },
    });
    fireEvent.click(within(finding).getByRole('button', { name: 'Record dispute' }));

    await waitFor(() => expect(within(finding).getByText('Disputed')).toBeInTheDocument());
    expect(finding).toHaveTextContent('Disputed by alton: The name is current.');
    const posted = calls.find((call) => call.method === 'POST');
    expect(posted?.pathname).toBe('/api/v1/quality-gate/findings/f-1/dispute');
    expect(posted?.body).toEqual({ reason: 'The name is current.' });
  });

  it('holds a dispute without a reason, and says when the server refuses one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockQualityGateApi((req) =>
      req.method === 'POST' ? errorResponse(403, 'not an admin here') : undefined
    );
    renderHead();

    const finding = await screen.findByTestId('quality-gate-finding-f-1');
    fireEvent.click(within(finding).getByRole('button', { name: 'Dispute this finding' }));
    expect(within(finding).getByRole('button', { name: 'Record dispute' })).toBeDisabled();

    fireEvent.change(within(finding).getByLabelText('Why is this finding wrong?'), {
      target: { value: 'It reads the wrong line.' },
    });
    fireEvent.click(within(finding).getByRole('button', { name: 'Record dispute' }));
    expect(
      await within(finding).findByText('Could not record the dispute.')
    ).toBeInTheDocument();
  });

  it('shows an existing dispute to everyone, and offers the action to admins only', async () => {
    role = 'user';
    mockQualityGateApi();
    renderHead();

    const settled = await screen.findByTestId('quality-gate-finding-f-2');
    expect(settled).toHaveTextContent('Disputed by alton: The link is one line above.');
    expect(screen.queryByRole('button', { name: 'Dispute this finding' })).toBeNull();
  });

  it('degrades plainly on a server without the contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse(404, 'no such route'));
    renderHead();
    expect(await screen.findByText('Not available on this server version.')).toBeInTheDocument();
  });
});
