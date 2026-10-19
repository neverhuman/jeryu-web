import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { PullRequestChecks } from '../../../api/types';
import { ChecksPanel, checkPageUrl, isReadablePageUrl } from '../ChecksPanel';

const checks = {
  passing: 1,
  failing: 2,
  pending: 0,
  skipped: 0,
  checks: [
    { id: 1, name: 'ci/build', status: 'success', required: true },
    {
      id: 2,
      name: 'jankurai/proof',
      kind: 'check_run',
      status: 'failure',
      title: 'score 42 / 85',
      description: 'score 72 below threshold 85',
      // The forge sent a raw API route; the server sends the page to read.
      details_url: 'http://forge.invalid/api/v1/repos/1f2e/jankurai-scores?sha=abc',
      web_url: '/quality-gate/heads/veox-ai/ai-veox-app/abc',
      required: false,
      advisory: {
        label: 'advisory - shadow mode',
        reason: 'jankurai/proof runs in shadow mode by owner decision.',
        url: '/quality-gate',
      },
    },
    {
      id: 4,
      name: 'ai-veox-app/required',
      kind: 'status',
      status: 'failure',
      description: 'gate run 812 failed: cargo clippy',
      details_url: 'https://forge.invalid/gate/runs/812',
      web_url: 'https://forge.invalid/gate/runs/812',
      required: true,
    },
    { id: 3, name: 'jeryu/autonomy', status: null },
  ],
} as unknown as PullRequestChecks;

function row(name: string): HTMLElement {
  return screen.getByTestId(`check-row-${name}`);
}

describe('ChecksPanel', () => {
  it('gives every check a visible status word, including one with no status', () => {
    render(<ChecksPanel checks={checks} />);
    expect(within(row('ci/build')).getByText('passing')).toBeTruthy();
    expect(within(row('jankurai/proof')).getByText('failing')).toBeTruthy();
    expect(within(row('jeryu/autonomy')).getByText('no status reported')).toBeTruthy();
  });

  it('says on the row which checks are required and why the others are not', () => {
    render(<ChecksPanel checks={checks} failuresBlockMerge={false} />);
    const failing = row('jankurai/proof');
    expect(within(failing).getByText('failing, advisory - shadow mode')).toBeTruthy();
    expect(within(failing).getByText('advisory - shadow mode')).toBeTruthy();
    expect(within(row('ci/build')).getByText('required to merge')).toBeTruthy();
    // A required check is not calmed into an advisory: it still reads failing.
    const gate = row('ai-veox-app/required');
    expect(within(gate).getByText('failing')).toBeTruthy();
    expect(within(gate).getByText('required to merge')).toBeTruthy();
  });

  it('expands a check in place to its title, summary and the page behind it', async () => {
    const user = userEvent.setup();
    render(<ChecksPanel checks={checks} failuresBlockMerge={false} />);
    const failing = row('jankurai/proof');
    const toggle = within(failing).getByRole('button', { expanded: false });

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(failing).getByText('score 42 / 85')).toBeTruthy();
    expect(within(failing).getByText('score 72 below threshold 85')).toBeTruthy();
    expect(within(failing).getByText(/shadow mode by owner decision/)).toBeTruthy();
    // The human page, never the `/api/` route the forge reported.
    expect(
      within(failing).getByRole('link', { name: /Open the jankurai\/proof report/ })
    ).toHaveAttribute('href', '/quality-gate/heads/veox-ai/ai-veox-app/abc');
    expect(failing.querySelector('a[href^="http://"]')).toBeNull();
  });

  it('expands a commit status to its description and gate run log', async () => {
    const user = userEvent.setup();
    render(<ChecksPanel checks={checks} />);
    const gate = row('ai-veox-app/required');

    await user.click(within(gate).getByRole('button', { expanded: false }));

    expect(within(gate).getByText('gate run 812 failed: cargo clippy')).toBeTruthy();
    expect(
      within(gate).getByRole('link', { name: /Open the ai-veox-app\/required run log/ })
    ).toHaveAttribute('href', 'https://forge.invalid/gate/runs/812');
  });

  it('rejects an /api/ or plain-http details URL as the page to open', () => {
    expect(isReadablePageUrl('https://forge.invalid/api/v1/repos/1f2e/scores')).toBe(false);
    expect(isReadablePageUrl('/api/v1/repos/1f2e/jankurai-scores?sha=abc')).toBe(false);
    expect(isReadablePageUrl('http://forge.invalid/quality-gate')).toBe(false);
    expect(isReadablePageUrl('https://forge.invalid/quality-gate')).toBe(true);
    expect(isReadablePageUrl('/quality-gate/heads/a/b/abc')).toBe(true);

    expect(
      checkPageUrl({
        details_url: 'http://forge.invalid/api/v1/repos/1f2e/scores?sha=abc',
      } as never)
    ).toBeNull();
    expect(checkPageUrl({ details_url: 'https://forge.invalid/gate/runs/812' } as never)).toBe(
      'https://forge.invalid/gate/runs/812'
    );
  });
});

