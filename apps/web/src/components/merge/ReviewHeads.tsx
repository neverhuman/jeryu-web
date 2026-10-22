// ReviewHeads.tsx — where the review stands, one line per head, newest first.
//
// The current head's line is the one in force: `Reviewing since …`, `Hold`,
// `Approved` or `Not reviewed yet`. Every line below it is a verdict on a head
// that has been replaced, greyed and marked `on an earlier head`, so a reader
// who remembers a hold can see at a glance that it was answered by a push.

import { When } from '../../format/When';
import type { PullDetailPayload, PullReviewActivity } from '../../api/types';
import { reviewAnchor } from './reviewListModel';
import { reviewHeadLine, reviewHeads, type ReviewHeadRow } from './reviewHeadsModel';

import './merge.css';

export interface ReviewHeadsProps {
  detail: Pick<PullDetailPayload, 'summary' | 'reviews'> & {
    review_activity?: PullReviewActivity | null;
  };
  /** The Conversation tab, for the `#review-<id>` link of a verdict. */
  conversationHref?: string;
}

export function ReviewHeads({
  detail,
  conversationHref,
}: ReviewHeadsProps): JSX.Element | null {
  const rows = reviewHeads(detail);
  if (rows.length === 0) return null;
  return (
    <section
      className="review-heads"
      aria-label="Review by head"
      data-testid="pr-review-heads"
    >
      <h2 className="review-heads__title">Review by head</h2>
      <ul className="review-heads__items">
        {rows.map((row) => (
          <li
            key={row.sha}
            className={`review-heads__item${row.current ? '' : ' review-heads__item--stale'}`}
            data-testid={`pr-review-head-${row.shortSha}`}
            data-state={row.state}
            data-stale={row.current ? undefined : 'true'}
            aria-label={`${row.shortSha}: ${reviewHeadLine(row)}`}
          >
            <code className="review-heads__sha">{row.shortSha}</code>
            <span className="review-heads__state">{stateText(row, conversationHref)}</span>
            {row.note ? (
              <span className="review-heads__note">{row.note}</span>
            ) : (
              <span className="review-heads__note">current head</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function stateText(
  row: ReviewHeadRow,
  conversationHref: string | undefined
): JSX.Element {
  if (row.state === 'reviewing') {
    return (
      <>
        {row.label} since <When at={row.since} label="Review started" />
      </>
    );
  }
  if (row.reviewId && conversationHref) {
    return (
      <a href={`${conversationHref}#${reviewAnchor(row.reviewId)}`}>{row.label}</a>
    );
  }
  return <>{row.label}</>;
}
