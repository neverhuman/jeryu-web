// MergeGate.test.tsx — the Merge button when the merge cannot happen.
//
// An operator who sees no button and no sentence has to guess whether the
// page forgot the control or the forge forbade it. So per blocker code the
// box owes the reader three things: the Merge button present, the button
// disabled, and one line saying what is happening and where to act. A
// pending required check owes a fourth: the run's own progress, so the wait
// has a length.

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { MergeBox, type MergeBoxProps } from '../MergeBox';
import {
  approvalRow,
  pullChecks,
  pullDetail,
} from '../../../test/fixtures/pullRequest';
import type {
  PullRequestCheck,
  PullRequestChecks,
  PullRequestDetail,
} from '../../../api/types';

const HREFS = {
  threads: '/pulls/32#pr-threads',
  conversation: '/pulls/32',
  checks: '/pulls/32/checks',
  commits: '/pulls/32/commits',
};

const REQUIRED = 'acme/required';

function show(
  detail: PullRequestDetail,
  checks: PullRequestChecks | null = null
): void {
  render(
    <MemoryRouter>
      <MergeBox
        detail={detail}
        checks={checks}
        checksReceivedAtMs={Date.now()}
        hrefs={HREFS}
        viewer={{ login: '@red-team', permissions: ['pr.write'] }}
        viewerLogin="@red-team"
        onApprove={vi.fn()}
        onMerge={vi.fn()}
        onSetState={vi.fn()}
      />
    </MemoryRouter>
  );
}

/** The Merge button: present and not pressable, whatever the blocker. */
function expectDisabledMerge(): HTMLElement {
  const button = screen.getByRole('button', { name: 'Merge' });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-disabled', 'true');
  return button;
}

/** A head whose only blocker is `code`, with the message the forge sends. */
function blockedBy(
  code: string,
  message: string,
  details: string | null = null,
  over: Parameters<typeof pullDetail>[0] = {}
): PullRequestDetail {
  return pullDetail({
    approvals: 1,
    required_approvals: 1,
    blockers: [{ code, message, details }],
    ...over,
  });
}

/**
 * The checks of a head with one required context in the given state. The
 * forge's clock comes with them, so elapsed time is measured on it (the
 * fixture's run started at 13:48 and the forge answered at 13:52).
 */
function checksWith(over: Partial<PullRequestCheck>): PullRequestChecks {
  const base = pullChecks();
  const first = base.checks[0] as PullRequestCheck;
  return {
    ...base,
    server_time: '2026-05-26T13:52:00Z',
    checks: [{ ...first, ...over }],
  };
}

