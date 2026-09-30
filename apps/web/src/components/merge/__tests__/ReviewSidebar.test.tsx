// ReviewSidebar.test.tsx — review-action sidebar render + interaction (Phase G).
//
// The ReviewSidebar is the operator's mutation surface on the PR cockpit. It
// must:
//   1. Always carry the EXACT head SHA the reviewer saw into `onApprove`
//      (§35.1.7) — the button label embeds the short SHA and the callback
//      receives the full 40-char SHA.
//   2. Gate the Merge CTA on the Passport verdict AND `mergeable.can_merge`:
//      a blocked passport (or `can_merge:false`) shows the "Merge blocked by
//      the Passport" notice instead of the merge buttons.
//   3. Surface the squash/rebase method buttons only when merge is allowed,
//      each routing the chosen method into `onMerge`.
//   4. Disable every action while a mutation is in-flight (`isBusy`).
//   5. Toggle the request-changes composer and submit a trimmed body.
//   6. Explain a self-approval: the author's own Approve is disabled and names
//      who has to approve instead, and a refusal from the server is shown with
//      its next step.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PullRequestDetail } from '../../../api/types';
import { ReviewSidebar } from '../ReviewSidebar';
import { approveRefusal, draftRefusal } from '../pullReviewModel';

const HEAD_SHA = 'abcdef1234567890abcdef1234567890abcdef12';

function makeDetail(
  over: {
    passport?: 'pass' | 'blocked';
    can_merge?: boolean;
    approvals?: number;
    required_approvals?: number;
    changes_requested?: number;
    unresolved_threads?: number;
    user_review_state?: string | null;
    passport_hash?: string | null;
    state?: 'open' | 'closed' | 'merged';
    author?: string;
    draft?: boolean;
  } = {}
): PullRequestDetail {
  const passport = over.passport ?? 'blocked';
  const canMerge = over.can_merge ?? passport === 'pass';
  return {
    summary: {
      repo: { id: 'r1', host: 'jeryu', owner: 'neverhuman', name: 'jeryu' },
      number: 7,
      entity: { kind: 'pull_request', id: 'r1#7' },
      title: 'A PR',
      author: over.author ?? '@author',
      head_ref: 'feature/x',
      base_ref: 'main',
      head_sha: HEAD_SHA,
      base_sha: 'base000000000000000000000000000000000000',
      state: over.state ?? 'open',
      draft: over.draft ?? false,
      mergeable: {
        level: canMerge ? 'mergeable' : 'blocked',
        can_merge: canMerge,
        reason: canMerge ? null : 'Passport blocked',
        exact_head_sha: HEAD_SHA,
        required_gate: canMerge ? null : 'passport',
      },
      review: {
        required_approvals: over.required_approvals ?? 2,
        approvals: over.approvals ?? 0,
        changes_requested: over.changes_requested ?? 0,
        unresolved_threads: over.unresolved_threads ?? 0,
        user_review_state: over.user_review_state ?? null,
      },
      checks: { total: 1, passing: 1, failing: 0, pending: 0, skipped: 0 },
      agents: {
        active_sessions: 0,
        proposed_patches: 0,
        evidence_packets: 0,
        blockers: 0,
      },
      labels: [],
      updated_at: '2026-05-26T00:00:00Z',
      passport_hash: over.passport_hash ?? 'hash-1',
      available_actions: [],
    },
    description: null,
    head_tree_sha: null,
    base_tree_sha: null,
    reviews: [],
    merge_passport: {
      status: passport,
      head_sha: HEAD_SHA,
      blockers:
        passport === 'blocked'
          ? [
              {
                code: 'passport_blocked_approvals',
                message: 'Approvals not met.',
                details: null,
              },
            ]
          : [],
      evaluated_at: '2026-05-26T00:00:00Z',
    },
    passport_hash: over.passport_hash ?? 'hash-1',
  };
}

