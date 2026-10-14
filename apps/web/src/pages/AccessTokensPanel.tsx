// AccessTokensPanel.tsx — Settings: personal access tokens for the CLI and MCP.
//
// A token is how `jeryu` on a terminal and an MCP client act as you. The
// secret comes back exactly once, in the create answer; it is moved into this
// panel's own state at once and the mutation is reset, so the query client
// never keeps it. "Done" forgets it. Revoking a token also ends any terminal
// attached with it.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { apiDelete, apiGet, apiSend } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  AccessTokenSummary,
  CreateAccessTokenRequest,
  CreatedAccessToken,
} from '../api/types/accessTokens';
import { ActionButton } from '../components/action/ActionButton';
import { ErrorState, LoadingState } from '../components/state';
import { dateText } from '../format/when';

const ACCESS_TOKENS_KEY: readonly string[] = ['me', 'access-tokens'];

const LIFETIMES: { days: number; label: string }[] = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function AccessTokensPanel(): JSX.Element {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ACCESS_TOKENS_KEY,
    queryFn: ({ signal }) => apiGet<AccessTokenSummary[]>(endpoints.authTokens(), { signal }),
  });
  const [name, setName] = useState('');
  const [days, setDays] = useState(90);
  const [created, setCreated] = useState<{ name: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ACCESS_TOKENS_KEY });
  const create = useMutation({
    mutationFn: (request: CreateAccessTokenRequest) =>
      apiSend<CreatedAccessToken>(endpoints.authTokens(), request),
    gcTime: 0,
    onSuccess: (token) => {
      setCreated({ name: token.name, secret: token.token });
      setCopied(false);
      setName('');
    },
    onSettled: () => refresh(),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiDelete(endpoints.authToken(id)),
    onSettled: () => {
      setConfirming(null);
      return refresh();
    },
  });
  const tokens = list.data ?? [];
  const ready = name.trim() !== '' && !create.isPending;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  return (
    <section className="page__section" aria-labelledby="access-tokens-title" id="access-tokens">
      <h2 className="page__section-title" id="access-tokens-title">
        Access tokens
      </h2>
      <p className="page__subtitle">
        A token lets the <code>jeryu</code> CLI and MCP clients act as you. Keep it in a file only
        you can read and point <code>JERYU_TOKEN_FILE</code> at it, with{' '}
        <code>JERYU_API_URL={origin}</code>. Revoking a token ends every terminal attached with it.
      </p>
      {created ? (
        <div className="page__card" data-testid="access-token-created">
          <label className="admin-wiki__field">
            New token &ldquo;{created.name}&rdquo;: copy it now, it is not shown again
            <input
              readOnly
              value={created.secret}
              spellCheck={false}
              autoComplete="off"
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <div className="page__inline-actions">
            <ActionButton
              variant="default"
              onClick={() => {
                void navigator.clipboard?.writeText(created.secret).then(() => setCopied(true));
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </ActionButton>
            <ActionButton variant="default" onClick={() => setCreated(null)}>
              Done
            </ActionButton>
          </div>
        </div>
      ) : null}
      {list.isPending ? (
        <LoadingState title="Loading access tokens..." variant="message" />
      ) : list.error ? (
        <ErrorState title="Could not load access tokens" error={list.error} />
      ) : tokens.length === 0 ? (
        <p className="page__roadmap-note" data-testid="access-tokens-empty">
          No access tokens yet.
        </p>
      ) : (
        <div className="page__card">
          <div className="table-scroll">
            <table className="admin-users__table" data-testid="access-tokens-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Created</th>
                  <th scope="col">Expires</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id}>
                    <th scope="row">{token.name}</th>
                    <td>{dateText(token.createdAt)}</td>
                    <td>{token.expiresAt ? dateText(token.expiresAt) : 'Never'}</td>
                    <td className="admin-users__actions">
                      {confirming === token.id ? (
                        <>
                          <ActionButton
                            actionId="tokens.revoke"
                            variant="human"
                            disabled={revoke.isPending}
                            onClick={() => revoke.mutate(token.id)}
                          >
                            Confirm revoke
                          </ActionButton>
                          <ActionButton variant="default" onClick={() => setConfirming(null)}>
                            Keep
                          </ActionButton>
                        </>
                      ) : (
                        <ActionButton
                          variant="default"
                          aria-label={`Revoke ${token.name}`}
                          onClick={() => setConfirming(token.id)}
                        >
                          Revoke
                        </ActionButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <form
        className="page__card"
        aria-label="Create an access token"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          create.mutate(
            {
              name: name.trim(),
              expiresAt: new Date(Date.now() + days * DAY_MS).toISOString(),
            },
            // The answer holds the secret: once the panel has it, the
            // mutation forgets it (an error stays, to be shown).
            { onSuccess: () => create.reset() }
          );
        }}
      >
        <div className="page__inline-actions">
          <label className="admin-wiki__field">
            <span>
              Token name <span aria-hidden="true">*</span>
            </span>
            <input
              value={name}
              required
              aria-required="true"
              aria-describedby={ready || create.isPending ? undefined : 'token-create-hint'}
              placeholder="e.g. laptop CLI"
              maxLength={64}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </label>
          <label className="admin-wiki__field">
            Expires after
            <select value={days} onChange={(event) => setDays(Number(event.currentTarget.value))}>
              {LIFETIMES.map((entry) => (
                <option key={entry.days} value={entry.days}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="page__inline-actions">
          <ActionButton type="submit" actionId="tokens.create" variant="primary" disabled={!ready}>
            Create token
          </ActionButton>
          {name.trim() === '' ? (
            <span className="page__note" id="token-create-hint">
              Enter a token name to create a token.
            </span>
          ) : null}
        </div>
        {create.error ? <ErrorState title="Could not create the token" error={create.error} /> : null}
        {revoke.error ? <ErrorState title="Could not revoke the token" error={revoke.error} /> : null}
      </form>
    </section>
  );
}
