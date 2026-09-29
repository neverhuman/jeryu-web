// PullCloseControls.test.tsx — what Close / Reopen shows, and what it sends.
//
//   1. An open pull request shows Close with the optional comment box; the
//      comment travels with the request only when the reviewer typed one.
//   2. A closed, unmerged pull request shows Reopen and no comment box.
//   3. A merged pull request shows nothing, and neither does a viewer who may
//      not close it.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PullRequestDetail } from '../../../api/types';
import { PullCloseControls } from '../PullCloseControls';

const SHA = 'abcdef1234567890abcdef1234567890abcdef12';

function makeDetail(state: 'open' | 'closed' | 'merged'): PullRequestDetail {
  return {
    summary: {
      repo: { id: 'r1', host: 'jeryu', owner: 'veox-ai', name: 'ai-veox-app' },
      number: 8,
      entity: { kind: 'pull_request', id: 'r1#8' },
      title: 'Stale shift work',
      author: '@author',
      head_ref: 'shift/stale',
      base_ref: 'main',
      head_sha: SHA,
      base_sha: SHA,
      state,
      draft: false,
      mergeable: {
        level: 'blocked',
        can_merge: false,
        reason: null,
        exact_head_sha: SHA,
        required_gate: null,
      },
      review: {
        required_approvals: 1,
        approvals: 0,
        changes_requested: 0,
        unresolved_threads: 0,
        user_review_state: null,
      },
      checks: { total: 0, passing: 0, failing: 0, pending: 0, skipped: 0 },
      agents: {
        active_sessions: 0,
        proposed_patches: 0,
        evidence_packets: 0,
        blockers: 0,
      },
      labels: [],
      updated_at: '2026-09-28T20:57:00Z',
      passport_hash: null,
      available_actions: [],
    },
    description: null,
    head_tree_sha: null,
    base_tree_sha: null,
    reviews: [],
    merge_passport: {
      status: 'blocked',
      head_sha: SHA,
      blockers: [],
      evaluated_at: '2026-09-28T20:57:00Z',
    },
    passport_hash: null,
  };
}

const AUTHOR = { login: '@author', permissions: [] as string[] };

describe('PullCloseControls', () => {
  it('closes an open pull request, with the typed comment', async () => {
    const onSetState = vi.fn();
    render(
      <PullCloseControls
        detail={makeDetail('open')}
        viewer={AUTHOR}
        onSetState={onSetState}
      />
    );
    await userEvent.type(
      screen.getByLabelText('Closing comment'),
      '  superseded by #13  '
    );
    await userEvent.click(screen.getByRole('button', { name: /Close pull request/ }));
    expect(onSetState).toHaveBeenCalledWith({
      state: 'closed',
      comment: 'superseded by #13',
    });
  });

  it('sends no comment when the box is left empty', async () => {
    const onSetState = vi.fn();
    render(
      <PullCloseControls
        detail={makeDetail('open')}
        viewer={AUTHOR}
        onSetState={onSetState}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Close pull request/ }));
    expect(onSetState).toHaveBeenCalledWith({ state: 'closed', comment: null });
  });

  it('offers Reopen, without a comment box, on a closed pull request', async () => {
    const onSetState = vi.fn();
    render(
      <PullCloseControls
        detail={makeDetail('closed')}
        viewer={AUTHOR}
        onSetState={onSetState}
      />
    );
    expect(screen.queryByLabelText('Closing comment')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Reopen pull request/ }));
    expect(onSetState).toHaveBeenCalledWith({ state: 'open', comment: null });
  });

  it('shows nothing on a merged pull request or to a viewer who may not close', () => {
    const { container: merged } = render(
      <PullCloseControls
        detail={makeDetail('merged')}
        viewer={AUTHOR}
        onSetState={vi.fn()}
      />
    );
    expect(merged).toBeEmptyDOMElement();

    const { container: bystander } = render(
      <PullCloseControls
        detail={makeDetail('open')}
        viewer={{ login: '@someone', permissions: ['pr.read'] }}
        onSetState={vi.fn()}
      />
    );
    expect(bystander).toBeEmptyDOMElement();
  });

  it('shows the server refusal verbatim and disables the button while busy', () => {
    render(
      <PullCloseControls
        detail={makeDetail('open')}
        viewer={AUTHOR}
        onSetState={vi.fn()}
        isBusy
        error="pull request is locked"
      />
    );
    expect(screen.getByTestId('pr-close-error')).toHaveTextContent(
      'Close refused: pull request is locked'
    );
    expect(screen.getByRole('button', { name: /Close pull request/ })).toBeDisabled();
  });
});
