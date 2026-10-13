// accessTokens.ts — personal access token wire shapes (`/api/v1/auth/tokens`).
// A listed token never carries its secret; only the create answer does, once.

export interface AccessTokenSummary {
  id: string;
  name: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface CreateAccessTokenRequest {
  name: string;
  expiresAt: string;
}

/** The create answer: `token` is the secret, shown to the user exactly once. */
export interface CreatedAccessToken {
  id: string;
  token: string;
  name: string;
  expiresAt: string | null;
}
