// providerConnections.ts — the connect-once API's wire shapes. A connection
// never carries its secret; the server seals it in the vault.

export type AgentProvider = 'claude' | 'codex' | 'grok';
export type CredentialKind = 'api_key' | 'oauth_refresh';

export interface ProviderConnection {
  id: string;
  owner_id: string;
  provider: AgentProvider;
  provider_account: string;
  credential_kind: CredentialKind;
  /** `auth_required`: the stored credential may no longer work; sign in again. */
  state: 'pending' | 'connected' | 'auth_required' | 'disconnected' | string;
  connection_generation: number;
  secret_version: number;
  created_at: string;
  updated_at: string;
  refreshed_at: string | null;
}

export interface ProviderConnectionList {
  connections: ProviderConnection[];
}

/** Open a sign-in at the provider (the device authorization grant). */
export interface ProviderLoginRequest {
  provider: AgentProvider;
  provider_account: string;
}

/** A sign-in as its owner reads it. The user code and the page are present
 * only while it is pending; `connection` once it is connected. */
export interface ProviderLogin {
  login_id: string;
  provider: AgentProvider;
  provider_account: string;
  state: 'pending' | 'connected' | 'denied' | 'expired' | 'failed' | 'cancelled' | string;
  /** Seconds between reads that ask the provider. */
  interval: number;
  expires_at: string;
  user_code?: string;
  verification_uri?: string;
  verification_uri_complete?: string;
  connection?: ProviderConnection;
  reason?: string;
}

export interface ConnectProviderRequest {
  provider: AgentProvider;
  provider_account: string;
  credential_kind: CredentialKind;
  secret: string;
}
