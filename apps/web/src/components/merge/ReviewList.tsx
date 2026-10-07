// ReviewList.tsx — the reviews of a pull request, on the Conversation, with
// what each reviewer wrote.
//
// A review that asks for changes is why a pull request cannot merge, and its
// body says what to fix; it used to be readable nowhere on the page. Each
// review is now one collapsible entry: who, the verdict, when, and the body
// rendered from its Markdown. The review asking for changes starts open, and a
// link to `#review-<id>` or `#changes-requested` opens that review and scrolls
// to it, so a "Changes requested" row lands the reader on the words.

import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import type { PullRequestReview } from '../../api/types';
import { When } from '../../format/When';
import { MarkdownSource } from '../browser/MarkdownSource';
import {
  isChangesRequestedState,
  openReviewIds,
  reviewAnchor,
  reviewStateLabel,
  sortReviews,
  targetReviewId,
} from './reviewListModel';

import './merge.css';

export interface ReviewListProps {
  reviews: readonly PullRequestReview[];
}

export function ReviewList({ reviews }: ReviewListProps): JSX.Element | null {
  const { hash } = useLocation();
  const sorted = useMemo(() => sortReviews(reviews), [reviews]);
  const opened = useMemo(() => openReviewIds(reviews, hash), [reviews, hash]);
  const target = useMemo(() => targetReviewId(reviews, hash), [reviews, hash]);

  useEffect(() => {
    if (!target) return;
    const element = document.getElementById(reviewAnchor(target));
    element?.scrollIntoView?.({ block: 'start' });
  }, [target]);

  if (sorted.length === 0) return null;

  return (
    <section
      className="review-list"
      aria-label="Reviews"
      id="pr-reviews"
      data-testid="pr-reviews"
    >
      <h2 className="review-list__title">Reviews</h2>
      <ul className="review-list__items">
        {sorted.map((review) => {
          const asking = isChangesRequestedState(review.state);
          const body = (review.body_markdown ?? '').trim();
          const notes = [
            review.stale ? 'on an earlier head' : null,
            review.effective ? null : 'no longer counts',
          ].filter(Boolean);
          return (
            <li
              key={review.id}
              id={reviewAnchor(review.id)}
              className={`review-list__item${asking ? ' review-list__item--changes' : ''}`}
              data-testid={`pr-review-${review.id}`}
              data-target={review.id === target ? 'true' : undefined}
            >
              <details open={opened.has(review.id)}>
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
                    className="review-list__body"
                  />
                ) : (
                  <p className="review-list__empty">No comment with this review.</p>
                )}
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
