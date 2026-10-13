// bots.ts — account agent enrollment wire types.
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

/**
 * Free text matching `^[a-z][a-z0-9-]{0,31}$`; the server defaults it to
 * "agent". `grok` and `muse` read as Grokbot and Musebot. An older server
 * only knows those two, so a page must still render any other string.
 */
export type BotKind = string;

export type BotStatus = 'active' | 'suspended' | 'revoked';

export type BotTaskKind = 'issue' | 'pull' | 'branch';

export type BotReach =
  | { mode: 'general' }
  | { mode: 'repositories'; repos: BotRepoRef[] }
  /** Every repository under these owners the account can reach, later ones too. 1 to 20 owners. */
  | { mode: 'owners'; owners: string[] }
  | {
      mode: 'task';
      repo: BotRepoRef;
      task_kind: BotTaskKind;
      task_id: string;
    };

/** A person's own bot, or an organization's team bot (ADR 0008). */
export type BotOwnerKind = 'user' | 'organization';

/** One account enrollment, as `GET /api/v1/bots` and the repo roster return it. */
export interface BotSummary {
  id: string;
  /** The person's login, or the organization's for a team bot. */
  owner: string;
  /** Absent from an older server: read it as `user`. */
  owner_kind?: BotOwnerKind;
  /** The organization team whose members steward a team bot. */
  steward_team?: string | null;
  /** The login the bot acts as: its owner, or `<org>.<slug>[bot]` for a team bot. */
  acting_login?: string;
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
  /** Team bots the caller stewards. Absent from an older server. */
  team_bots?: BotSummary[];
}

/** A team bot's own right on one repository. Never `admin`. */
export type BotRepoAccess = 'read' | 'write';

/** One row of `GET /api/v1/bots/:id/grants`, and the `PUT` answer. */
export interface BotRepoGrant {
  bot_id: string;
  owner: string;
  repo: string;
  access: BotRepoAccess;
  granted_by: string;
  granted_at: string;
}

export interface BotRepoGrantListResponse {
  grants: BotRepoGrant[];
}

/** `POST /api/v1/orgs/:org/bots`. No enrollment key comes back. */
export interface TeamBotCreateRequest {
  steward_team: string;
  slug: string;
  display_name: string;
  kind?: BotKind;
  reach?: BotReach;
}

export interface TeamBotCreateResponse {
  bot: BotSummary;
}

/** `POST /api/v1/bots` and `POST /api/v1/bots/:id/keys`. */
export interface BotCreateRequest {
  slug: string;
  display_name: string;
  /** Left out, the server uses "agent". */
  kind?: BotKind;
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
  /** Who issued it; absent on tokens from before team bots. */
  issued_by?: string | null;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface BotAccessTokenListResponse {
  tokens: BotAccessTokenSummary[];
}

/**
 * One thing a Grokbot or Musebot did. A request (`scope` `http`) is its
 * method and path, with the status as the outcome; an MCP session tool
 * (`scope` `mcp`) is the tool's name, with `ok` or `error`.
 */
export interface BotActivityEvent {
  id: string;
  bot_id: string;
  key_id: string;
  repo: string | null;
  /** The session it worked, named only when it is the bot's owner's. */
  session_id: string | null;
  action: string;
  outcome: string;
  scope: string;
  created_at: string;
}

/** `GET /api/v1/repos/:id/bot-activity` and `GET /api/v1/bots/:id/activity`, oldest first. */
export interface BotActivityResponse {
  events: BotActivityEvent[];
}