describe('ChecksPanel identifiers', () => {
  const ID = '428377c2-6190-4a50-b306-d52d4a2f1c33';
  const byId = {
    passing: 0,
    failing: 0,
    pending: 1,
    skipped: 0,
    checks: [
      {
        id: 9,
        name: `Attempt ${ID}`,
        status: 'pending',
        description: `queued for run ${ID}`,
        details_url: 'https://forge.example/runs/428377c2',
      },
    ],
  } as unknown as PullRequestChecks;

  it('shows a short label and keeps the whole id in the title and the link', async () => {
    const user = userEvent.setup();
    render(<ChecksPanel checks={byId} />);
    const name = screen.getByText('Attempt 428377c2', {
      exact: false,
      selector: '.checks-panel__name',
    });
    expect(name.getAttribute('title')).toBe(`Attempt ${ID}`);

    await user.click(screen.getByRole('button', { expanded: false }));

    expect(
      screen.getByText('queued for run 428377c2').getAttribute('title')
    ).toBe(`queued for run ${ID}`);
    // The link is the one place the whole id is spelled out.
    const link = screen.getByRole('link', { name: `Open the Attempt ${ID} report` });
    expect(screen.getAllByText(ID, { exact: false })).toEqual([link]);
  });
});

describe('a pending check', () => {
  const pendingChecks = (running: unknown): PullRequestChecks =>
    ({
      total: 1,
      passing: 0,
      failing: 0,
      pending: 1,
      skipped: 0,
      server_time: '2026-10-06T12:05:00Z',
      checks: [
        {
          id: 'gate',
          name: 'widgets/required',
          kind: 'status',
          status: 'pending',
          required: true,
          started_at: '2026-10-06T12:00:30Z',
          completed_at: null,
          running,
        },
      ],
    }) as unknown as PullRequestChecks;

  it('shows the gate runner\'s progress against the usual time', () => {
    render(
      <ChecksPanel
        checks={pendingChecks({
          recipe: 'just required',
          started_at: '2026-10-06T12:00:00Z',
          typical_seconds: 600,
          slow_seconds: 900,
          samples: 8,
        })}
        receivedAtMs={Date.now()}
      />
    );
    const progress = screen.getByTestId('check-progress-widgets/required');
    expect(progress.getAttribute('data-phase')).toBe('on-track');
    expect(within(progress).getByText('about 5m left')).toBeTruthy();
  });

  it('shows elapsed time from its pending post when no runner reports it', () => {
    render(<ChecksPanel checks={pendingChecks(undefined)} receivedAtMs={Date.now()} />);
    const progress = screen.getByTestId('check-progress-widgets/required');
    expect(progress.getAttribute('data-phase')).toBe('measuring');
    expect(within(progress).getByText('4m 30s so far')).toBeTruthy();
  });
});

