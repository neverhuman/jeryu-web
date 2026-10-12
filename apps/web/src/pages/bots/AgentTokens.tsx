// AgentTokens.tsx — one bot's scoped agent tokens on the account Bots page.
//
// Create is the only response that carries the token. It lives in this
// component's state until the panel is dismissed or the page is left: never in
// the query cache, browser storage or the address. The create mutation keeps
// no finished result around (gcTime 0) and is reset on dismiss.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { apiGet, apiSend } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import type {
  BotAccessTokenCreateRequest,
  BotAccessTokenListResponse,
  BotAccessTokenReceipt,
  BotAccessTokenSummary,
  BotSummary,
} from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { CopyCommand } from '../../components/shellCommand/CopyCommand';
import { ErrorState, LoadingState } from '../../components/state';
import { When } from '../../format/When';
import {
  TOKEN_LABEL_MAX_CHARS,
  TOKEN_ONCE_WARNING,
  TOKEN_REACH_NOTE,
  TOKEN_TTL_DEFAULT_DAYS,
  TOKEN_TTL_MAX_DAYS,
  TOKEN_TTL_MIN_DAYS,
  agentTokenSnippets,
  agentTokenStatus,
  agentTokenStatusLabel,
  parseTtlDays,
  kindLabel,
  statusLabel,
} from './botModel';

