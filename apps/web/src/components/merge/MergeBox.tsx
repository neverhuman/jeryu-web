// MergeBox.tsx — the one box on the Conversation tab that says where the
// merge stands and carries every move it offers.
//
// It replaces three stacked surfaces that said the same thing in different
// words (a review sidebar, a Merge Passport card, and the blocker cards under
// it). What is left is:
//
//   * one headline — "Blocked: 2 things need doing", or "Ready to merge";
//   * a checklist row per thing the merge waits for, each linking to the tab
//     that owns it;
//   * the primary action (approve this exact SHA, or merge), with Request
//     changes beside it;
//   * Close or Reopen as a ghost button at the end, its comment field opening
//     only once the reader has asked to close.
//
// The approval rules are unchanged: the Approve button always carries the SHA
// the reviewer saw, an author cannot approve their own pull request, and a
// refusal is shown next to the button with the one step that clears it.

import {
  AlertCircle,
  Check,
  CheckCircle2,
  Circle,
  FileEdit,
  GitMerge,
  RotateCcw,
  Send,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ActionButton } from '../action/ActionButton';
import type { PullRequestChecks, PullRequestDetail } from '../../api/types';
import { canChangeDraft } from '../../pages/pullDraftModel';
import {
  mergeChecklist,
  mergeHeadline,
  type ChecklistHrefs,
  type ChecklistRow,
} from './mergeBoxModel';
import {
  pullStateAction,
  targetState,
  type PullCloseViewer,
} from './pullCloseModel';
import {
  approvalAttribution,
  approvalsLabel,
  approveAvailability,
  approveCta,
  draftReviewNote,
  isSettled,
  mergeAllowed as canMergeNow,
  primaryAction,
  settledLine,
  type ApproveRefusal,
} from './pullReviewModel';

import './merge.css';

export interface MergeBoxProps {
  detail: PullRequestDetail;
  /** The checks of this head, for the required-checks row; null while reading. */
  checks?: PullRequestChecks | null;
  checksLoading?: boolean;
  /** Where each checklist row sends the reader. */
  hrefs: ChecklistHrefs;
  /** Called when the reviewer approves, with the SHA they saw. */
  onApprove: (expectedHeadSha: string) => Promise<void> | void;
  onRequestChanges?: (expectedHeadSha: string, body: string) => Promise<void> | void;
  onMerge: (params: {
    expectedHeadSha: string;
    expectedPassportHash: string | null;
    method: 'merge' | 'squash' | 'rebase';
  }) => Promise<void> | void;
  /** Posts the comment (when given), then asks the forge for `state`. */
  onSetState: (input: {
    state: 'open' | 'closed';
    comment: string | null;
  }) => Promise<void> | void;
  /** Marks a draft ready for review, or converts an open PR back to a draft. */
  onSetDraft?: (draft: boolean) => Promise<void> | void;
  /** The signed-in account (`GET /auth/me`), for the self-approval check. */
  viewerLogin?: string | null;
  /** The signed-in account's role; an admin may move anyone's draft. */
  viewerRole?: 'admin' | 'user' | null;
  /** Who is looking: decides whether Close / Reopen is offered at all. */
  viewer: PullCloseViewer;
  /** A refused approval: the server's message plus its next step. */
  approveRefusal?: ApproveRefusal | null;
  /** A refused draft transition, worded with its next step. */
  draftRefusal?: string | null;
  /** A failed review submission that is not head drift. */
  reviewError?: string | null;
  /** The server's merge refusal, shown verbatim. */
  mergeError?: string | null;
  /** The server's refusal of a close / reopen, shown verbatim. */
  closeError?: string | null;
  /** When true, mutations are disabled (in-flight). */
  isBusy?: boolean;
  className?: string;
}

const ROW_ICONS = {
  done: CheckCircle2,
  needed: AlertCircle,
  unknown: Circle,
} as const;

function ChecklistItem({
  row,
  action,
}: {
  row: ChecklistRow;
  /** A control that clears this row from inside the box, when there is one. */
  action?: JSX.Element | null;
}): JSX.Element {
  const Icon = ROW_ICONS[row.state];
  return (
    <li
      className={`merge-box__row merge-box__row--${row.state}`}
      data-state={row.state}
      data-testid={`pr-merge-row-${row.key}`}
    >
      <Icon aria-hidden="true" size={14} className="merge-box__row-icon" />
      <div className="merge-box__row-body">
        <span className="merge-box__row-label">
          {row.href ? <Link to={row.href}>{row.label}</Link> : row.label}
        </span>
        <span className="merge-box__row-hint">{row.hint}</span>
        {action}
      </div>
    </li>
  );
}

