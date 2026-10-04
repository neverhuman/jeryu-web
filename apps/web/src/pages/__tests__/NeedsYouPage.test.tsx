// NeedsYouPage.test.tsx — the landing page: severity groups, the title link
// every row keeps, the copyable command, the button that makes the forge's own
// call, the empty state, and graceful degradation on an older server.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AttentionItem } from '../../api/types';
import { NeedsYouPage } from '../needsYou';
import { htmlShell, mockPipelineApi } from './pipelinePageHelpers';
import { ATTENTION, DEPLOY_COMMAND, DEPLOY_RUN_IN, attentionItem } from './pipelineTestData';
import { errorResponse, json, renderAt } from './shiftPageHelpers';

function renderPage(): void {
  renderAt('/needs-you', '/needs-you', <NeedsYouPage />);
}

describe('NeedsYouPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows red rows with one action each and folds watch rows behind a count', async () => {
    mockPipelineApi();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();

    const critical = await screen.findByTestId('needs-you-critical');
    expect(within(critical).getByText('No healthy worker slot for jain')).toBeInTheDocument();
    const action = screen.getByTestId('needs-you-action');

    // Off-site act: the command is the one action, and the title still leads
    // to the row's subject.
    const staged = within(action).getByTestId('needs-you-item-release_staged:jeryu/jeryu-deploy');
    expect(staged).toHaveClass('needs-you__row--danger');
    expect(within(staged).getByText(DEPLOY_COMMAND)).toBeInTheDocument();
    expect(
      within(staged).getByRole('link', { name: 'Release prod-20260919T130210Z-01dfe68-unsigned is staged' })
    ).toHaveAttribute('href', '/releases');
    // One act (the copy control) plus the family pill, which filters and never acts.
    expect(within(staged).getAllByRole('button')).toHaveLength(2);
    expect(within(staged).getByRole('button', { name: /^Show only / })).toBeInTheDocument();
    // Where comes before what: real text above the command, and the copy
    // button's description. Only the command reaches the clipboard.
    const where = within(staged).getByText(`Run on ${DEPLOY_RUN_IN}`);
    const commandText = within(staged).getByText(DEPLOY_COMMAND);
    expect(where.compareDocumentPosition(commandText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const copy = within(staged).getByRole('button', { name: /^Copy Deploy command for Release/ });
    expect(copy).toHaveAccessibleDescription(`Run on ${DEPLOY_RUN_IN}`);
    fireEvent.click(copy);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(DEPLOY_COMMAND);
    expect(await within(staged).findByText('Copied')).toBeInTheDocument();

    // In-app act: one link, a plain-language kind, one line of reason.
    const blocked = within(action).getByTestId('needs-you-item-todo-blocked:jeryu:20260919-130515-f8cc66');
    expect(within(blocked).getByText(/^Blocked todo · jeryu/)).toBeInTheDocument();
    expect(within(blocked).queryByText(/todo_blocked/)).toBeNull();
    expect(within(blocked).getByText('Both halves of this todo need jeryu-core changes.')).toBeInTheDocument();
    // Both the title and the act lead to the same place.
    expect(
      within(blocked)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'))
    ).toEqual([
      '/work/shift?family=jeryu&todo=20260919-130515-f8cc66',
      '/work/shift?family=jeryu&todo=20260919-130515-f8cc66',
    ]);
    expect(within(blocked).getByRole('link', { name: /^Open: Allow PATCH/ })).toBeInTheDocument();
    expect(within(blocked).getByRole('link', { name: 'Allow PATCH of repo default_branch' })).toBeInTheDocument();
    // The only button on the row itself is its family pill, which filters and
    // never acts; acknowledging the row waits inside its folded menu.
    const folded = blocked.querySelector('.needs-you__more');
    expect(folded).not.toHaveAttribute('open');
    expect(
      within(blocked)
        .getAllByRole('button')
        .filter((button) => !folded?.contains(button))
    ).toHaveLength(1);
    expect(within(blocked).getByRole('button', { name: 'Show only jeryu' })).toBeInTheDocument();

    // Watch rows are neutral and collapsed behind a count.
    const watch = screen.getByTestId('needs-you-watch');
    expect(watch).not.toHaveAttribute('open');
    expect(within(watch).getByText('1 thing worth a look, none waiting on you')).toBeInTheDocument();
    expect(watch.querySelector('.needs-you__row--neutral')).not.toBeNull();
    expect(watch.querySelector('.needs-you__row--danger')).toBeNull();
    expect(screen.queryByTestId('needs-you-pulse')).toBeNull();
  });

  it('says where a command runs: the server\'s place, else the repository, else nothing', async () => {
    const command = 'systemctl --user start jeryu-auto-pin.service';
    const row = (id: string, extra: Partial<AttentionItem>): AttentionItem =>
      attentionItem({ id, kind: 'pin_behind', title: id, href: '/unreleased', ...extra });
    mockPipelineApi((req) => {
      if (req.pathname !== '/api/v1/attention') return undefined;
      return json({
        schema_version: 'jeryu.attention/v1',
        generated_at: '2026-09-20T09:00:00Z',
        counts: { critical: 0, action: 4, watch: 0 },
        items: [
          row('placed', {
            repo: 'jeryu/jeryu-deploy',
            action: { label: 'Run auto-pin now', command, run_in: 'xbabe0, any directory' },
          }),
          // An older server: no `run_in`, so the repository is the only hint.
          row('older-server', {
            repo: 'jeryu/jeryu-deploy',
            action: { label: 'Bump the pin', command },
          }),
          row('blank-place', {
            repo: 'jeryu/jeryu-deploy',
            action: { label: 'Bump the pin', command, run_in: '  ' },
          }),
          row('no-hint', { action: { label: 'Check the timers', command, run_in: null } }),
        ],
      });
    });
    renderPage();

    const placed = await screen.findByTestId('needs-you-item-placed');
    expect(within(placed).getByTestId('copy-command-where')).toHaveTextContent(
      /^Run on xbabe0, any directory$/
    );
    expect(within(placed).getByRole('button', { name: /^Copy Run auto-pin now command/ })).toHaveAccessibleDescription(
      'Run on xbabe0, any directory'
    );

    for (const id of ['older-server', 'blank-place']) {
      const fallback = screen.getByTestId(`needs-you-item-${id}`);
      expect(within(fallback).getByTestId('copy-command-where')).toHaveTextContent(
        /^Run in a checkout of jeryu\/jeryu-deploy$/
      );
    }

    const bare = screen.getByTestId('needs-you-item-no-hint');
    expect(within(bare).getByText(command)).toBeInTheDocument();
    expect(within(bare).queryByTestId('copy-command-where')).toBeNull();
    expect(within(bare).queryByText(/^Run (on|in) /)).toBeNull();
    expect(within(bare).getByRole('button', { name: /^Copy Check the timers command/ })).not.toHaveAttribute(
      'aria-describedby'
    );

    // Still one act per row: the where-line added no button, and the row's
    // only link is its title.
    for (const id of ['placed', 'older-server', 'blank-place', 'no-hint']) {
      const each = screen.getByTestId(`needs-you-item-${id}`);
      expect(within(each).getAllByRole('link')).toHaveLength(1);
      expect(within(each).getByRole('link', { name: id })).toHaveAttribute('href', '/unreleased');
      expect(within(each).getAllByRole('button')).toHaveLength(2);
    }
  });

  it('shows a stale pin as one action with its bump command, and as a folded watch row once a bump PR is open', async () => {
    const BUMP = 'scripts/release/build-web-dist.sh --commit 427bebecb848d7b7bb37ecc71521d7461072694d /tmp/web-dist';
    mockPipelineApi((req) => {
      if (req.pathname !== '/api/v1/attention') return undefined;
      return json({
        schema_version: 1,
        generated_at: '2026-09-19T15:00:00Z',
        counts: { critical: 0, action: 1, watch: 1 },
        items: [
          attentionItem({
            id: 'pin-behind:jeryu/jeryu-deploy:jeryu/jeryu-web',
            kind: 'pin_behind',
            severity: 'action',
            title: "9 merged commits of jeryu-web are not in jeryu-deploy's pin",
            reason: 'A release ships what is pinned; jeryu-web main is green.',
            repo: 'jeryu/jeryu-deploy',
            href: '/unreleased?repo=jeryu%2Fjeryu-deploy',
            action: { label: 'Bump the pin', command: BUMP },
          }),
          attentionItem({
            id: 'pin-behind:veox/jain-deploy:veox/jain-web',
            kind: 'pin_behind',
            severity: 'watch',
            title: "2 merged commits of jain-web are not in jain-deploy's pin",
            reason: 'Bump PR #80 is open.',
            repo: 'veox/jain-deploy',
            href: '/repos/jeryu/veox/jain-deploy/pulls/80',
            action: { label: 'Open the bump PR', command: null },
          }),
        ],
      });
    });
    renderPage();

    const action = await screen.findByTestId('needs-you-action');
    const stale = within(action).getByTestId('needs-you-item-pin-behind:jeryu/jeryu-deploy:jeryu/jeryu-web');
    expect(within(stale).getByText(/^Merged, not pinned for release · jeryu\/jeryu-deploy/)).toBeInTheDocument();
    expect(within(stale).queryByText(/pin_behind/)).toBeNull();
    expect(within(stale).getByText(BUMP)).toBeInTheDocument();
    expect(within(stale).getAllByRole('link')).toHaveLength(1);
    expect(
      within(stale).getByRole('link', { name: /^9 merged commits of jeryu-web/ })
    ).toHaveAttribute('href', '/unreleased?repo=jeryu%2Fjeryu-deploy');
    expect(within(stale).getAllByRole('button')).toHaveLength(2);

    const watch = screen.getByTestId('needs-you-watch');
    expect(watch).not.toHaveAttribute('open');
    const bumping = within(watch).getByTestId('needs-you-item-pin-behind:veox/jain-deploy:veox/jain-web');
    expect(bumping).toHaveClass('needs-you__row--neutral');
    expect(within(bumping).getByRole('link', { name: /^Open the bump PR/ })).toHaveAttribute(
      'href',
      '/repos/jeryu/veox/jain-deploy/pulls/80'
    );
  });

  it("runs the row's own call once, with an Idempotency-Key, and words a refusal in place", async () => {
    const QUEUE_PATH = '/api/v1/repos/jeryu:acme%2Fweb/pulls/7/queue';
    const row = (over: Partial<AttentionItem>): AttentionItem =>
      attentionItem({
        id: 'queue_failed:acme/web:7',
        kind: 'queue_failed',
        title: 'acme/web#7 failed in the merge queue',
        reason: 'The queue gate failed twice on the same commit.',
        next_step: 'Queue again: open /repos/jeryu/acme/web/pulls/7',
        repo: 'acme/web',
        pr: 7,
        href: '/repos/jeryu/acme/web/pulls/7',
        action: {
          label: 'Queue again',
          command: null,
          api: { path: QUEUE_PATH, confirm: 'Queue acme/web#7 again on its current head?' },
        },
        ...over,
      });
    let refuse = true;
    const calls = mockPipelineApi((req) => {
      if (req.pathname === '/api/v1/attention') {
        return json({
          schema_version: 'jeryu.attention/v1',
          generated_at: '2026-10-01T09:00:00Z',
          counts: { critical: 0, action: 1, watch: 0 },
          items: [row({})],
        });
      }
      if (req.pathname !== QUEUE_PATH) return undefined;
      return refuse
        ? errorResponse(403, 'enqueueing needs write access to the repository')
        : json({ number: 7, state: 'building' });
    });
    renderPage();

    const failed = await screen.findByTestId('needs-you-item-queue_failed:acme/web:7');
    // The next step is the row's second line; the longer reason is its tooltip.
    const detail = within(failed).getByText('Queue again: open /repos/jeryu/acme/web/pulls/7');
    expect(detail).toHaveAttribute('title', 'The queue gate failed twice on the same commit.');
    // One act, plus the family pill; the title still leads to the pull request.
    expect(within(failed).getAllByRole('button')).toHaveLength(2);
    expect(
      within(failed).getByRole('link', { name: 'acme/web#7 failed in the merge queue' })
    ).toHaveAttribute('href', '/repos/jeryu/acme/web/pulls/7');
    const run = within(failed).getByRole('button', {
      name: 'Queue again: acme/web#7 failed in the merge queue',
    });

    // The act is confirmed first, in the server's own words.
    fireEvent.click(run);
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText('Queue acme/web#7 again on its current head?')
    ).toBeInTheDocument();
    expect(calls.filter((c) => c.pathname === QUEUE_PATH)).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Queue again' }));

    // Exactly one POST, carrying its own Idempotency-Key.
    await waitFor(() =>
      expect(calls.filter((c) => c.pathname === QUEUE_PATH)).toHaveLength(1)
    );
    const post = calls.find((c) => c.pathname === QUEUE_PATH);
    expect(post?.method).toBe('POST');
    expect(post?.headers['idempotency-key']).toBeTruthy();

    // The forge's refusal is worded on the row itself.
    expect(
      await within(failed).findByText('enqueueing needs write access to the repository')
    ).toBeInTheDocument();

    // Asked again, it is one more call and no more: a fresh key per attempt.
    refuse = false;
    fireEvent.click(run);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Queue again' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.pathname === QUEUE_PATH)).toHaveLength(2)
    );
    const keys = calls
      .filter((c) => c.pathname === QUEUE_PATH)
      .map((c) => c.headers['idempotency-key']);
    expect(new Set(keys).size).toBe(2);
    await waitFor(() =>
      expect(
        within(failed).queryByText('enqueueing needs write access to the repository')
      ).toBeNull()
    );
  });

  it('acknowledges a row about a todo until an instant it sends as RFC 3339', async () => {
    const calls = mockPipelineApi((req) =>
      req.method === 'POST' ? json({ ok: true }) : undefined
    );
    renderPage();
    const blocked = await screen.findByTestId(
      'needs-you-item-todo-blocked:jeryu:20260919-130515-f8cc66'
    );
    fireEvent.click(within(blocked).getByText('More'));
    fireEvent.change(
      within(blocked).getByLabelText('Acknowledge 20260919-130515-f8cc66 until'),
      { target: { value: '2026-10-05T09:30' } }
    );
    fireEvent.click(within(blocked).getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1));
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.pathname).toBe(
      '/api/v1/shift/todos/jeryu/20260919-130515-f8cc66/action'
    );
    expect(post?.body).toEqual({
      action: 'acknowledge',
      until: `${new Date('2026-10-05T09:30').toISOString().slice(0, 19)}Z`,
    });
    // A row about a release names no todo, so it is not acknowledged from here.
    const staged = screen.getByTestId('needs-you-item-release_staged:jeryu/jeryu-deploy');
    expect(within(staged).queryByText('More')).toBeNull();
  });

  it('filters to one family from the pill on a row, and back from the strip', async () => {
    mockPipelineApi();
    renderPage();
    const blocked = await screen.findByTestId(
      'needs-you-item-todo-blocked:jeryu:20260919-130515-f8cc66'
    );
    // Every row wears its family at the far left; the strip counts what waits on a person.
    const strip = screen.getByRole('group', { name: 'Filter by family' });
    expect(within(strip).getByRole('button', { name: /^All 3$/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(strip).getByRole('button', { name: /^jeryu 1$/ })).toBeInTheDocument();
    expect(within(strip).getByRole('button', { name: /^jain 1$/ })).toBeInTheDocument();
    // No family and no known repository family: the forge itself, listed last.
    expect(within(strip).getAllByRole('button').at(-1)).toHaveTextContent(/^forge 1$/);

    fireEvent.click(within(blocked).getByRole('button', { name: 'Show only jeryu' }));
    expect(screen.queryByTestId('needs-you-item-workers_down:jain')).toBeNull();
    expect(screen.queryByTestId('needs-you-item-release_staged:jeryu/jeryu-deploy')).toBeNull();
    expect(
      screen.getByTestId('needs-you-item-todo-blocked:jeryu:20260919-130515-f8cc66')
    ).toBeInTheDocument();
    expect(within(strip).getByRole('button', { name: /^jeryu 1$/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Pressing the same pill again, or All, shows every family.
    fireEvent.click(within(strip).getByRole('button', { name: /^All 3$/ }));
    expect(screen.getByTestId('needs-you-item-workers_down:jain')).toBeInTheDocument();
  });

  it('says nothing needs you in one sentence, with a line about what the system is doing', async () => {
    mockPipelineApi((req) => {
      if (req.pathname === '/api/v1/attention') {
        return json({
          schema_version: 1,
          generated_at: '2026-09-19T13:15:00Z',
          items: [],
          counts: { critical: 0, action: 0, watch: 0 },
          some_future_field: true,
        });
      }
      if (req.pathname === '/api/v1/shift/workers') {
        return json({
          generated_at: 'x',
          workers: [
            { operator: 'alton', host: 'xbabe0', slot: 'w1', family: 'jeryu', state: 'working', last_seen: 'x', healthy: true },
            { operator: 'alton', host: 'xbabe0', slot: 'w2', family: 'jeryu', state: 'idle', last_seen: 'x', healthy: true },
          ],
        });
      }
      return undefined;
    });
    renderPage();
    expect(await screen.findByText('Nothing needs you.')).toBeInTheDocument();
    const pulse = await screen.findByTestId('needs-you-pulse');
    await waitFor(() => expect(pulse).toHaveTextContent('1 of 2 worker slots busy'));
    await waitFor(() => expect(pulse).toHaveTextContent(/last event .*: Staged prod-20260919T130210Z/));
    // Runners are unmocked (404): that part is simply left out.
    expect(pulse).not.toHaveTextContent('gate runners');
    expect(within(pulse).getByRole('link', { name: 'Activity' })).toHaveAttribute('href', '/activity');
  });

  it('stays calm when only watch rows exist', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/attention'
        ? json({
            generated_at: '2026-09-19T13:15:00Z',
            items: [ATTENTION.items[3]],
            counts: { critical: 0, action: 0, watch: 1 },
          })
        : undefined
    );
    renderPage();
    expect(await screen.findByText('Nothing needs you.')).toBeInTheDocument();
    expect(screen.getByTestId('needs-you-watch')).toBeInTheDocument();
  });

  it.each([
    ['a 404', () => errorResponse(404, 'no route')],
    ['the SPA shell', () => htmlShell()],
  ])('degrades to "not available" when the server answers with %s', async (_name, response) => {
    mockPipelineApi((req) => (req.pathname === '/api/v1/attention' ? response() : undefined));
    renderPage();
    expect(await screen.findByText('Not available on this server version.')).toBeInTheDocument();
  });

  it('explains admin-only on a 403 and surfaces other errors', async () => {
    mockPipelineApi((req) => (req.pathname === '/api/v1/attention' ? errorResponse(403, 'admin only') : undefined));
    renderPage();
    expect(await screen.findByText('Only admins can see the Needs you list.')).toBeInTheDocument();
  });
});
