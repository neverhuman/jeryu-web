// MergeBox.test.tsx — the one box that says where the merge stands.
//
// What it owes the reader:
//   1. One headline, and the verdict said nowhere else on the page.
//   2. A checklist row per thing the merge waits for, linking to its tab.
//   3. The exact head SHA the reviewer saw carried into `onApprove`
//      (§35.1.7), with Merge offered only once the Passport and
//      `mergeable.can_merge` both allow it.
//   4. An author's own Approve disabled, naming who has to approve instead,
//      and a server refusal shown with its next step.
//   5. Close as a quiet button that asks before it turns red, with the
//      comment field appearing only once it has been asked for.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { MergeBox, type MergeBoxProps } from '../MergeBox';
import { approveRefusal } from '../pullReviewModel';
import {
  approvalRow,
  HEAD_SHA,
  pullChecks,
  pullDetail,
} from '../../../test/fixtures/pullRequest';

const HREFS = {
  threads: '/pulls/32#pr-threads',
  checks: '/pulls/32/checks',
  commits: '/pulls/32/commits',
};

function show(over: Partial<MergeBoxProps> = {}): {
  onApprove: ReturnType<typeof vi.fn>;
  onMerge: ReturnType<typeof vi.fn>;
  onSetState: ReturnType<typeof vi.fn>;
} {
  const onApprove = vi.fn();
  const onMerge = vi.fn();
  const onSetState = vi.fn();
  render(
    <MemoryRouter>
      <MergeBox
        detail={pullDetail()}
        checks={pullChecks({ requiredFailing: true })}
        hrefs={HREFS}
        viewer={{ login: '@red-team', permissions: ['pr.write'] }}
        viewerLogin="@red-team"
        onApprove={onApprove}
        onMerge={onMerge}
        onSetState={onSetState}
        {...over}
      />
    </MemoryRouter>
  );
  return { onApprove, onMerge, onSetState };
}

/** Every element whose own words say the merge is held up. */
function blockedStatements(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('body *'))
    .filter((node) =>
      Array.from(node.childNodes).some(
        (child) =>
          child.nodeType === Node.TEXT_NODE &&
          /\bblocked\b/i.test(child.textContent ?? '')
      )
    )
    .map((node) => node.textContent ?? '');
}