export function MergeBox({
  detail,
  checks = null,
  checksLoading = false,
  hrefs,
  onApprove,
  onRequestChanges,
  onMerge,
  onSetState,
  onSetDraft,
  viewerLogin = null,
  viewerRole = null,
  viewer,
  approveRefusal = null,
  draftRefusal = null,
  reviewError = null,
  mergeError = null,
  closeError = null,
  isBusy = false,
  className,
}: MergeBoxProps): JSX.Element {
  const review = detail.summary.review;
  const headSha = detail.summary.head_sha;
  const settled = isSettled(detail);
  const rows = mergeChecklist(detail, checks, hrefs, { checksLoading });
  const headline = mergeHeadline(detail, rows);
  const mergeable = canMergeNow(detail);
  const primary = primaryAction(detail);
  const approve = approveAvailability(detail, viewerLogin);
  const cta = approveCta(detail, viewerLogin);
  const attribution = approvalAttribution(detail);
  const draftNote = draftReviewNote(detail);
  const isDraft = detail.summary.draft;
  const reviewState = review.user_review_state ?? null;
  // The draft control is offered to whoever the forge would let use it: the
  // author, and an admin on their behalf when the author is away.
  const draftControl =
    onSetDraft &&
    canChangeDraft(
      detail.summary,
      viewerLogin ? { login: viewerLogin, role: viewerRole ?? 'user' } : null
    );
  const stateAction = pullStateAction(detail, viewer);

  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [requestChangesBody, setRequestChangesBody] = useState('');
  // Closing is a decision: the ghost button asks for it, and only then does
  // the page offer the comment and the red confirmation.
  const [closing, setClosing] = useState(false);
  const [closeComment, setCloseComment] = useState('');

  const handleRequestChangesSubmit = (): void => {
    if (!onRequestChanges) return;
    const body = requestChangesBody.trim();
    if (!body) return;
    void onRequestChanges(headSha, body);
    setRequestChangesOpen(false);
    setRequestChangesBody('');
  };

  const handleMerge = (method: 'merge' | 'squash' | 'rebase'): void => {
    void onMerge({
      expectedHeadSha: headSha,
      expectedPassportHash: detail.passport_hash ?? null,
      method,
    });
  };

  const handleSetState = (state: 'open' | 'closed'): void => {
    const body = closeComment.trim();
    void onSetState({ state, comment: body || null });
    setCloseComment('');
    setClosing(false);
  };

  const closeControls =
    stateAction === null ? null : stateAction === 'reopen' ? (
      <ActionButton
        variant="ghost"
        icon={<RotateCcw aria-hidden="true" size={12} />}
        onClick={() => handleSetState('open')}
        disabled={isBusy}
        actionId="pull.reopen"
        data-testid="pr-reopen"
      >
        Reopen pull request
      </ActionButton>
    ) : closing ? (
      <div className="merge-box__close-form" data-testid="pr-close-form">
        <label htmlFor="pull-close-comment" className="sr-only">
          Comment posted before closing
        </label>
        <textarea
          id="pull-close-comment"
          className="merge-box__textarea"
          aria-label="Closing comment"
          placeholder="Optional: say why (posted as a comment)"
          value={closeComment}
          onChange={(event) => setCloseComment(event.target.value)}
          rows={2}
        />
        <div className="merge-box__close-actions">
          <ActionButton
            variant="ghost"
            onClick={() => {
              setClosing(false);
              setCloseComment('');
            }}
            disabled={isBusy}
          >
            Keep it open
          </ActionButton>
          <ActionButton
            variant="danger"
            icon={<XCircle aria-hidden="true" size={12} />}
            onClick={() => handleSetState('closed')}
            disabled={isBusy}
            actionId="pull.close"
            data-testid="pr-close-confirm"
          >
            Close pull request
          </ActionButton>
        </div>
      </div>
    ) : (
      <ActionButton
        variant="ghost"
        icon={<XCircle aria-hidden="true" size={12} />}
        onClick={() => setClosing(true)}
        disabled={isBusy}
        data-testid="pr-close"
      >
        Close pull request
      </ActionButton>
    );

  if (settled) {
    return (
      <section
        className={`merge-box ${className ?? ''}`.trim()}
        aria-label="Merge"
        data-testid="pr-merge-box"
      >
        <h2 className="merge-box__headline" data-testid="pr-merge-headline">
          {headline}
        </h2>
        <p className="merge-box__settled">{settledLine(detail.summary)}</p>
        <p className="merge-box__posture">
          <span className="merge-box__approvals">{approvalsLabel(review)}</span>
        </p>
        {attribution ? (
          <p className="merge-box__attribution" data-testid="pr-approval-attribution">
            {attribution}
          </p>
        ) : null}
        {closeError ? (
          <p className="merge-box__error" role="alert" data-testid="pr-close-error">
            Reopen refused: {closeError}
          </p>
        ) : null}
        {closeControls ? (
          <div className="merge-box__settle">{closeControls}</div>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className={`merge-box ${className ?? ''}`.trim()}
      aria-label="Merge"
      data-testid="pr-merge-box"
    >
      <h2 className="merge-box__headline" data-testid="pr-merge-headline">
        {headline}
      </h2>

      <ul className="merge-box__checklist" data-testid="pr-merge-checklist">
        {rows.map((row) => (
          <ChecklistItem
            key={row.key}
            row={row}
            action={
              row.key === 'draft' && row.state === 'needed' && draftControl ? (
                <ActionButton
                  variant="primary"
                  icon={<Send aria-hidden="true" size={12} />}
                  onClick={() => void onSetDraft(false)}
                  disabled={isBusy}
                  actionId="pull.ready_for_review"
                  className="merge-box__row-action"
                  data-testid="pr-ready-for-review"
                >
                  Ready for review
                </ActionButton>
              ) : null
            }
          />
        ))}
      </ul>

      <p className="merge-box__posture">
        <span className="merge-box__approvals">{approvalsLabel(review)}</span>
        {reviewState ? (
          <span className="merge-box__user-state">
            {' '}· your review: <strong>{reviewState}</strong>
          </span>
        ) : null}
      </p>
      {attribution ? (
        <p className="merge-box__attribution" data-testid="pr-approval-attribution">
          {attribution}
        </p>
      ) : null}

      <div className="merge-box__actions">
        {mergeable ? (
          <ActionButton
            variant={primary === 'merge' ? 'primary' : 'default'}
            icon={<GitMerge aria-hidden="true" size={12} />}
            onClick={() => handleMerge('merge')}
            disabled={isBusy}
            actionId="pull.merge"
          >
            Merge
          </ActionButton>
        ) : null}
        {cta.show ? (
          <ActionButton
            variant={cta.emphasized ? 'primary' : 'default'}
            icon={<Check aria-hidden="true" size={12} />}
            onClick={() => void onApprove(headSha)}
            disabled={isBusy || !approve.enabled}
            actionId="pull.approve"
          >
            {cta.label}
          </ActionButton>
        ) : null}
        <ActionButton
          variant="default"
          icon={<XCircle aria-hidden="true" size={12} />}
          onClick={() => setRequestChangesOpen((open) => !open)}
          disabled={isBusy || !onRequestChanges}
          actionId="pull.request_changes"
        >
          Request changes
        </ActionButton>
        {draftControl && !isDraft ? (
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
        ) : null}
      </div>

      {mergeable ? (
        <div className="merge-box__merge-methods">
          <button
            type="button"
            className="merge-box__method"
            onClick={() => handleMerge('squash')}
            disabled={isBusy}
          >
            Squash
          </button>
          <button
            type="button"
            className="merge-box__method"
            onClick={() => handleMerge('rebase')}
            disabled={isBusy}
          >
            Rebase
          </button>
        </div>
      ) : null}

      {approve.reason ? (
        <p className="merge-box__note" data-testid="pr-approve-note">
          {approve.reason}
        </p>
      ) : null}
      {draftNote ? (
        <p className="merge-box__note" data-testid="pr-draft-note">
          {draftNote}
        </p>
      ) : null}
      {draftRefusal ? (
        <p className="merge-box__error" role="alert" data-testid="pr-draft-error">
          {draftRefusal}
        </p>
      ) : null}
      {approveRefusal ? (
        <div className="merge-box__refusal" role="alert" data-testid="pr-approve-error">
          <span className="merge-box__refusal-message">
            Approval refused: {approveRefusal.message}
          </span>
          <span>{approveRefusal.guidance}</span>
        </div>
      ) : null}
      {reviewError ? (
        <p className="merge-box__error" role="alert" data-testid="pr-review-error">
          Review not submitted: {reviewError}
        </p>
      ) : null}
      {mergeError ? (
        <p className="merge-box__error" role="alert" data-testid="pr-merge-error">
          Merge refused: {mergeError}
        </p>
      ) : null}

      {requestChangesOpen ? (
        <div className="merge-box__changes-form">
          <label htmlFor="request-changes-body" className="sr-only">
            Changes requested body
          </label>
          <textarea
            id="request-changes-body"
            className="merge-box__textarea"
            aria-label="Requested changes"
            value={requestChangesBody}
            onChange={(event) => setRequestChangesBody(event.target.value)}
            rows={3}
          />
          <div className="merge-box__close-actions">
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

      {closeError ? (
        <p className="merge-box__error" role="alert" data-testid="pr-close-error">
          Close refused: {closeError}
        </p>
      ) : null}
      {closeControls ? (
        <div className="merge-box__settle">{closeControls}</div>
      ) : null}
    </section>
  );
}
