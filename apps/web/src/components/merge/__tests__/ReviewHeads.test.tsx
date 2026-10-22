// ReviewHeads.test.tsx — the review panel, one line per head.
//
// What it owes the reader: the current head's state first, said in words, and
// every older verdict visibly stale. A hold answered by a push must not read
// like the verdict in force (live: jeryu/jeryu-ci-runner#109 held at 91beebd
// and already re-read at edd08c5).

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PullRequestReview } from '../../../api/types';
import { ReviewHeads } from '../ReviewHeads';
import { HEAD_SHA, pullDetail } from '../../../test/fixtures/pullRequest';

const OLD_HEAD = '91beebd9f2f4b1c3d5e7a9b1c3d5e7a9b1c3d5e7';

const HELD: PullRequestReview = {
  id: 'rv-1',
  author: 'pr-redteam',
  state: 'changes_requested',
  body_markdown: 'Round 2 of 4.',
  submitted_at: '2026-10-22T18:11:00Z',
  head_sha: OLD_HEAD,
  dismissed_review_id: null,
  effective: false,
  stale: true,
};

function row(shortSha: string): HTMLElement {
  return screen.getByTestId(`pr-review-head-${shortSha}`);
}

describe('ReviewHeads', () => {
  it('shows one line per head, newest first, with the current head in force', () => {
    render(
      <ReviewHeads
        detail={{
          ...pullDetail({ reviews: [HELD] }),
          review_activity: { sha: HEAD_SHA, started_at: '2026-10-22T18:44:12Z' },
        }}
        conversationHref="/pulls/32"
      />
    );
    const items = within(screen.getByTestId('pr-review-heads')).getAllByRole(
      'listitem'
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute(
      'data-testid',
      `pr-review-head-${HEAD_SHA.slice(0, 7)}`
    );

    const current = row(HEAD_SHA.slice(0, 7));
    expect(current).toHaveAttribute('data-state', 'reviewing');
    expect(current).not.toHaveAttribute('data-stale');
    expect(current).toHaveTextContent('Reviewing since');
    expect(current).toHaveTextContent('current head');
  });

  // The whole point of the panel: the old verdict is readable and visibly
  // not the answer.
  it('renders an older verdict as stale, named as an earlier head', () => {
    render(
      <ReviewHeads
        detail={{
          ...pullDetail({ reviews: [HELD] }),
          review_activity: { sha: HEAD_SHA, started_at: '2026-10-22T18:44:12Z' },
        }}
        conversationHref="/pulls/32"
      />
    );
    const stale = row('91beebd');
    expect(stale).toHaveAttribute('data-stale', 'true');
    expect(stale.className).toContain('review-heads__item--stale');
    expect(stale).toHaveTextContent('Hold');
    expect(stale).toHaveTextContent('on an earlier head');
    expect(within(stale).getByRole('link')).toHaveAttribute(
      'href',
      '/pulls/32#review-rv-1'
    );
  });

  it('says a head nothing has reviewed is not reviewed yet', () => {
    render(<ReviewHeads detail={pullDetail()} />);
    const current = row(HEAD_SHA.slice(0, 7));
    expect(current).toHaveAttribute('data-state', 'none');
    expect(current).toHaveTextContent('Not reviewed yet');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
