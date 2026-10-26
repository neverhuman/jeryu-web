// ReviewList.tsx — the reviews of a pull request, on the Conversation, with
// what each reviewer wrote.
//
// A review that asks for changes is why a pull request cannot merge, and its
// body says what to fix; it used to be readable nowhere on the page. Each
// review is now one collapsible entry: who, the verdict, when, and the body
// rendered from its Markdown. The review asking for changes starts open, and a
// link to `#review-<id>` or `#changes-requested` opens that review and scrolls
// to it, so a "Changes requested" row lands the reader on the words. A
// findings table (Finding + Where columns) is laid out by ReviewFindingsTable,
// its Where linking to that file of the diff when `fileHref` is given.

import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import type { PullRequestReview } from '../../api/types';
import { When } from '../../format/When';
import { MarkdownSource } from '../browser/MarkdownSource';
import { FindingHrefContext, ReviewFindingsTable } from './ReviewFindingsTable';
import { repairTablePipes, type FindingLocation } from './reviewFindingsModel';
import {
  isChangesRequestedState,
  openReviewIds,
  reviewAnchor,
  reviewStateLabel,
  sortReviews,
  targetReviewId,
} from './reviewListModel';

import './merge.css';

const REVIEW_MARKDOWN = { table: ReviewFindingsTable };

export interface ReviewListProps {
  reviews: readonly PullRequestReview[];
  /** Where a finding's file is read; without it a Where is plain text. Keep it stable. */
  fileHref?: (location: FindingLocation) => string;
}

export function ReviewList({ reviews, fileHref }: ReviewListProps): JSX.Element | null {
  const sorted = useMemo(() => sortReviews(reviews), [reviews]);
  const { opened, target } = useReviewAnchors(reviews);

  if (sorted.length === 0) return null;

  return (
    <FindingHrefContext.Provider value={fileHref ?? null}>
    <section
      className="review-list"
      aria-label="Reviews"
      id="pr-reviews"
      data-testid="pr-reviews"
    >
      <h2 className="review-list__title">Reviews</h2>
      <ul className="review-list__items">
        {sorted.map((review) => (
          <ReviewEntry
            key={review.id}
            review={review}
            open={opened.has(review.id)}
            target={review.id === target}
          />
        ))}
      </ul>
    </section>
    </FindingHrefContext.Provider>
  );
}

/**
 * Which reviews start open, and which one the address points at (scrolled to
 * once it is drawn): the review asking for changes, or `#review-<id>`.
 */
export function useReviewAnchors(reviews: readonly PullRequestReview[]): {
  opened: Set<string>;
  target: string | null;
} {
  const { hash } = useLocation();
  const opened = useMemo(() => openReviewIds(reviews, hash), [reviews, hash]);
  const target = useMemo(() => targetReviewId(reviews, hash), [reviews, hash]);

  useEffect(() => {
    if (!target) return;
    const element = document.getElementById(reviewAnchor(target));
    element?.scrollIntoView?.({ block: 'start' });
  }, [target]);

  return { opened, target };
}

/** One review: who, the verdict, when, and its body under a disclosure. */
export function ReviewEntry({
  review,
  open,
  target,
}: {
  review: PullRequestReview;
  open: boolean;
  target: boolean;
}): JSX.Element {
  const asking = isChangesRequestedState(review.state);
  const body = repairTablePipes((review.body_markdown ?? '').trim());
  const notes = [
    review.stale ? 'on an earlier head' : null,
    review.effective ? null : 'no longer counts',
  ].filter(Boolean);
  return (
    <li
      id={reviewAnchor(review.id)}
      className={`review-list__item${asking ? ' review-list__item--changes' : ''}`}
      data-testid={`pr-review-${review.id}`}
      data-target={target ? 'true' : undefined}
    >
      <details open={open}>
        <summary className="review-list__summary">
          <strong>{review.author}</strong>
          <span className="review-list__state">{reviewStateLabel(review.state)}</span>
          <When at={review.submitted_at} />
          {notes.length > 0 ? (
            <span className="review-list__note">{notes.join(', ')}</span>
          ) : null}
        </summary>
        {body ? (
          <MarkdownSource
            markdown={body}
            components={REVIEW_MARKDOWN}
            className="review-list__body"
          />
        ) : (
          <p className="review-list__empty">No comment with this review.</p>
        )}
      </details>
    </li>
  );
}