function agentTokensKey(botId: string): string[] {
  return ['account-bot-tokens', botId];
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `bot-token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AgentTokens({ bot }: { bot: BotSummary }): JSX.Element {
  const queryClient = useQueryClient();
  const headingId = useId();
  const [issued, setIssued] = useState<BotAccessTokenReceipt | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const tokensKey = agentTokensKey(bot.id);

  const list = useQuery({
    queryKey: tokensKey,
    queryFn: ({ signal }) =>
      apiGet<BotAccessTokenListResponse>(endpoints.botTokens(bot.id), { signal }),
    staleTime: 10_000,
    retry: false,
  });

  const create = useMutation({
    mutationFn: (body: BotAccessTokenCreateRequest) =>
      apiSend<BotAccessTokenReceipt>(endpoints.botTokens(bot.id), body, {
        idempotencyKey: newIdempotencyKey(),
      }),
    gcTime: 0,
    onSuccess: (receipt) => {
      setIssued(receipt);
      void queryClient.invalidateQueries({ queryKey: tokensKey });
    },
  });

  const revoke = useMutation({
    mutationFn: (tokenId: string) =>
      apiSend<BotAccessTokenSummary>(endpoints.botTokenRevoke(bot.id, tokenId)),
    onSuccess: (revoked) => {
      setConfirming(null);
      queryClient.setQueryData<BotAccessTokenListResponse>(tokensKey, (current) => ({
        tokens: (current?.tokens ?? []).map((row) =>
          row.token_id === revoked.token_id ? revoked : row
        ),
      }));
      void queryClient.invalidateQueries({ queryKey: tokensKey });
    },
  });

  function dismiss(): void {
    setIssued(null);
    create.reset();
  }

  const canIssue = bot.status === 'active';
  const state = statusLabel(bot.status).toLowerCase();
  const kind = kindLabel(bot.kind);
  const disabledReason = `A ${state} ${kind} cannot get new tokens.`;
  const tokens = list.data?.tokens ?? [];

  return (
    <section
      className="page__card agent-tokens"
      aria-labelledby={headingId}
      data-testid="agent-tokens"
      data-bot-id={bot.id}
    >
      <h3 className="agent-tokens__title" id={headingId}>
        Tokens for {bot.display_name}
        <span className="enroll-table__slug">{bot.slug}</span>
      </h3>

      {issued ? <IssuedToken receipt={issued} onDismiss={dismiss} /> : null}

      {list.isPending ? (
        <LoadingState variant="message" title="Loading agent tokens." />
      ) : list.isError ? (
        <ErrorState
          title="Could not load agent tokens."
          error={list.error}
          onRetry={() => void list.refetch()}
          testId="agent-token-list-error"
        />
      ) : tokens.length === 0 ? (
        <p className="enroll-form__note">No agent tokens yet.</p>
      ) : (
        <div className="enroll-table-wrap table-scroll">
          <table className="enroll-table" data-testid="agent-token-list">
            <thead>
              <tr>
                <th scope="col">Label</th>
                <th scope="col">Created</th>
                <th scope="col">Expires</th>
                <th scope="col">Last used</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => {
                const status = agentTokenStatus(token);
                const name = token.label && token.label !== '' ? token.label : 'Unlabelled token';
                return (
                  <tr key={token.token_id} data-testid="agent-token-row">
                    <th scope="row">
                      <span className="enroll-table__name">{name}</span>
                    </th>
                    <td>
                      <When at={token.created_at} label="Created" />
                    </td>
                    <td>
                      <When at={token.expires_at} label="Expires" />
                    </td>
                    <td>
                      <When at={token.last_used_at} label="Last used" fallback="Never" />
                    </td>
                    <td data-testid="agent-token-status">{agentTokenStatusLabel(status)}</td>
                    <td className="enroll-table__actions">
                      {confirming === token.token_id ? (
                        <ConfirmRevoke
                          name={name}
                          pending={revoke.isPending}
                          onConfirm={() => revoke.mutate(token.token_id)}
                          onCancel={() => {
                            setConfirming(null);
                            revoke.reset();
                          }}
                        />
                      ) : (
                        <ActionButton
                          type="button"
                          data-testid="agent-token-revoke"
                          aria-label={`Revoke ${name}`}
                          disabled={status !== 'active' || revoke.isPending}
                          onClick={() => {
                            revoke.reset();
                            setConfirming(token.token_id);
                          }}
                        >
                          Revoke
                        </ActionButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {revoke.isError ? (
        <ErrorState
          title="Could not revoke the token."
          error={revoke.error}
          testId="agent-token-revoke-error"
        />
      ) : null}

      <NewTokenForm
        botName={bot.display_name}
        disabledReason={canIssue ? null : disabledReason}
        pending={create.isPending}
        createError={create.error}
        onCreate={(body) => create.mutate(body)}
      />
    </section>
  );
}

/**
 * The in-page question before a revoke. Focus lands on Cancel, the safe
 * answer, so Enter right after Revoke does not end the token.
 */
function ConfirmRevoke({
  name,
  pending,
  onConfirm,
  onCancel,
}: {
  name: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    groupRef.current?.querySelector<HTMLButtonElement>('[data-confirm-cancel]')?.focus();
  }, []);

  return (
    <div
      className="agent-tokens__confirm"
      role="group"
      aria-label={`Confirm revoking ${name}`}
      data-testid="agent-token-confirm"
      ref={groupRef}
    >
      <span>Revoke {name}? Agents using it stop at once.</span>
      <div className="enroll-actions">
        <ActionButton
          type="button"
          variant="human"
          data-testid="agent-token-revoke-confirm"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? 'Revoking…' : 'Revoke token'}
        </ActionButton>
        <ActionButton type="button" data-confirm-cancel="" disabled={pending} onClick={onCancel}>
          Cancel
        </ActionButton>
      </div>
    </div>
  );
}

function IssuedToken({
  receipt,
  onDismiss,
}: {
  receipt: BotAccessTokenReceipt;
  onDismiss: () => void;
}): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Move focus to the panel once it appears, so a keyboard or screen reader
  // lands on the token and the warning rather than on the form below.
  useEffect(() => {
    panelRef.current?.focus();
  }, [receipt.token_id]);

  const snippets = agentTokenSnippets(window.location.origin, receipt.token);

  return (
    <div
      className="enroll-setup agent-tokens__issued"
      data-testid="agent-token-issued"
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-labelledby={titleId}
    >
      <h4 className="agent-tokens__issued-title" id={titleId}>
        New agent token{receipt.label ? `: ${receipt.label}` : ''}
      </h4>
      <p className="enroll-form__error" data-testid="agent-token-once">
        {TOKEN_ONCE_WARNING}
      </p>
      <div className="agent-tokens__copy" data-testid="agent-token-value">
        <CopyCommand command={receipt.token} label="agent token" />
      </div>
      <p className="enroll-form__note">
        Expires <When at={receipt.expires_at} label="Expires" />. {TOKEN_REACH_NOTE}
      </p>
      {snippets.map((snippet) => (
        <div className="agent-tokens__snippet" key={snippet.id} data-testid={`agent-token-snippet-${snippet.id}`}>
          <span className="agent-tokens__snippet-title">{snippet.title}</span>
          <CopyCommand command={snippet.text} label={`${snippet.title} setup`} />
        </div>
      ))}
      <p className="enroll-form__note">
        For gh, set <code>GH_TOKEN</code> to the token; for git over HTTPS, use the token
        for the password.
      </p>
      <div className="page__inline-actions">
        <ActionButton type="button" onClick={onDismiss} data-testid="agent-token-dismiss">
          I have copied it, dismiss
        </ActionButton>
      </div>
    </div>
  );
}

function NewTokenForm({
  botName,
  disabledReason,
  pending,
  createError,
  onCreate,
}: {
  botName: string;
  disabledReason: string | null;
  pending: boolean;
  createError: unknown;
  onCreate: (body: BotAccessTokenCreateRequest) => void;
}): JSX.Element {
  const [label, setLabel] = useState('');
  const [days, setDays] = useState(String(TOKEN_TTL_DEFAULT_DAYS));
  const [formError, setFormError] = useState<string | null>(null);
  const disabled = pending || disabledReason !== null;

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const ttl = parseTtlDays(days);
    if (ttl.days === null) {
      setFormError(ttl.error);
      return;
    }
    setFormError(null);
    const trimmed = label.trim();
    const body: BotAccessTokenCreateRequest = { ttl_days: ttl.days };
    if (trimmed !== '') body.label = trimmed;
    onCreate(body);
    setLabel('');
  }

  return (
    <form
      className="enroll-form agent-tokens__form"
      data-testid="agent-token-form"
      aria-label={`New agent token for ${botName}`}
      noValidate
      onSubmit={onSubmit}
    >
      <div className="enroll-form__grid">
        <label className="enroll-form__field">
          Label (optional)
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={TOKEN_LABEL_MAX_CHARS}
            autoComplete="off"
            disabled={disabled}
          />
        </label>
        <label className="enroll-form__field">
          Days valid
          <input
            type="number"
            inputMode="numeric"
            min={TOKEN_TTL_MIN_DAYS}
            max={TOKEN_TTL_MAX_DAYS}
            step={1}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            disabled={disabled}
          />
        </label>
      </div>
      {disabledReason ? (
        <p className="enroll-form__note" data-testid="agent-token-disabled">
          {disabledReason}
        </p>
      ) : null}
      {formError ? (
        <p className="enroll-form__error" role="alert">
          {formError}
        </p>
      ) : null}
      {createError ? (
        <ErrorState
          title="Could not create the token."
          error={createError}
          testId="agent-token-create-error"
        />
      ) : null}
      <div className="page__inline-actions">
        <ActionButton type="submit" variant="primary" disabled={disabled}>
          {pending ? 'Creating…' : 'Create token'}
        </ActionButton>
      </div>
    </form>
  );
}