describe('the Merge button when the merge is refused', () => {
  it('waits out a pending required check, with the run’s progress beside it', () => {
    show(
      blockedBy(
        'passport_blocked_pending_checks',
        `Required context \`${REQUIRED}\` is queued or running.`,
        REQUIRED
      ),
      checksWith({
        status: 'pending',
        conclusion: null,
        completed_at: null,
        running: {
          recipe: 'required',
          started_at: '2026-05-26T13:48:00Z',
          typical_seconds: 480,
          slow_seconds: 900,
          samples: 9,
        },
      })
    );
    expectDisabledMerge();
    const reason = screen.getByTestId('pr-merge-reason-passport_blocked_pending_checks');
    expect(reason).toHaveTextContent(`Waiting for ${REQUIRED} to finish`);
    expect(reason.querySelector('a')).toHaveAttribute('href', HREFS.checks);
    // The wait has a length: four minutes in on a usual eight-minute pass.
    expect(screen.getByTestId('pr-merge-gate-progress')).toHaveTextContent(
      /about 4m left/
    );
  });

  it('says how many approvals the head still needs, and where they are counted', () => {
    show(
      blockedBy(
        'passport_blocked_approvals',
        'Required approver count not satisfied.',
        null,
        { approvals: 0, required_approvals: 2 }
      )
    );
    expectDisabledMerge();
    const reason = screen.getByTestId('pr-merge-reason-passport_blocked_approvals');
    expect(reason).toHaveTextContent('Needs 2 approving reviews on this head');
    expect(reason.querySelector('a')).toHaveAttribute('href', HREFS.commits);
  });

  it('names the reviewer who asked for changes and links to their review', () => {
    show(
      blockedBy(
        'passport_blocked_changes_requested',
        'A reviewer requested changes on the current head.',
        null,
        {
          changes_requested: 1,
          reviews: [
            approvalRow({ id: 'rev-7', author: '@mira', state: 'changes_requested' }),
          ],
        }
      )
    );
    expectDisabledMerge();
    const reason = screen.getByTestId(
      'pr-merge-reason-passport_blocked_changes_requested'
    );
    expect(reason).toHaveTextContent('Changes requested by @mira — read the review');
    expect(reason.querySelector('a')).toHaveAttribute(
      'href',
      '/pulls/32#review-rev-7'
    );
  });

  it('sends a failing required check to its own log', () => {
    show(
      blockedBy(
        'passport_blocked_checks',
        `Required context \`${REQUIRED}\` is failing.`,
        REQUIRED
      ),
      checksWith({
        status: 'failure',
        conclusion: 'failure',
        web_url: 'https://forge.example/gate/41',
      })
    );
    expectDisabledMerge();
    const reason = screen.getByTestId('pr-merge-reason-passport_blocked_checks');
    expect(reason).toHaveTextContent(`Required check ${REQUIRED} failed — open the log`);
    expect(reason.querySelector('a')).toHaveAttribute(
      'href',
      'https://forge.example/gate/41'
    );
  });

  it('asks for the branch to be updated when the base has moved on', () => {
    show(
      blockedBy(
        'passport_blocked_mergeability',
        'The authoritative forge merge gate is refusing this head.',
        'behind'
      )
    );
    expectDisabledMerge();
    expect(
      screen.getByTestId('pr-merge-reason-passport_blocked_mergeability')
    ).toHaveTextContent('Base branch moved — update the branch');
  });

  it('reads the first of several blockers loudest, and still shows them all', () => {
    show(
      pullDetail({
        blockers: [
          {
            code: 'passport_blocked_checks',
            message: `Required context \`${REQUIRED}\` is failing.`,
            details: REQUIRED,
          },
          {
            code: 'passport_blocked_threads',
            message: 'Review threads are unresolved.',
            details: null,
          },
        ],
        unresolved_threads: 2,
      })
    );
    expectDisabledMerge();
    const reasons = screen.getByTestId('pr-merge-gate').children;
    expect(reasons).toHaveLength(2);
    expect(reasons[0]?.className).toContain('merge-box__gate-reason--lead');
    expect(reasons[1]?.className).not.toContain('merge-box__gate-reason--lead');
    expect(screen.getByTestId('pr-merge-reason-passport_blocked_threads')).toHaveTextContent(
      '2 review threads still unresolved — answer and resolve them'
    );
    // Progress belongs to a lone pending gate, not to a list of blockers.
    expect(screen.queryByTestId('pr-merge-gate-progress')).toBeNull();
  });

  it('falls back to the summary’s reason when the Passport lists no blocker', () => {
    show(pullDetail({ blockers: [] }));
    expectDisabledMerge();
    expect(screen.getByTestId('pr-merge-reason-mergeable')).toHaveTextContent(
      'the Passport has not cleared this head'
    );
  });

  it('presses once the gate goes green, with no reasons left beside it', () => {
    show(
      pullDetail({
        passport: 'pass',
        approvals: 1,
        required_approvals: 1,
        reviews: [approvalRow()],
      }),
      pullChecks()
    );
    const button = screen.getByRole('button', { name: 'Merge' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByTestId('pr-merge-gate')).toBeNull();
  });
});
