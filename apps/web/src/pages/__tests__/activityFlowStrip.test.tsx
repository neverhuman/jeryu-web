// activityFlowStrip.test.tsx — Activity does not carry the delivery line.
//
// The line is Flow's: Activity used to head its histogram with a strip of the
// stations, which said Flow's facts a second time. Neither the page, a
// repository's tab nor the wall draws it or reads `/api/v1/flow`.

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import { RepositoryActivityPage } from '../RepositoryActivityPage';
import { FLOW_REPORT } from './flowTestData';
import { mockPipelineApi } from './pipelinePageHelpers';
import { json, renderAt, type Recorded } from './shiftPageHelpers';

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

describe('the delivery line', () => {
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
