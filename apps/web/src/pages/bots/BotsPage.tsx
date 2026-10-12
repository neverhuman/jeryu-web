// BotsPage.tsx — the signed-in account's Grokbot and Musebot enrollments.
//
// Create and rotate are the only responses that carry an enrollment key.
// The key stays in component state until it is hidden or the page is left.
// A later visit does not invent one. The same holds for each bot's agent
// tokens below the list (AgentTokens.tsx): shown once, on create.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import { apiGet, apiSend } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import type {
  BotCreateRequest,
  BotEnrollmentReceipt,
  BotKind,
  BotListResponse,
  BotSummary,
  BotTaskKind,
} from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { ErrorState, LoadingState } from '../../components/state';
import { When } from '../../format/When';
import { usePageTitle } from '../../hooks/usePageTitle';
import { AgentTokens } from './AgentTokens';
import { BotKindBadge } from './BotKindBadge';
import {
  GENERAL_REACH_NOTE,
  SETUP_WARNING,
  accountReachSummary,
  isBotKind,
  isReachChoice,
  isTaskKind,
  oneTaskChoiceLabel,
  parseOwnerName,
  reachFromChoice,
  statusLabel,
  taskIdFieldLabel,
  taskKindFieldLabel,
  type ReachChoice,
} from './botModel';

import '../page.css';
import './BotsPage.css';