describe('ReviewSidebar', () => {
  it('renders the approval posture and the exact-SHA approve label', () => {
    render(
      <ReviewSidebar
        detail={makeDetail({ approvals: 1, required_approvals: 2 })}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
      />
    );
    expect(screen.getByText('1 of 2 approvals')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: new RegExp(`Approve exact SHA ${HEAD_SHA.slice(0, 7)}`),
      })
    ).toBeInTheDocument();
  });

  it('passes the FULL head SHA to onApprove when Approve is clicked', async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(
      <ReviewSidebar detail={makeDetail()} onApprove={onApprove} onMerge={vi.fn()} />
    );
    await user.click(
      screen.getByRole('button', { name: /Approve exact SHA/ })
    );
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith(HEAD_SHA);
  });

  it('blocks merge when the Passport is blocked', () => {
    render(
      <ReviewSidebar
        detail={makeDetail({ passport: 'blocked' })}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
      />
    );
    expect(
      screen.getByText(/Merge blocked by the Passport/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Merge$/ })
    ).not.toBeInTheDocument();
  });

  it('blocks merge when the Passport passes but mergeable.can_merge is false', () => {
    render(
      <ReviewSidebar
        detail={makeDetail({ passport: 'pass', can_merge: false })}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
      />
    );
    expect(
      screen.getByText(/Merge blocked by the Passport/i)
    ).toBeInTheDocument();
  });

  it('enables Merge + squash/rebase methods when the Passport passes', async () => {
    const onMerge = vi.fn();
    const user = userEvent.setup();
    render(
      <ReviewSidebar
        detail={makeDetail({ passport: 'pass', can_merge: true })}
        onApprove={vi.fn()}
        onMerge={onMerge}
      />
    );
    expect(screen.getByText(/ready to merge/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Merge$/ }));
    expect(onMerge).toHaveBeenLastCalledWith({
      expectedHeadSha: HEAD_SHA,
      expectedPassportHash: 'hash-1',
      method: 'merge',
    });

    await user.click(screen.getByRole('button', { name: /Squash/ }));
    expect(onMerge).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: 'squash' })
    );

    await user.click(screen.getByRole('button', { name: /Rebase/ }));
    expect(onMerge).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: 'rebase' })
    );
  });

  it('disables all actions while a mutation is in-flight (isBusy)', () => {
    render(
      <ReviewSidebar
        detail={makeDetail({ passport: 'pass', can_merge: true })}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
        onRequestChanges={vi.fn()}
        isBusy
      />
    );
    expect(
      screen.getByRole('button', { name: /Approve exact SHA/ })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Merge$/ })).toBeDisabled();
  });

  it('toggles the request-changes composer and submits a trimmed body', async () => {
    const onRequestChanges = vi.fn();
    const user = userEvent.setup();
    render(
      <ReviewSidebar
        detail={makeDetail()}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
        onRequestChanges={onRequestChanges}
      />
    );

    // The composer is hidden until "Request changes" is clicked.
    expect(
      screen.queryByPlaceholderText(/What needs to change/i)
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Request changes/i }));
    const textarea = screen.getByLabelText(/Requested changes/i);
    await user.type(textarea, '   please rename the variable   ');

    await user.click(screen.getByRole('button', { name: /^Submit$/ }));
    expect(onRequestChanges).toHaveBeenCalledWith(
      HEAD_SHA,
      'please rename the variable'
    );
  });

  it('shows the viewer review state when present', () => {
    render(
      <ReviewSidebar
        detail={makeDetail({ user_review_state: 'approved' })}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
      />
    );
    expect(screen.getByText(/Your review:/i)).toBeInTheDocument();
    expect(screen.getByText('approved')).toBeInTheDocument();
  });

  it('offers exactly one primary action: Approve until approvals are met, then Merge', () => {
    const { rerender } = render(
      <ReviewSidebar
        detail={makeDetail({ passport: 'pass', approvals: 0, required_approvals: 1 })}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
      />
    );
    const primaries = (): string[] =>
      screen
        .getAllByRole('button')
        .filter((b) => b.className.includes('action-button--primary'))
        .map((b) => b.textContent ?? '');
    expect(primaries()).toHaveLength(1);
    expect(primaries()[0]).toMatch(/Approve exact SHA/);

    rerender(
      <ReviewSidebar
        detail={makeDetail({ passport: 'pass', approvals: 1, required_approvals: 0 })}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
      />
    );
    expect(screen.getByText('1 approval (none required)')).toBeInTheDocument();
    expect(primaries()).toEqual(['Merge']);
  });

  it('shows a merged pull request as settled: one calm line and no controls', () => {
    render(
      <ReviewSidebar
        detail={makeDetail({ state: 'merged', passport: 'blocked', approvals: 1, required_approvals: 1 })}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
      />
    );
    expect(screen.getByText(/Merged into main\. Nothing is waiting/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/Merge blocked/)).toBeNull();
  });
});

