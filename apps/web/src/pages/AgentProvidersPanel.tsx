// AgentProvidersPanel.tsx — Settings: connect Claude, Codex, or Grok once.
//
// Every agent session and runner started afterwards reaches the provider
// through the control-plane gateway with this connection; the secret is sealed
// in the server's vault and never comes back to the browser. The secret field
// is cleared as soon as the request is sent, success or not.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { apiDelete, apiGet, apiSend } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  AgentProvider,
  ConnectProviderRequest,
  CredentialKind,
  ProviderConnection,
  ProviderConnectionList,
} from '../api/types/providerConnections';
import { ActionButton } from '../components/action/ActionButton';
import { ErrorState, LoadingState } from '../components/state';
import { dateText } from '../format/when';
import { PROVIDERS, providerLabel } from './providerNames';
import { ProviderSignIn } from './ProviderSignIn';

const PROVIDER_CONNECTIONS_KEY: readonly string[] = ['me', 'provider-connections'];

const KINDS: { value: CredentialKind; label: string }[] = [
  { value: 'api_key', label: 'API key' },
  { value: 'oauth_refresh', label: 'Subscription refresh token' },
];

/** A connection's state as its owner needs to read it. */
function ConnectionStatePill({ state }: { state: string }): JSX.Element {
  if (state === 'auth_required') {
    return (
      <span
        className="page__pill page__pill--warning"
        title="A refresh could not confirm the credential, so it is no longer used. Connect it again."
      >
        Sign in again
      </span>
    );
  }
  if (state === 'connected') {
    return <span className="page__pill page__pill--success">Connected</span>;
  }
  return <span className="page__pill">{state}</span>;
}

