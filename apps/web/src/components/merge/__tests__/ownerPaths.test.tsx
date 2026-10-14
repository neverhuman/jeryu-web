// ownerPaths.test.tsx — "Blocked: 3 things need doing", answered.
//
// root/jankurai-deploy#8 showed an owner a blocked merge box with no Merge
// button and no route to one. The owner panel is the answer: every blocker the
// server listed gets a row, the ones a repository admin clears are marked with
// the step that clears them, and an admin on a base whose protection leaves
// admins out is told the steps are theirs.

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { MergeBox } from '../MergeBox';
import {
  ownerPathHeadline,
  ownerPathRows,
  ownerStandingNote,
  showOwnerPaths,
} from '../ownerPathsModel';
import { pullDetail, HEAD_SHA } from '../../../test/fixtures/pullRequest';
import type { OwnerMergePaths } from '../../../api/types';

const HREFS = {
  threads: '/pulls/32#pr-threads',
  conversation: '/pulls/32',
  checks: '/pulls/32/checks',
  commits: '/pulls/32/commits',
};

/** deploy#8: a required context red by design, and a reviewer's hold. */
function deployEight(over: Partial<OwnerMergePaths> = {}): OwnerMergePaths {
  return {
    head_sha: HEAD_SHA,
    base_ref: 'main',
    passport_hash: 'hash-1',
    blocked: true,
    enforce_admins: false,
    viewer_is_admin: true,
    viewer_may_clear_as_owner: true,
    headline: '2 of 3 blockers you can clear, each with its step below.',
    blockers: [
      {
        code: 'passport_blocked_checks',
        message: 'Required context `jankurai/proof` is failing.',
        owner_can_clear: true,
        how: 'A run of this context on this head has to pass, or an admin removes it from the required contexts of `main`.',
      },
      {
        code: 'passport_blocked_changes_requested',
        message: 'A reviewer requested changes on the current head.',
        owner_can_clear: true,
        how: 'Approve this exact head with a comment that states your decision ("Owner decision: …").',
      },
      {
        code: 'passport_blocked_pending_checks',
        message: 'Required context `acme/slow` is queued or running.',
        owner_can_clear: false,
        how: 'It is still running. Nobody clears this one; it clears itself.',
      },
    ],
    ...over,
  };
}

describe('ownerPathsModel', () => {
  it('keeps every blocker the server listed, in the server’s order', () => {
    const rows = ownerPathRows(deployEight());
    expect(rows.map((row) => row.code)).toEqual([
      'passport_blocked_checks',
      'passport_blocked_changes_requested',
      'passport_blocked_pending_checks',
    ]);
    expect(rows.map((row) => row.owner)).toEqual([true, true, false]);
    expect(rows.every((row) => row.how.length > 0)).toBe(true);
  });

  it('says nothing about a head whose passport passes', () => {
    const passing = deployEight({ blocked: false });
    expect(showOwnerPaths(passing)).toBe(false);
    expect(ownerPathRows(passing)).toEqual([]);
    expect(ownerPathHeadline(passing)).toBeNull();
    expect(ownerStandingNote(passing)).toBeNull();
  });

  it('shows the panel even when nothing clears from here', () => {
    const none = deployEight({
      blockers: [deployEight().blockers[2]!],
      headline: '1 blocker holds this merge, and none of them clears from this page.',
    });
    expect(showOwnerPaths(none)).toBe(true);
    expect(ownerPathHeadline(none)).toContain('none of them clears');
  });

  it('writes its own headline when the server sent none', () => {
    expect(ownerPathHeadline(deployEight({ headline: '  ' }))).toBe(
      '2 of 3 blockers clear from here.'
    );
  });

  it('tells an admin on an admins-excluded base that the steps are theirs', () => {
    const note = ownerStandingNote(deployEight());
    expect(note).toContain('enforce_admins is off');
    expect(note).toContain(HEAD_SHA.slice(0, 12));
  });

  it('claims no standing for an admin where protection includes admins', () => {
    expect(
      ownerStandingNote(
        deployEight({ enforce_admins: true, viewer_may_clear_as_owner: false })
      )
    ).toBeNull();
  });

  it('claims no standing for a reader who is not an admin', () => {
    expect(
      ownerStandingNote(
        deployEight({ viewer_is_admin: false, viewer_may_clear_as_owner: false })
      )
    ).toBeNull();
  });

  it('has nothing to say before the answer arrives', () => {
    expect(showOwnerPaths(null)).toBe(false);
    expect(ownerPathRows(undefined)).toEqual([]);
  });
});

function show(ownerPaths: OwnerMergePaths | null, passport: 'pass' | 'blocked' = 'blocked'): void {
  render(
    <MemoryRouter>
      <MergeBox
        detail={pullDetail({
          passport,
          blockers: [
            {
              code: 'passport_blocked_checks',
              message: 'Required context `jankurai/proof` is failing.',
              details: 'jankurai/proof',
            },
          ],
        })}
        checks={null}
        checksReceivedAtMs={Date.now()}
        hrefs={HREFS}
        viewer={{ login: '@alton2', permissions: ['pr.write'] }}
        viewerLogin="@alton2"
        ownerPaths={ownerPaths}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
        onSetState={vi.fn()}
      />
    </MemoryRouter>
  );
}

describe('MergeBox owner panel', () => {
  it('hides a cached answer after the live passport passes', () => {
    show(deployEight(), 'pass');
    expect(screen.queryByTestId('pr-owner-paths')).toBeNull();
  });

  it('hides an answer for a different head while the current head is blocked', () => {
    show(deployEight({ head_sha: 'f'.repeat(40) }));
    expect(screen.queryByTestId('pr-owner-paths')).toBeNull();
    expect(screen.getByTestId('pr-merge-gate')).toBeInTheDocument();
  });

  it('lists each blocker with its step, marking the reader’s own', () => {
    show(deployEight());
    const panel = screen.getByTestId('pr-owner-paths');
    expect(panel).toHaveTextContent('2 of 3 blockers you can clear');
    expect(
      screen.getByTestId('pr-owner-path-passport_blocked_changes_requested')
    ).toHaveTextContent('Owner decision');
    expect(
      screen.getByTestId('pr-owner-path-passport_blocked_changes_requested')
    ).toHaveAttribute('data-owner', 'yes');
    expect(
      screen.getByTestId('pr-owner-path-passport_blocked_pending_checks')
    ).toHaveAttribute('data-owner', 'no');
    expect(screen.getByTestId('pr-owner-standing')).toHaveTextContent(
      'enforce_admins is off'
    );
    // The gate's own lines are untouched: the panel explains them, it does
    // not replace them.
    expect(screen.getByTestId('pr-merge-gate')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge' })).toBeDisabled();
  });

  it('shows no panel while the answer has not arrived', () => {
    show(null);
    expect(screen.queryByTestId('pr-owner-paths')).toBeNull();
    expect(screen.getByTestId('pr-merge-gate')).toBeInTheDocument();
  });
});