describe('ReviewSidebar self-approval', () => {
  it('disables Approve for the author and names who has to approve instead', async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(
      <ReviewSidebar
        detail={makeDetail({ author: '@alton' })}
        viewerLogin="alton"
        onApprove={onApprove}
        onMerge={vi.fn()}
      />
    );
    const approve = screen.getByRole('button', { name: /Approve exact SHA/ });
    expect(approve).toBeDisabled();
    await user.click(approve);
    expect(onApprove).not.toHaveBeenCalled();
    expect(screen.getByTestId('pr-approve-note')).toHaveTextContent(
      /You opened this pull request, so you cannot approve it\. An authenticated reviewer other than @alton has to approve exact SHA abcdef1\./
    );
  });

  it('keeps Approve live for a reviewer who is not the author', () => {
    render(
      <ReviewSidebar
        detail={makeDetail({ author: '@alton' })}
        viewerLogin="reviewer"
        onApprove={vi.fn()}
        onMerge={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: /Approve exact SHA/ })
    ).toBeEnabled();
    expect(screen.queryByTestId('pr-approve-note')).not.toBeInTheDocument();
  });

  it("shows the server's self-approval refusal with the next step", () => {
    const refusal = approveRefusal(
      {
        status: 403,
        code: 'pull_self_approval_forbidden',
        message: 'pull request authors cannot approve their own changes',
        details: { author: 'alton', reviewer: 'alton' },
      },
      makeDetail({ author: 'alton' })
    );
    render(
      <ReviewSidebar
        detail={makeDetail({ author: 'alton' })}
        approveRefusal={refusal}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
      />
    );
    const alert = screen.getByTestId('pr-approve-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent(
      /Approval refused: pull request authors cannot approve their own changes/
    );
    expect(alert).toHaveTextContent(
      /signed in as alton, which is also the author \(alton\)/
    );
    expect(alert).toHaveTextContent(
      /independent authenticated reviewer with write access has to approve exact SHA abcdef1/
    );
  });

  it('says a draft review is recorded but the merge waits', () => {
    render(
      <ReviewSidebar
        detail={makeDetail({ draft: true })}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
      />
    );
    expect(screen.getByTestId('pr-draft-note')).toHaveTextContent(
      /a review is recorded now, but the merge waits until it is marked ready for review/
    );
  });
});

describe('the draft lifecycle controls', () => {
  it('offers Ready for review on a draft and Convert to draft on an open PR', async () => {
    const onSetDraft = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(
      <ReviewSidebar
        detail={makeDetail({ draft: true, author: 'dana' })}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
        onSetDraft={onSetDraft}
        viewerLogin="dana"
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Convert to draft' })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ready for review' }));
    expect(onSetDraft).toHaveBeenCalledWith(false);
    unmount();

    render(
      <ReviewSidebar
        detail={makeDetail({ author: 'dana' })}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
        onSetDraft={onSetDraft}
        viewerLogin="dana"
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Ready for review' })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Convert to draft' }));
    expect(onSetDraft).toHaveBeenLastCalledWith(true);
  });

  it('offers the control to an admin and withholds it from a stranger', () => {
    const { unmount } = render(
      <ReviewSidebar
        detail={makeDetail({ draft: true, author: 'dana' })}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
        onSetDraft={vi.fn()}
        viewerLogin="root"
        viewerRole="admin"
      />
    );
    expect(screen.getByRole('button', { name: 'Ready for review' })).toBeEnabled();
    unmount();

    render(
      <ReviewSidebar
        detail={makeDetail({ draft: true, author: 'dana' })}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
        onSetDraft={vi.fn()}
        viewerLogin="mallory"
        viewerRole="user"
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Ready for review' })
    ).not.toBeInTheDocument();
  });

  it('tells a draft reviewer the merge waits, and points at the control', () => {
    render(
      <ReviewSidebar
        detail={makeDetail({ draft: true })}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
        onSetDraft={vi.fn()}
      />
    );
    expect(screen.getByTestId('pr-draft-note').textContent).toContain(
      'Ready for review'
    );
  });

  it('shows a refused transition next to the control', () => {
    render(
      <ReviewSidebar
        detail={makeDetail({ draft: true })}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
        onSetDraft={vi.fn()}
        draftRefusal={draftRefusal(
          {
            code: 'pull_draft_forbidden',
            message: 'only the pull request author or an admin can change its draft state',
            status: 403,
          },
          false
        )}
      />
    );
    const note = screen.getByTestId('pr-draft-error').textContent ?? '';
    expect(note).toContain('Not marked ready for review');
    expect(note).toContain('Ask the author, or an administrator');
  });
});
