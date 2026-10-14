// activityFlowStrip.test.tsx — the delivery line strip above the Activity
// histogram: where the work is, over when it happened.
//
// It is the same strip the Flow page heads Live mode with, so it says the same
// things here: the nine stations, the hold in red, the bottleneck named, and a
// station nothing has reached left blank. A reader the forge will not answer
// `/api/v1/flow` for is shown no strip at all, and the wall has none.

import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('Activity line strip', () => {
  it('heads the page with the line, scoped to the family in the address', async () => {
    const calls = mockWithFlow(() => json(FLOW_REPORT));
    renderAt('/activity?family=acme', '/activity', <ActivityPage />);

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
    // The strip is above the volume band: where the work is, then when it was.
    const page = screen.getByTestId('activity-page');
    const order = Array.from(page.querySelectorAll('[data-testid]')).map((node) =>
      node.getAttribute('data-testid')
    );
    expect(order.indexOf('flow-line-strip')).toBeLessThan(order.indexOf('activity-volume'));
    expect(
      calls.filter((call) => call.pathname === '/api/v1/flow')[0].search
    ).toContain('family=acme');
  });

  it('asks for the family of the repository whose tab it is on', async () => {
    const calls = mockWithFlow(() => json(FLOW_REPORT));
    renderAt(
      '/repos/jeryu/acme/widgets/activity',
      '/repos/jeryu/:owner/:name/activity',
      <RepositoryActivityPage fullName="acme/widgets" />
    );
    await screen.findByTestId('flow-line-strip');
    // The feed is one repository's; the line it moves on is its family's.
    await waitFor(() =>
      expect(calls.filter((call) => call.pathname === '/api/v1/flow').at(-1)?.search).toContain(
        'family=acme-split'
      )
    );
  });

  it('leaves itself out for a reader who may not read the line', async () => {
    mockWithFlow(() => errorResponse(403, 'admin only'));
    renderAt('/activity', '/activity', <ActivityPage />);
    await screen.findByTestId('activity-page');
    await waitFor(() => expect(screen.queryByTestId('flow-line-strip')).toBeNull());
  });

  it('is not on the wall: that screen is the feed itself', async () => {
    mockWithFlow(() => json(FLOW_REPORT));
    renderAt('/activity?wall=1', '/activity', <ActivityPage />);
    await screen.findByTestId('activity-page');
    await waitFor(() => expect(screen.queryByTestId('flow-line-strip')).toBeNull());
  });
});
