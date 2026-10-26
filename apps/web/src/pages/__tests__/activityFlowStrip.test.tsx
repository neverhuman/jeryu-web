// activityFlowStrip.test.tsx — the delivery line strip that reads its own
// report (`FlowLineStrip`), and that Activity no longer carries it.
//
// The line is Flow's: Activity used to head its histogram with the same strip,
// which said Flow's facts a second time. The strip itself still says the nine
// stations, the hold in red, the bottleneck named, and a station nothing has
// reached left blank; a reader the forge will not answer `/api/v1/flow` for is
// shown no strip at all.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlowLineStrip } from '../../components/flow/LineStrip';
import { ActivityPage } from '../activity';
import { RepositoryActivityPage } from '../RepositoryActivityPage';
import { FLOW_REPORT } from './flowTestData';
import { mockPipelineApi } from './pipelinePageHelpers';
import { errorResponse, json, renderAt, type Recorded } from './shiftPageHelpers';

/** The pipeline feed, plus a Flow answer for the strip. */
function mockWithFlow(flow: (req: Recorded) => Response | undefined): Recorded[] {
  return mockPipelineApi((req) => {
    if (req.pathname === '/api/v1/flow') return flow(req);
    if (req.pathname === '/api/v1/repos') {
      return json({
        generated_at: '2026-10-14T12:00:00Z',
        total: 1,
        repositories: [
          {
            id: { host: 'jeryu', owner: 'acme', name: 'widgets' },
            default_branch: 'main',
            description: 'A repository of the acme family',
            visibility: 'private',
            family: 'acme-split',
          },
        ],
        facets: {},
      });
    }
    return undefined;
  });
}

afterEach(() => vi.restoreAllMocks());

describe('the line strip', () => {
  it('names the stations, scoped to the family it is given', async () => {
    const calls = mockWithFlow(() => json(FLOW_REPORT));
    renderAt('/x?family=acme', '/x', <FlowLineStrip family="acme" />);

    const strip = await screen.findByTestId('flow-line-strip');
    expect(strip).toHaveTextContent('Gate holds the most waiting');
    expect(within(strip).getByTestId('flow-line-strip-station-gate')).toHaveAttribute(
      'href',
      '/flow?station=gate&family=acme'
    );
    // Held work is red, and a station nothing has reached says nothing at all.
    expect(
      within(strip).getByTestId('flow-line-strip-station-review').className
    ).toContain('line-strip__station--human');
    expect(within(strip).getByTestId('flow-line-strip-station-pin')).toHaveTextContent('—');
    expect(
      calls.filter((call) => call.pathname === '/api/v1/flow')[0].search
    ).toContain('family=acme');
  });

  it('shows unexpected failures and lets the reader retry', async () => {
    let unavailable = true;
    mockWithFlow(() => unavailable ? errorResponse(500, 'temporary failure') : json(FLOW_REPORT));
    renderAt('/x', '/x', <FlowLineStrip />);
    expect(await screen.findByText('Could not load the delivery line.')).toBeInTheDocument();
    unavailable = false;
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByTestId('flow-line-strip')).toBeInTheDocument();
    expect(screen.queryByText('Could not load the delivery line.')).not.toBeInTheDocument();
  });

  it('leaves itself out for a reader who may not read the line', async () => {
    mockWithFlow(() => errorResponse(403, 'admin only'));
    renderAt('/x', '/x', <FlowLineStrip />);
    await waitFor(() => expect(screen.queryByTestId('flow-line-strip')).toBeNull());
  });

  it('is not on Activity, neither its page nor a repository tab nor the wall', async () => {
    const calls = mockWithFlow(() => json(FLOW_REPORT));
    for (const path of ['/activity?family=acme', '/activity?wall=1']) {
      renderAt(path, '/activity', <ActivityPage />);
      await screen.findByTestId('activity-page');
      expect(screen.queryByTestId('flow-line-strip')).toBeNull();
      cleanup();
    }
    renderAt(
      '/repos/jeryu/acme/widgets/activity',
      '/repos/jeryu/:owner/:name/activity',
      <RepositoryActivityPage fullName="acme/widgets" />
    );
    await screen.findByTestId('activity-page');
    expect(screen.queryByTestId('flow-line-strip')).toBeNull();
    expect(calls.some((call) => call.pathname === '/api/v1/flow')).toBe(false);
  });
});
