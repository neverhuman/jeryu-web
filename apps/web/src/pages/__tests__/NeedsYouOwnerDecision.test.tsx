// NeedsYouOwnerDecision.test.tsx — the one question only the owner can answer:
// Yes and No on the row, each confirmed first, each one call, and a server
// that predates the field (or sends a call this page will not make) leaving the
// row with its link instead of a button that answers nothing.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AttentionItem, AttentionResponse } from '../../api/types';
import { NeedsYouPage } from '../needsYou';
import { ownerDecision } from '../needsYou/needsYouModel';
import { mockPipelineApi } from './pipelinePageHelpers';
import { attentionItem } from './pipelineTestData';
import { errorResponse, json, renderAt } from './shiftPageHelpers';

const DECIDE = '/api/v1/repos/acme/web/pulls/7/owner-decision';
const HEAD = '9c1f7b3d5e4a2c8b6d0f9e8a7b6c5d4e3f2a1b09';
const QUESTION = 'The quality score drops from 91 to 87 on this head. Land it anyway?';

function row(over: Partial<AttentionItem> = {}): AttentionItem {
  return attentionItem({
    id: 'pr-owner-decision:acme/web:7',
    kind: 'pr_needs_owner_decision',
    severity: 'action',
    title: 'acme/web#7 needs one decision from you',
    reason: `pr-redteam asked about acme/web#7 at 9c1f7b3d5e4a: ${QUESTION}`,
    since: '2026-10-14T09:00:00Z',
    repo: 'acme/web',
    pr: 7,
    sha: HEAD,
    href: '/repos/jeryu/acme/web/pulls/7',
    action: { label: 'Answer Yes or No', command: null },
    decision: {
      question: QUESTION,
      yes: {
        method: 'POST',
        path: DECIDE,
        body: { expected_head_sha: HEAD, decision: 'yes' },
        confirm: 'Record your Yes on this exact head? Nothing is merged by this click alone.',
      },
      no: {
        method: 'POST',
        path: DECIDE,
        body: { expected_head_sha: HEAD, decision: 'no' },
        confirm: 'Record your No on this exact head? The pull request waits for you.',
      },
    },
    ...over,
  });
}

function inbox(item: AttentionItem): AttentionResponse {
  return {
    schema_version: 'jeryu.attention/v1.6',
    generated_at: '2026-10-14T09:10:00Z',
    counts: { critical: 0, action: 1, watch: 0 },
    items: [item],
  };
}

function renderWith(item: AttentionItem, refuse = false): ReturnType<typeof mockPipelineApi> {
  const calls = mockPipelineApi((req) => {
    if (req.pathname === '/api/v1/attention') return json(inbox(item));
    if (req.pathname !== DECIDE) return undefined;
    return refuse
      ? errorResponse(403, 'only a forge admin records an owner decision')
      : json({ decision: 'yes' });
  });
  renderAt('/needs-you?view=all', '/needs-you', <NeedsYouPage />);
  return calls;
}

describe('an owner decision on /needs-you', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks one question with Yes and No, each confirmed, each one call', async () => {
    const calls = renderWith(row());
    const item = await screen.findByTestId('needs-you-item-pr-owner-decision:acme/web:7');
    // The question is on the row, and the kind reads as a sentence.
    expect(within(item).getByText(/Needs your decision · acme\/web#7/)).toBeInTheDocument();
    expect(within(item).getByText(new RegExp(QUESTION.slice(0, 30)))).toBeInTheDocument();
    expect(
      within(item).getByRole('link', { name: 'acme/web#7 needs one decision from you' })
    ).toHaveAttribute('href', '/repos/jeryu/acme/web/pulls/7');

    const no = within(item).getByRole('button', { name: `No: ${QUESTION}` });
    const yes = within(item).getByRole('button', { name: `Yes: ${QUESTION}` });

    // Nothing is sent before the confirm step, which is in the forge's words.
    fireEvent.click(no);
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(/Record your No on this exact head\?/)
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.pathname === DECIDE)).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'No' }));
    await waitFor(() => expect(calls.filter((call) => call.pathname === DECIDE)).toHaveLength(1));
    const sent = calls.find((call) => call.pathname === DECIDE);
    expect(sent?.method).toBe('POST');
    expect(sent?.body).toEqual({ expected_head_sha: HEAD, decision: 'no' });
    // Every attempt carries its own key, so a double click is one decision.
    expect(sent?.headers['idempotency-key']).toBeTruthy();

    fireEvent.click(yes);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(calls.filter((call) => call.pathname === DECIDE)).toHaveLength(2));
    expect(calls.filter((call) => call.pathname === DECIDE)[1]?.body).toEqual({
      expected_head_sha: HEAD,
      decision: 'yes',
    });
  });

  it('words the forge refusal on the row', async () => {
    renderWith(row(), true);
    const item = await screen.findByTestId('needs-you-item-pr-owner-decision:acme/web:7');
    fireEvent.click(within(item).getByRole('button', { name: `Yes: ${QUESTION}` }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes' }));
    expect(
      await within(item).findByText('only a forge admin records an owner decision')
    ).toBeInTheDocument();
  });

  it('falls back to the link when the question or a call is missing', async () => {
    // A server that predates `decision`: the row still says what it needs.
    renderWith(row({ decision: null, action: { label: 'Answer Yes or No', command: null } }));
    const item = await screen.findByTestId('needs-you-item-pr-owner-decision:acme/web:7');
    expect(within(item).queryByRole('button', { name: /^Yes/ })).toBeNull();
    expect(
      within(item).getByRole('link', { name: `Answer Yes or No: acme/web#7 needs one decision from you` })
    ).toBeInTheDocument();
  });

  it('refuses a decision whose calls are not same-origin API writes', () => {
    const offsite = row({
      decision: {
        question: QUESTION,
        yes: { method: 'POST', path: 'https://elsewhere.invalid/decide' },
        no: { method: 'POST', path: DECIDE },
      },
    });
    expect(ownerDecision(offsite)).toBeNull();
    const read = row({
      decision: {
        question: QUESTION,
        yes: { method: 'GET', path: DECIDE },
        no: { method: 'POST', path: DECIDE },
      },
    });
    expect(ownerDecision(read)).toBeNull();
    // A question of nothing but spaces is no question.
    expect(ownerDecision(row({ decision: { ...row().decision!, question: '  ' } }))).toBeNull();
    // And the whole thing, read as this page will act on it.
    expect(ownerDecision(row())?.yes).toEqual({
      label: 'Yes',
      method: 'POST',
      path: DECIDE,
      body: { expected_head_sha: HEAD, decision: 'yes' },
      confirm: 'Record your Yes on this exact head? Nothing is merged by this click alone.',
    });
  });
});

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { login: 'operator', role: 'admin' } }) }));
