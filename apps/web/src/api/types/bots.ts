// bots.ts — account Grokbot and Musebot wire types.
//
// The shape is jeryu_core::model bot JSON. Reach is serde internally tagged
// on `mode`. Timestamps are RFC3339 or null. Uuid fields are strings.
// Hand-written beside the other API types. Do not copy these into
// contracts/generated.

/** One repository a reach names. */
export interface BotRepoRef {
  owner: string;
  name: string;
}

export type BotKind = 'grok' | 'muse';

export type BotStatus = 'active' | 'suspended' | 'revoked';

export type BotTaskKind = 'issue' | 'pull' | 'branch';

export type BotReach =
  | { mode: 'general' }
  | { mode: 'repositories'; repos: BotRepoRef[] }
  | {
      mode: 'task';
      repo: BotRepoRef;
      task_kind: BotTaskKind;
      task_id: string;
    };

/** One account enrollment, as `GET /api/v1/bots` and the repo roster return it. */
export interface BotSummary {
  id: string;
  owner: string;
  slug: string;
  display_name: string;
  kind: BotKind;
  status: BotStatus;
  reach: BotReach;
  credential_generation: number;
  last_successful_access: string | null;
  last_auth: string | null;
  last_mutation: string | null;
  last_heartbeat: string | null;
  last_action: string | null;
  last_outcome: string | null;
  last_repo: string | null;
  created_at: string | null;
}

export interface BotListResponse {
  bots: BotSummary[];
}

/** `POST /api/v1/bots` and `POST /api/v1/bots/:id/keys`. */
export interface BotCreateRequest {
  slug: string;
  display_name: string;
  kind: BotKind;
  reach: BotReach;
}

/**
 * Returned only by create and key rotation. The key is not stored on
 * `BotSummary`, and a later read must not invent one.
 */
export interface BotEnrollmentReceipt {
  bot: BotSummary;
  key_id: string;
  enrollment_key: string;
  setup_script: string;
}

/** `POST /api/v1/bots/:id/tokens`. Both fields are optional; the server defaults to 90 days. */
export interface BotAccessTokenCreateRequest {
  label?: string;
  ttl_days?: number;
}

/**
 * Returned only by `POST /api/v1/bots/:id/tokens`, with status 201. `token`
 * starts with `jat_` and is never returned again: a list or a later read
 * carries `token_id` only.
 */
export interface BotAccessTokenReceipt {
  bot: BotSummary;
  token_id: string;
  token: string;
  label: string | null;
  created_at: string;
  expires_at: string;
}

/** One row of `GET /api/v1/bots/:id/tokens`, and the revoke answer. Never the token. */
export interface BotAccessTokenSummary {
  token_id: string;
  bot_id: string;
  label: string | null;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface BotAccessTokenListResponse {
  tokens: BotAccessTokenSummary[];
}

/** `GET /api/v1/repos/:id/bot-activity`. The roster does not render this. */
export interface BotActivityResponse {
  events: unknown[];
}
