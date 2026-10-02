// ReviewSidebar.tsx — actions sidebar: approve / request changes / merge
// (W-FE-11).
//
// The Merge button is gated on the Passport verdict (§35.2.4). The Approve
// button always carries the SHA the reviewer saw (`expected_head_sha`);
// when the server rejects with `merge_sha_stale` the parent surfaces the
// recovery banner.
//
// Once the approval requirement is met the exact-SHA Approve button stops
// being the primary action — it reads as if the approval were still missing —
// so it is demoted to "Add your approval" and withdrawn altogether from a
// reviewer whose approval already stands on this head. The count says who
// approved and at which SHA.
//
// A blocked merge says what blocks it in the same line: "blocked by the
// Passport" alone leaves the reader asking whether that and a failed gate are
// two different things.
//
// An author cannot approve their own pull request: when the signed-in account
// is the author the Approve button is disabled and says who has to approve
// instead, and any refusal the server sends back (`pull_self_approval_forbidden`
// and the rest) is shown next to the button with its next step.

import { Check, FileEdit, GitMerge, Send, ShieldAlert, XCircle } from 'lucide-react';
import { useState } from 'react';

import { ActionButton } from '../action/ActionButton';
import type { PullRequestDetail } from '../../api/types';
import { canChangeDraft } from '../../pages/pullDraftModel';
import {
  approvalAttribution,
  approvalsLabel,
  approveAvailability,
  approveCta,
  draftReviewNote,
  isSettled,
  mergeAllowed as canMergeNow,
  mergeBlockedLine,
  primaryAction,
  settledLine,
  type ApproveRefusal,
} from './pullReviewModel';

import './merge.css';

export interface ReviewSidebarProps {
  detail: PullRequestDetail;
  /** Called when the reviewer clicks Approve. */
  onApprove: (expectedHeadSha: string) => Promise<void> | void;
  /** Called when the reviewer clicks Request changes. */
  onRequestChanges?: (expectedHeadSha: string, body: string) => Promise<void> | void;
  /** Called when the reviewer clicks Merge. */
  onMerge: (params: {
    expectedHeadSha: string;
    expectedPassportHash: string | null;
    method: 'merge' | 'squash' | 'rebase';
  }) => Promise<void> | void;
  /** The signed-in account (`GET /auth/me`), for the self-approval check. */
  viewerLogin?: string | null;
  /** The signed-in account's role; an admin may move anyone's draft. */
  viewerRole?: 'admin' | 'user' | null;
  /**
   * Called when the reader marks a draft ready for review, or converts an open
   * pull request back to a draft. Absent when no draft control is wired.
   */
  onSetDraft?: (draft: boolean) => Promise<void> | void;
  /** A refused draft transition, worded with its next step. */
  draftRefusal?: string | null;
  /** A refused approval: the server's message plus its next step. */
  approveRefusal?: ApproveRefusal | null;
  /** When true, mutations are disabled (in-flight). */
  isBusy?: boolean;
  className?: string;
}