export function AgentProvidersPanel(): JSX.Element {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: PROVIDER_CONNECTIONS_KEY,
    queryFn: ({ signal }) =>
      apiGet<ProviderConnectionList>(endpoints.providerConnections(), { signal }),
  });
  const [provider, setProvider] = useState<AgentProvider>('claude');
  const [account, setAccount] = useState('');
  const [kind, setKind] = useState<CredentialKind>('api_key');
  const [secret, setSecret] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: PROVIDER_CONNECTIONS_KEY });
  // The secret never becomes mutation state: React Query keeps a mutation's
  // variables after it settles, so the request reads the secret from this ref
  // once, clears it, and the variables carry only the non-secret fields.
  const pendingSecret = useRef('');
  const connect = useMutation({
    mutationFn: (meta: Omit<ConnectProviderRequest, 'secret'>) => {
      const request: ConnectProviderRequest = { ...meta, secret: pendingSecret.current };
      pendingSecret.current = '';
      return apiSend<ProviderConnection>(endpoints.providerConnections(), request);
    },
    gcTime: 0,
    onSettled: () => {
      setSecret('');
      return refresh();
    },
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => apiDelete(endpoints.providerConnection(id)),
    onSettled: () => {
      setConfirming(null);
      return refresh();
    },
  });
  // A connection that needs a new sign-in stays listed, so its owner sees it
  // rather than finding it gone.
  const connections = (list.data?.connections ?? []).filter(
    (connection) => connection.state === 'connected' || connection.state === 'auth_required'
  );
  const ready = account.trim() !== '' && secret.trim() !== '' && !connect.isPending;

  return (
    <section className="page__section" aria-labelledby="agent-providers-title" id="agent-providers">
      <h2 className="page__section-title" id="agent-providers-title">
        Agent providers
      </h2>
      <p className="page__subtitle">
        Connect a provider once for managed agent sessions. The secret is kept in the server vault
        and never shown again; managed sessions reach the provider through the JeRyu gateway rather
        than with a copy of it.
      </p>
      {list.isPending ? (
        <LoadingState title="Loading provider connections..." variant="message" />
      ) : list.error ? (
        <ErrorState title="Could not load provider connections" error={list.error} />
      ) : connections.length === 0 ? (
        <p className="page__roadmap-note" data-testid="agent-providers-empty">
          No provider is connected yet. Agent sessions will ask you to connect one here.
        </p>
      ) : (
        <div className="page__card">
          <div className="table-scroll">
            <table className="admin-users__table" data-testid="agent-providers-table">
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">Account</th>
                  <th scope="col">Credential</th>
                  <th scope="col">State</th>
                  <th scope="col">Updated</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {connections.map((connection) => (
                  <tr key={connection.id}>
                    <th scope="row">{providerLabel(connection.provider)}</th>
                    <td>{connection.provider_account}</td>
                    <td>
                      <span className="page__pill">
                        {connection.credential_kind === 'api_key' ? 'API key' : 'Subscription'}
                      </span>
                    </td>
                    <td>
                      <ConnectionStatePill state={connection.state} />
                    </td>
                    <td>{dateText(connection.updated_at)}</td>
                    <td className="admin-users__actions">
                      {confirming === connection.id ? (
                        <>
                          <ActionButton
                            actionId="providers.disconnect"
                            variant="human"
                            disabled={disconnect.isPending}
                            onClick={() => disconnect.mutate(connection.id)}
                          >
                            Confirm disconnect
                          </ActionButton>
                          <ActionButton variant="default" onClick={() => setConfirming(null)}>
                            Keep
                          </ActionButton>
                        </>
                      ) : (
                        <ActionButton
                          variant="default"
                          aria-label={`Disconnect ${providerLabel(connection.provider)} ${connection.provider_account}`}
                          onClick={() => setConfirming(connection.id)}
                        >
                          Disconnect
                        </ActionButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {confirming ? (
            <p className="page__roadmap-note" role="status">
              Disconnecting stops every running session that uses this connection at once.
            </p>
          ) : null}
        </div>
      )}
      <ProviderSignIn onConnected={refresh} />
      <form
        className="page__card"
        aria-label="Connect a provider"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          pendingSecret.current = secret;
          connect.mutate({
            provider,
            provider_account: account.trim(),
            credential_kind: kind,
          });
        }}
      >
        <div className="page__inline-actions">
          <label className="admin-wiki__field">
            Provider
            <select
              value={provider}
              onChange={(event) => {
                const chosen = PROVIDERS.find((entry) => entry.value === event.currentTarget.value);
                if (chosen) setProvider(chosen.value);
              }}
            >
              {PROVIDERS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-wiki__field">
            Account label
            <input
              value={account}
              placeholder="team-key"
              maxLength={128}
              onChange={(event) => setAccount(event.currentTarget.value)}
            />
          </label>
          <label className="admin-wiki__field">
            Credential
            <select
              value={kind}
              onChange={(event) => {
                const chosen = KINDS.find((entry) => entry.value === event.currentTarget.value);
                if (chosen) setKind(chosen.value);
              }}
            >
              {KINDS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-wiki__field">
            Secret
            <input
              type="password"
              value={secret}
              autoComplete="new-password"
              spellCheck={false}
              onChange={(event) => setSecret(event.currentTarget.value)}
            />
          </label>
        </div>
        {kind === 'oauth_refresh' ? (
          <p className="page__roadmap-note">
            Subscription connections are stored now and switched on once the provider&apos;s
            token exchange is qualified; until then sessions use an API key connection.
          </p>
        ) : null}
        <div className="page__inline-actions">
          <ActionButton
            type="submit"
            actionId="providers.connect"
            variant="primary"
            disabled={!ready}
          >
            Connect
          </ActionButton>
          {connect.isSuccess ? (
            <span className="page__pill page__pill--success" role="status">
              Connected {providerLabel(connect.data.provider)}
            </span>
          ) : null}
        </div>
        {connect.error ? (
          <ErrorState title="Could not connect the provider" error={connect.error} />
        ) : null}
        {disconnect.error ? (
          <ErrorState title="Could not disconnect the provider" error={disconnect.error} />
        ) : null}
      </form>
    </section>
  );
}