const ACCOUNT_BOTS_KEY = ['account-bots'] as const;

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `bot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function upsertBot(
  queryClient: ReturnType<typeof useQueryClient>,
  bot: BotSummary
): void {
  queryClient.setQueryData<BotListResponse>(ACCOUNT_BOTS_KEY, (current) => {
    const bots = current?.bots ?? [];
    const exists = bots.some((row) => row.id === bot.id);
    return {
      bots: exists ? bots.map((row) => (row.id === bot.id ? bot : row)) : [bot, ...bots],
    };
  });
}

export function BotsPage(): JSX.Element {
  usePageTitle('Grokbot and Musebot');
  const [params] = useSearchParams();
  const presetRepo = params.get('repo');
  const queryClient = useQueryClient();
  const [receipt, setReceipt] = useState<BotEnrollmentReceipt | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const list = useQuery({
    queryKey: ACCOUNT_BOTS_KEY,
    queryFn: ({ signal }) => apiGet<BotListResponse>(endpoints.bots(), { signal }),
    staleTime: 10_000,
    retry: false,
  });

  const create = useMutation({
    mutationFn: (body: BotCreateRequest) =>
      apiSend<BotEnrollmentReceipt>(endpoints.bots(), body, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: (created) => {
      setReceipt(created);
      setActionError(null);
      upsertBot(queryClient, created.bot);
      void queryClient.invalidateQueries({ queryKey: ACCOUNT_BOTS_KEY });
    },
  });

  const rotate = useMutation({
    mutationFn: (id: string) =>
      apiSend<BotEnrollmentReceipt>(endpoints.botKeys(id), undefined, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: (rotated) => {
      setReceipt(rotated);
      setActionError(null);
      upsertBot(queryClient, rotated.bot);
      void queryClient.invalidateQueries({ queryKey: ACCOUNT_BOTS_KEY });
    },
    onError: (error) => setActionError(error),
  });

  const suspend = useMutation({
    mutationFn: (id: string) => apiSend<BotSummary>(endpoints.botSuspend(id)),
    onSuccess: (bot) => {
      setActionError(null);
      upsertBot(queryClient, bot);
      void queryClient.invalidateQueries({ queryKey: ACCOUNT_BOTS_KEY });
    },
    onError: (error) => setActionError(error),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiSend<BotSummary>(endpoints.botRevoke(id)),
    onSuccess: (bot) => {
      setActionError(null);
      upsertBot(queryClient, bot);
      void queryClient.invalidateQueries({ queryKey: ACCOUNT_BOTS_KEY });
    },
    onError: (error) => setActionError(error),
  });

  function hideReceipt(): void {
    setReceipt(null);
    create.reset();
    rotate.reset();
  }

  function busy(id: string): boolean {
    return (
      (suspend.isPending && suspend.variables === id) ||
      (revoke.isPending && revoke.variables === id) ||
      (rotate.isPending && rotate.variables === id)
    );
  }

  const bots = list.data?.bots ?? [];

  return (
    <div className="page" data-testid="enroll-page">
      <header className="page__header">
        <h1 className="page__title">Grokbot and Musebot</h1>
        <p className="page__subtitle">
          Add one on your account and choose what it can reach. The enrollment
          key is shown once, when you create it or rotate it.
        </p>
      </header>

      {receipt ? (
        <section className="page__card enroll-setup" data-testid="bot-setup" aria-live="polite">
          <h2 className="page__card-title">Enrollment</h2>
          <p className="enroll-form__note" data-testid="bot-setup-warning">
            {SETUP_WARNING}
          </p>
          <h3 id="bot-key-label">Enrollment key</h3>
          <pre className="enroll-setup__secret" aria-labelledby="bot-key-label">
            {receipt.enrollment_key}
          </pre>
          <h3 id="bot-script-label">Setup script</h3>
          <pre className="enroll-setup__secret" aria-labelledby="bot-script-label">
            {receipt.setup_script}
          </pre>
          <div className="page__inline-actions">
            <ActionButton type="button" onClick={hideReceipt}>
              Hide this key
            </ActionButton>
          </div>
        </section>
      ) : null}

      <BotForm
        key={presetRepo ?? ''}
        preset={parseOwnerName(presetRepo)}
        pending={create.isPending}
        createError={create.error}
        onCreate={(body) => create.mutate(body)}
      />

      <section className="page__section" aria-labelledby="account-bots" data-testid="bot-list">
        <h2 className="page__section-title" id="account-bots">
          On this account
        </h2>
        {actionError ? (
          <ErrorState title="Could not update it." error={actionError} testId="bot-action-error" />
        ) : null}
        {list.isPending ? (
          <LoadingState variant="message" title="Loading Grokbot and Musebot." />
        ) : list.isError ? (
          <ErrorState
            title="Could not load Grokbot or Musebot."
            error={list.error}
            onRetry={() => void list.refetch()}
            testId="bot-list-error"
          />
        ) : bots.length === 0 ? (
          <p className="enroll-form__note">No Grokbot or Musebot on this account yet.</p>
        ) : (
          <div className="enroll-table-wrap table-scroll">
            <table className="enroll-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Reach</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last successful access</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {bots.map((enrollment) => {
                  const revoked = enrollment.status === 'revoked';
                  const rowBusy = busy(enrollment.id);
                  return (
                    <tr key={enrollment.id}>
                      <th scope="row">
                        <span className="enroll-table__name">{enrollment.display_name}</span>
                        <span className="enroll-table__slug">{enrollment.slug}</span>
                      </th>
                      <td>
                        <BotKindBadge kind={enrollment.kind} />
                      </td>
                      <td>{accountReachSummary(enrollment.reach)}</td>
                      <td>{statusLabel(enrollment.status)}</td>
                      <td>
                        <When
                          at={enrollment.last_successful_access}
                          label="Last successful access"
                        />
                      </td>
                      <td className="enroll-table__actions">
                        <div className="enroll-actions">
                          <ActionButton
                            type="button"
                            data-testid="bot-suspend"
                            aria-label={`Suspend ${enrollment.display_name}`}
                            disabled={rowBusy || enrollment.status !== 'active'}
                            onClick={() => suspend.mutate(enrollment.id)}
                          >
                            Suspend
                          </ActionButton>
                          <ActionButton
                            type="button"
                            variant="human"
                            data-testid="bot-revoke"
                            aria-label={`Revoke ${enrollment.display_name}`}
                            disabled={rowBusy || revoked}
                            onClick={() => revoke.mutate(enrollment.id)}
                          >
                            Revoke
                          </ActionButton>
                          <ActionButton
                            type="button"
                            data-testid="bot-rotate"
                            aria-label={`Rotate ${enrollment.display_name}`}
                            disabled={rowBusy || revoked}
                            onClick={() => rotate.mutate(enrollment.id)}
                          >
                            Rotate
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {bots.length > 0 ? (
        <section
          className="page__section agent-tokens-section"
          aria-labelledby="agent-tokens"
          data-testid="agent-tokens-section"
        >
          <h2 className="page__section-title" id="agent-tokens">
            Agent tokens
          </h2>
          <p className="enroll-form__note">
            An agent token connects an agent with one URL and one token, on MCP, the REST API,
            gh and git. It acts for one Grokbot or Musebot: your rights, cut down to its reach. The
            token is shown once, when you create it.
          </p>
          {bots.map((enrollment) => (
            <AgentTokens key={enrollment.id} bot={enrollment} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function BotForm({
  preset,
  pending,
  createError,
  onCreate,
}: {
  preset: ReturnType<typeof parseOwnerName>;
  pending: boolean;
  createError: unknown;
  onCreate: (body: BotCreateRequest) => void;
}): JSX.Element {
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [kind, setKind] = useState<BotKind>('grok');
  const [choice, setChoice] = useState<ReachChoice>(preset ? 'repositories' : 'general');
  const [repoLines, setRepoLines] = useState(
    preset ? `${preset.owner}/${preset.name}` : ''
  );
  const [taskOwner, setTaskOwner] = useState(preset?.owner ?? '');
  const [taskName, setTaskName] = useState(preset?.name ?? '');
  const [taskKind, setTaskKind] = useState<BotTaskKind>('issue');
  const [taskId, setTaskId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const display_name = displayName.trim();
    const slugValue = slug.trim();
    if (display_name === '' || slugValue === '') {
      setFormError('Enter a display name and a slug.');
      return;
    }
    const built = reachFromChoice({
      choice,
      repoLines,
      taskOwner,
      taskName,
      taskKind,
      taskId,
    });
    if (built.reach === null) {
      setFormError(built.error);
      return;
    }
    setFormError(null);
    onCreate({ slug: slugValue, display_name, kind, reach: built.reach });
  }

  return (
    <form className="page__card enroll-form" data-testid="bot-form" onSubmit={onSubmit}>
      <h2 className="page__card-title">Add one</h2>
      <div className="enroll-form__grid">
        <label className="enroll-form__field">
          Display name
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="off"
            disabled={pending}
          />
        </label>
        <label className="enroll-form__field">
          Slug
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
          />
        </label>
        <label className="enroll-form__field">
          Kind
          <select
            data-testid="bot-kind-select"
            value={kind}
            disabled={pending}
            onChange={(event) => {
              if (isBotKind(event.target.value)) setKind(event.target.value);
            }}
          >
            <option value="grok">Grokbot</option>
            <option value="muse">Musebot</option>
          </select>
        </label>
        <label className="enroll-form__field">
          Reach
          <select
            data-testid="bot-reach-select"
            value={choice}
            disabled={pending}
            onChange={(event) => {
              if (isReachChoice(event.target.value)) setChoice(event.target.value);
            }}
          >
            <option value="general">General</option>
            <option value="repositories">Selected repositories</option>
            <option value="task">{oneTaskChoiceLabel()}</option>
          </select>
        </label>
        {choice === 'repositories' ? (
          <label className="enroll-form__field enroll-form__span">
            Repositories, one owner/name per line
            <textarea
              rows={4}
              value={repoLines}
              onChange={(event) => setRepoLines(event.target.value)}
              spellCheck={false}
              disabled={pending}
            />
          </label>
        ) : null}
        {choice === 'task' ? (
          <>
            <label className="enroll-form__field">
              Owner
              <input
                value={taskOwner}
                onChange={(event) => setTaskOwner(event.target.value)}
                autoComplete="off"
                disabled={pending}
              />
            </label>
            <label className="enroll-form__field">
              Name
              <input
                value={taskName}
                onChange={(event) => setTaskName(event.target.value)}
                autoComplete="off"
                disabled={pending}
              />
            </label>
            <label className="enroll-form__field">
              {taskKindFieldLabel()}
              <select
                value={taskKind}
                disabled={pending}
                onChange={(event) => {
                  if (isTaskKind(event.target.value)) setTaskKind(event.target.value);
                }}
              >
                <option value="issue">Issue</option>
                <option value="pull">Pull request</option>
                <option value="branch">Branch</option>
              </select>
            </label>
            <label className="enroll-form__field">
              {taskIdFieldLabel()}
              <input
                value={taskId}
                onChange={(event) => setTaskId(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={pending}
              />
            </label>
          </>
        ) : null}
      </div>
      <p className="enroll-form__note">{GENERAL_REACH_NOTE}</p>
      {formError ? (
        <p className="enroll-form__error" role="alert">
          {formError}
        </p>
      ) : null}
      {createError ? (
        <ErrorState title="Could not add it." error={createError} testId="bot-form-error" />
      ) : null}
      <div className="page__inline-actions">
        <ActionButton type="submit" variant="primary" disabled={pending}>
          {pending ? 'Adding…' : 'Add'}
        </ActionButton>
      </div>
    </form>
  );
}
