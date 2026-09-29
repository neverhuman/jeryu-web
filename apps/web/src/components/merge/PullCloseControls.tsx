// PullCloseControls.tsx — Close / Reopen for a pull request.
//
// Closing is a decision, not a review verdict, so it sits under the review
// pane on its own: one button, with an optional comment that is posted to the
// pull request before the state changes. A merged pull request shows nothing —
// there is no state left to change — and neither does a viewer who may not
// close (see `pullCloseModel`).

import { RotateCcw, XCircle } from 'lucide-react';
import { useState } from 'react';

import { ActionButton } from '../action/ActionButton';
import type { PullRequestDetail } from '../../api/types';
import {
  pullStateAction,
  targetState,
  type PullCloseViewer,
} from './pullCloseModel';

import './merge.css';

export interface PullCloseControlsProps {
  detail: PullRequestDetail;
  viewer: PullCloseViewer;
  /** Posts the comment (when given), then asks the forge for `state`. */
  onSetState: (input: {
    state: 'open' | 'closed';
    comment: string | null;
  }) => Promise<void> | void;
  /** When true, the mutation is in flight. */
  isBusy?: boolean;
  /** The server's refusal, shown verbatim. */
  error?: string | null;
}

export function PullCloseControls({
  detail,
  viewer,
  onSetState,
  isBusy = false,
  error,
}: PullCloseControlsProps): JSX.Element | null {
  const action = pullStateAction(detail, viewer);
  const [comment, setComment] = useState('');

  if (!action) return null;

  const label = action === 'close' ? 'Close pull request' : 'Reopen pull request';
  const submit = (): void => {
    const body = comment.trim();
    void onSetState({ state: targetState(action), comment: body || null });
    setComment('');
  };

  return (
    <section className="review-sidebar__close" aria-label={label}>
      {action === 'close' ? (
        <>
          <label htmlFor="pull-close-comment" className="sr-only">
            Comment posted before closing
          </label>
          <textarea
            id="pull-close-comment"
            className="review-sidebar__textarea"
            aria-label="Closing comment"
            placeholder="Optional: say why (posted as a comment)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
          />
        </>
      ) : null}
      <ActionButton
        variant={action === 'close' ? 'danger' : 'default'}
        icon={
          action === 'close' ? (
            <XCircle aria-hidden="true" size={12} />
          ) : (
            <RotateCcw aria-hidden="true" size={12} />
          )
        }
        onClick={submit}
        disabled={isBusy}
        actionId={action === 'close' ? 'pull.close' : 'pull.reopen'}
      >
        {label}
      </ActionButton>
      {error ? (
        <p
          className="pr-cockpit__review-error"
          role="alert"
          data-testid="pr-close-error"
        >
          {action === 'close' ? 'Close refused' : 'Reopen refused'}: {error}
        </p>
      ) : null}
    </section>
  );
}