export function ReviewSidebar({
  detail,
  onApprove,
  onRequestChanges,
  onMerge,
  viewerLogin = null,
  viewerRole = null,
  onSetDraft,
  draftRefusal = null,
  approveRefusal = null,
  isBusy = false,
  className,
}: ReviewSidebarProps): JSX.Element {
  const review = detail.summary.review;
  const headSha = detail.summary.head_sha;
  const mergeAllowed = canMergeNow(detail);
  const reviewState = review.user_review_state ?? null;
  const primary = primaryAction(detail);
  const approve = approveAvailability(detail, viewerLogin);
  const cta = approveCta(detail, viewerLogin);
  const attribution = approvalAttribution(detail);
  const draftNote = draftReviewNote(detail);
  const isDraft = detail.summary.draft;
  // The control is offered to whoever the forge would let use it: the author,
  // and an admin on their behalf when the author is away.
  const draftControl =
    onSetDraft &&
    canChangeDraft(
      detail.summary,
      viewerLogin ? { login: viewerLogin, role: viewerRole ?? 'user' } : null
    );

  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [requestChangesBody, setRequestChangesBody] = useState('');

  const handleApprove = (): void => {
    void onApprove(headSha);
  };

  const handleMerge = (method: 'merge' | 'squash' | 'rebase'): void => {
    void onMerge({
      expectedHeadSha: headSha,
      expectedPassportHash: detail.passport_hash ?? null,
      method,
    });
  };

  const handleRequestChangesSubmit = (): void => {
    if (!onRequestChanges) return;
    const body = requestChangesBody.trim();
    if (!body) return;
    void onRequestChanges(headSha, body);
    setRequestChangesOpen(false);
    setRequestChangesBody('');
  };

  if (isSettled(detail)) {
    return (
      <section
        className={`review-sidebar ${className ?? ''}`.trim()}
        aria-label="Review"
      >
        <header className="review-sidebar__header">
          <h3 className="review-sidebar__title">Review</h3>
          <p className="review-sidebar__settled">{settledLine(detail.summary)}</p>
          <p className="review-sidebar__posture">
            <span className="review-sidebar__approvals">{approvalsLabel(review)}</span>
          </p>
          {attribution ? (
            <p
              className="review-sidebar__attribution"
              data-testid="pr-approval-attribution"
            >
              {attribution}
            </p>
          ) : null}
        </header>
      </section>
    );
  }

  return (
    <section
      className={`review-sidebar ${className ?? ''}`.trim()}
      aria-label="Review actions"
    >
      <header className="review-sidebar__header">
        <h3 className="review-sidebar__title">Review</h3>
        <p className="review-sidebar__posture">
          <span className="review-sidebar__approvals">{approvalsLabel(review)}</span>
          {review.changes_requested > 0 ? (
            <span className="review-sidebar__changes">
              · {review.changes_requested} changes requested
            </span>
          ) : null}
          {review.unresolved_threads > 0 ? (
            <span className="review-sidebar__threads">
              · {review.unresolved_threads} unresolved
            </span>
          ) : null}
        </p>
        {attribution ? (
          <p
            className="review-sidebar__attribution"
            data-testid="pr-approval-attribution"
          >
            {attribution}
          </p>
        ) : null}
        {reviewState ? (
          <p className="review-sidebar__user-state">
            Your review: <strong>{reviewState}</strong>
          </p>
        ) : null}
      </header>

      <div className="review-sidebar__actions">
        {cta.show ? (
          <ActionButton
            variant={cta.emphasized ? 'primary' : 'default'}
            icon={<Check aria-hidden="true" size={12} />}
            onClick={handleApprove}
            disabled={isBusy || !approve.enabled}
            actionId="pull.approve"
          >
            {cta.label}
          </ActionButton>
        ) : null}
        <ActionButton
          variant="default"
          icon={<XCircle aria-hidden="true" size={12} />}
          onClick={() => setRequestChangesOpen((v) => !v)}
          disabled={isBusy || !onRequestChanges}
          actionId="pull.request_changes"
        >
          Request changes
        </ActionButton>
        {draftControl ? (
          isDraft ? (
            <ActionButton
              variant="primary"
              icon={<Send aria-hidden="true" size={12} />}
              onClick={() => void onSetDraft(false)}
              disabled={isBusy}
              actionId="pull.ready_for_review"
              data-testid="pr-ready-for-review"
            >
              Ready for review
            </ActionButton>
          ) : (
            <ActionButton
              variant="ghost"
              icon={<FileEdit aria-hidden="true" size={12} />}
              onClick={() => void onSetDraft(true)}
              disabled={isBusy}
              actionId="pull.convert_to_draft"
              data-testid="pr-convert-to-draft"
            >
              Convert to draft
            </ActionButton>
          )
        ) : null}
      </div>

      {approve.reason ? (
        <p className="review-sidebar__approve-note" data-testid="pr-approve-note">
          {approve.reason}
        </p>
      ) : null}
      {draftNote ? (
        <p className="review-sidebar__approve-note" data-testid="pr-draft-note">
          {draftNote}
        </p>
      ) : null}
      {draftRefusal ? (
        <p
          className="review-sidebar__approve-note"
          role="alert"
          data-testid="pr-draft-error"
        >
          {draftRefusal}
        </p>
      ) : null}
      {approveRefusal ? (
        <div
          className="review-sidebar__approve-refusal"
          role="alert"
          data-testid="pr-approve-error"
        >
          <span className="review-sidebar__approve-refusal-message">
            Approval refused: {approveRefusal.message}
          </span>
          <span>{approveRefusal.guidance}</span>
        </div>
      ) : null}

      {requestChangesOpen ? (
        <div className="review-sidebar__changes-form">
          <label htmlFor="request-changes-body" className="sr-only">
            Changes requested body
          </label>
          <textarea
            id="request-changes-body"
            className="review-sidebar__textarea"
            aria-label="Requested changes"
            value={requestChangesBody}
            onChange={(e) => setRequestChangesBody(e.target.value)}
            rows={3}
          />
          <div className="review-sidebar__changes-actions">
            <ActionButton
              variant="ghost"
              onClick={() => setRequestChangesOpen(false)}
              disabled={isBusy}
            >
              Cancel
            </ActionButton>
            <ActionButton
              variant="primary"
              onClick={handleRequestChangesSubmit}
              disabled={isBusy || requestChangesBody.trim().length === 0}
            >
              Submit
            </ActionButton>
          </div>
        </div>
      ) : null}

      <div className="review-sidebar__merge">
        {mergeAllowed ? (
          <>
            <p className="review-sidebar__merge-hint">
              Every required gate is green: ready to merge.
            </p>
            <ActionButton
              variant={primary === 'merge' ? 'primary' : 'default'}
              icon={<GitMerge aria-hidden="true" size={12} />}
              onClick={() => handleMerge('merge')}
              disabled={isBusy}
              actionId="pull.merge"
            >
              Merge
            </ActionButton>
            <div className="review-sidebar__merge-methods">
              <button
                type="button"
                className="review-sidebar__method"
                onClick={() => handleMerge('squash')}
                disabled={isBusy}
              >
                Squash
              </button>
              <button
                type="button"
                className="review-sidebar__method"
                onClick={() => handleMerge('rebase')}
                disabled={isBusy}
              >
                Rebase
              </button>
            </div>
          </>
        ) : (
          <div className="review-sidebar__merge-blocked">
            <ShieldAlert aria-hidden="true" size={14} />
            <span data-testid="pr-merge-blocked">
              {mergeBlockedLine(detail)} Every blocker is listed below.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