describe('ChecksPanel expected rows', () => {
  const expectedOnly = {
    total: 0,
    expected: 1,
    passing: 0,
    failing: 0,
    pending: 0,
    skipped: 0,
    checks: [
      {
        id: 'expected:ai-veox-app/required',
        name: 'ai-veox-app/required',
        kind: 'expected',
        status: 'expected-not-reported',
        state: 'expected-not-reported',
        source: 'required_by_protection',
        required: true,
        title: 'Expected - waiting for a status to be reported',
        description:
          'The protection rule of `main` requires `ai-veox-app/required`, and nothing has reported it on this head yet.',
        waiting_seconds: 930,
        claim: {
          state: 'attempted',
          recipe: 'just required',
          at: '2026-10-12T17:58:54Z',
          conclusion: 'error',
          runner_online: true,
          runner_id: 'build-1/slot1',
          runner_url: '/runners?runners=build-1%2Fslot1',
          reporter: 'gatebot',
        },
      },
    ],
  } as unknown as PullRequestChecks;

  it('lists a required check nobody reported, with the wait and the runner', async () => {
    render(<ChecksPanel checks={expectedOnly} />);
    const required = row('ai-veox-app/required');
    expect(within(required).getByText('Expected - not reported yet')).toBeTruthy();
    expect(within(required).getByText('required to merge')).toBeTruthy();
    expect(screen.getByText('1 expected')).toBeTruthy();
    const expectation = screen.getByTestId('check-expectation-ai-veox-app/required');
    expect(expectation.textContent).toContain('waited 15m 30s');
    expect(expectation.textContent).toContain('build-1/slot1');
    expect(expectation.textContent).toContain('posted no status');
    expect(
      within(expectation)
        .getByRole('link', { name: /Open the runner/ })
        .getAttribute('href')
    ).toBe('/runners?runners=build-1%2Fslot1');

    await userEvent.click(within(required).getByRole('button'));
    expect(
      within(required).getByTestId('check-source-ai-veox-app/required').textContent
    ).toBe('Source: required by branch protection');
  });

  it('says so when no runner reports anything on the head', () => {
    const noClaim = {
      ...expectedOnly,
      checks: [{ ...expectedOnly.checks[0], claim: null }],
    } as unknown as PullRequestChecks;
    render(<ChecksPanel checks={noClaim} />);
    expect(
      screen.getByTestId('check-expectation-ai-veox-app/required').textContent
    ).toContain('No runner reports a gate pass on this head');
  });

  it('links the runner only when the forge sent a readable page', () => {
    for (const runner_url of ['/api/v1/runners/build-1', 'http://forge.invalid/runners', 'javascript:alert(1)']) {
      const unreadable = {
        ...expectedOnly,
        checks: [
          { ...expectedOnly.checks[0], claim: { ...expectedOnly.checks[0].claim, runner_url } },
        ],
      } as unknown as PullRequestChecks;
      const { unmount } = render(<ChecksPanel checks={unreadable} />);
      const expectation = screen.getByTestId('check-expectation-ai-veox-app/required');
      expect(within(expectation).queryByRole('link'), runner_url).toBeNull();
      expect(expectation.textContent).toContain('build-1/slot1');
      unmount();
    }
  });

  it('claims nothing about requirements when the forge sends no expectations', () => {
    const empty = { passing: 0, failing: 0, pending: 0, skipped: 0, checks: [] };
    const { unmount } = render(
      <ChecksPanel checks={empty as unknown as PullRequestChecks} />
    );
    expect(screen.getByTestId('checks-empty').textContent).toBe(
      'No checks have run on this head.'
    );
    unmount();
    render(
      <ChecksPanel checks={{ ...empty, expected: 0 } as unknown as PullRequestChecks} />
    );
    expect(screen.getByTestId('checks-empty').textContent).toBe(
      'Nothing has run on this head, and nothing requires or declares a check for it.'
    );
  });

  it('names each row’s source: protection, the CI declaration, or the report alone', async () => {
    const mixed = {
      total: 2,
      expected: 1,
      passing: 1,
      failing: 1,
      pending: 0,
      skipped: 0,
      checks: [
        expectedOnly.checks[0],
        {
          id: '2',
          name: 'ai-veox-app/docs',
          kind: 'status',
          status: 'success',
          state: 'success',
          source: 'declared_by_ci_config',
          required: false,
        },
        {
          id: '3',
          name: 'coverage/report',
          kind: 'status',
          status: 'failure',
          state: 'failure',
          source: 'reported_only',
          required: false,
        },
      ],
    } as unknown as PullRequestChecks;
    render(<ChecksPanel checks={mixed} />);
    for (const [name, words] of [
      ['ai-veox-app/required', 'Source: required by branch protection'],
      ['ai-veox-app/docs', 'Source: declared by .jeryu/ci.toml'],
      ['coverage/report', 'Source: reported only'],
    ] as const) {
      await userEvent.click(within(row(name)).getByRole('button'));
      expect(within(row(name)).getByTestId(`check-source-${name}`).textContent).toBe(
        words
      );
    }
    // A reported context nothing requires is still listed, as optional.
    expect(within(row('coverage/report')).getByText('not required to merge')).toBeTruthy();
  });

  it('keeps one row as a claimed check moves from expected to pending to success', () => {
    const { rerender } = render(<ChecksPanel checks={expectedOnly} />);
    expect(within(row('ai-veox-app/required')).getByText('Expected - not reported yet')).toBeTruthy();
    const posted = (state: string): PullRequestChecks =>
      ({
        total: 1,
        expected: 0,
        passing: state === 'success' ? 1 : 0,
        failing: 0,
        pending: state === 'pending' ? 1 : 0,
        skipped: 0,
        checks: [
          {
            id: '9',
            name: 'ai-veox-app/required',
            kind: 'status',
            status: state,
            state,
            source: 'required_by_protection',
            required: true,
          },
        ],
      }) as unknown as PullRequestChecks;
    for (const [state, word] of [
      ['pending', 'pending'],
      ['success', 'passing'],
    ] as const) {
      rerender(<ChecksPanel checks={posted(state)} />);
      expect(screen.getAllByTestId(/^check-row-ai-veox-app\/required$/)).toHaveLength(1);
      expect(within(row('ai-veox-app/required')).getByText(word)).toBeTruthy();
      expect(screen.queryByTestId('check-expectation-ai-veox-app/required')).toBeNull();
    }
  });
});