describe('MergeBox', () => {
  it('states the verdict once, with a checklist of what is waiting', () => {
    show();
    expect(screen.getByTestId('pr-merge-headline')).toHaveTextContent(
      'Blocked: 2 things need doing'
    );
    expect(blockedStatements()).toHaveLength(1);

    const checklist = screen.getByTestId('pr-merge-checklist');
    expect(within(checklist).getAllByRole('listitem')).toHaveLength(4);
    expect(
      within(screen.getByTestId('pr-merge-row-approvals')).getByRole('link')
    ).toHaveAttribute('href', HREFS.commits);
    expect(
      within(screen.getByTestId('pr-merge-row-checks')).getByRole('link')
    ).toHaveAttribute('href', HREFS.checks);
  });

  it('carries the full head SHA into onApprove', async () => {
    const { onApprove } = show();
    const button = screen.getByRole('button', {
      name: `Approve exact SHA ${HEAD_SHA.slice(0, 7)}`,
    });
    await userEvent.click(button);
    expect(onApprove).toHaveBeenCalledWith(HEAD_SHA);
  });

  it('offers Merge, Squash and Rebase only once the merge is allowed', async () => {
    const detail = pullDetail({
      passport: 'pass',
      approvals: 1,
      required_approvals: 1,
      reviews: [approvalRow()],
    });
    const { onMerge } = show({ detail, checks: pullChecks() });
    expect(screen.getByTestId('pr-merge-headline')).toHaveTextContent(
      'Ready to merge'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));
    await userEvent.click(screen.getByRole('button', { name: 'Squash' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rebase' }));
    expect(onMerge.mock.calls.map(([input]) => input.method)).toEqual([
      'merge',
      'squash',
      'rebase',
    ]);
    expect(onMerge).toHaveBeenLastCalledWith({
      expectedHeadSha: HEAD_SHA,
      expectedPassportHash: 'hash-1',
      method: 'rebase',
    });
  });

  it('withholds Merge while the Passport has not cleared the head', () => {
    show();
    expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Squash' })).toBeNull();
  });

  it('disables every action while a mutation is in flight', () => {
    show({ isBusy: true, onRequestChanges: vi.fn() });
    for (const name of [/Approve exact SHA/, /Request changes/]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('submits a trimmed request-changes body', async () => {
    const onRequestChanges = vi.fn();
    show({ onRequestChanges });
    await userEvent.click(screen.getByRole('button', { name: /Request changes/ }));
    await userEvent.type(
      screen.getByLabelText('Requested changes'),
      '  the error is swallowed  '
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onRequestChanges).toHaveBeenCalledWith(
      HEAD_SHA,
      'the error is swallowed'
    );
  });

  it('disables the author’s own Approve and names who has to approve', () => {
    show({
      detail: pullDetail({ author: '@dana' }),
      viewerLogin: '@dana',
      viewer: { login: '@dana', permissions: [] },
    });
    expect(screen.getByRole('button', { name: /Approve exact SHA/ })).toBeDisabled();
    expect(screen.getByTestId('pr-approve-note')).toHaveTextContent(
      'You opened this pull request, so you cannot approve it.'
    );
  });

  it('shows a refused approval with the step that clears it', () => {
    show({
      approveRefusal: approveRefusal(
        {
          code: 'pull_self_approval_forbidden',
          message: 'authors cannot approve their own changes',
          status: 403,
          details: { author: '@dana', reviewer: '@dana' },
        },
        pullDetail()
      ),
    });
    const refusal = screen.getByTestId('pr-approve-error');
    expect(refusal).toHaveAttribute('role', 'alert');
    expect(refusal).toHaveTextContent('authors cannot approve their own changes');
    expect(refusal).toHaveTextContent('independent authenticated reviewer');
  });

  it('carries the Ready for review button on the draft row', async () => {
    const onSetDraft = vi.fn();
    show({
      detail: pullDetail({ draft: true, author: '@dana' }),
      viewerLogin: '@dana',
      viewerRole: 'user',
      viewer: { login: '@dana', permissions: [] },
      onSetDraft,
    });
    const row = screen.getByTestId('pr-merge-row-draft');
    expect(row).toHaveAttribute('data-state', 'needed');
    await userEvent.click(within(row).getByTestId('pr-ready-for-review'));
    expect(onSetDraft).toHaveBeenCalledWith(false);
  });

  it('asks before it turns red, and posts the comment with the close', async () => {
    const { onSetState } = show();
    // Nothing red, and no comment field, until the reader asks to close.
    expect(screen.queryByLabelText('Closing comment')).toBeNull();
    const ask = screen.getByTestId('pr-close');
    expect(ask.className).toContain('action-button--ghost');
    expect(ask.className).not.toContain('action-button--danger');

    await userEvent.click(ask);
    await userEvent.type(
      screen.getByLabelText('Closing comment'),
      'Superseded by #33.'
    );
    const confirm = screen.getByTestId('pr-close-confirm');
    expect(confirm.className).toContain('action-button--danger');
    await userEvent.click(confirm);
    expect(onSetState).toHaveBeenCalledWith({
      state: 'closed',
      comment: 'Superseded by #33.',
    });
  });

  it('closes with no comment when the field is left empty', async () => {
    const { onSetState } = show();
    await userEvent.click(screen.getByTestId('pr-close'));
    await userEvent.click(screen.getByTestId('pr-close-confirm'));
    expect(onSetState).toHaveBeenCalledWith({ state: 'closed', comment: null });
  });

  it('offers Reopen without a comment field on a closed pull request', async () => {
    const { onSetState } = show({ detail: pullDetail({ state: 'closed' }) });
    expect(screen.queryByLabelText('Closing comment')).toBeNull();
    await userEvent.click(screen.getByTestId('pr-reopen'));
    expect(onSetState).toHaveBeenCalledWith({ state: 'open', comment: null });
  });

  it('shows a settled pull request as one calm line, with no merge controls', () => {
    show({
      detail: pullDetail({ state: 'merged', approvals: 1, required_approvals: 1 }),
    });
    expect(screen.getByTestId('pr-merge-headline')).toHaveTextContent('Merged');
    expect(screen.getByText(/Merged into main\. Nothing is waiting/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve exact SHA/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull();
    expect(screen.queryByTestId('pr-close')).toBeNull();
    expect(screen.queryByTestId('pr-reopen')).toBeNull();
    expect(blockedStatements()).toHaveLength(0);
  });

  it('offers neither Close nor Reopen to a viewer who may not settle it', () => {
    show({ viewer: { login: '@stranger', permissions: [] } });
    expect(screen.queryByTestId('pr-close')).toBeNull();
    expect(screen.queryByTestId('pr-reopen')).toBeNull();
  });

  it('shows the server refusals verbatim', () => {
    show({
      mergeError: 'main requires linear history',
      closeError: 'you cannot close this pull request',
    });
    expect(screen.getByTestId('pr-merge-error')).toHaveTextContent(
      'Merge refused: main requires linear history'
    );
    expect(screen.getByTestId('pr-close-error')).toHaveTextContent(
      'Close refused: you cannot close this pull request'
    );
  });
});
