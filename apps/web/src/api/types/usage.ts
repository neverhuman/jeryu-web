// usage.ts — hand-written wire types for token usage: the counts a finished
// attempt carries in `detail.usage`, and the token-usage read
// (`GET /api/v1/usage`, admin-only), which no page reads now.
//
// JSON is snake_case like the Shift and pipeline APIs. Every count is optional:
// a producer (todoq) that predates usage reporting sends a slot with no
// numbers at all, and a row says so rather than drawing zeros. A server
// that predates the route answers with a 404 or the SPA shell, which
// `isPipelineUnavailable` already recognises.

/** The four counts an attempt reports. A count the producer did not send is absent. */
export interface UsageTokenCounts {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_tokens?: number | null;
  cache_write_tokens?: number | null;
}

/** One working slot's current attempt. */
export interface UsageSlot extends UsageTokenCounts {
  operator?: string | null;
  host?: string | null;
  slot: string;
  family?: string | null;
  todo_id?: string | null;
  todo_title?: string | null;
  /** The model the attempt runs on, as the producer names it. */
  model?: string | null;
  /** When the attempt started, RFC 3339: what `tokens_per_min` is measured over. */
  attempt_started?: string | null;
  tokens_per_min?: number | null;
  cost_usd?: number | null;
  /**
   * Whether the producer reported usage at all. Absent is read as "it did":
   * a slot is only called silent when every count is missing as well.
   */
  reported?: boolean | null;
}

/** Everything spent since midnight, over the scope of the request. */
export interface UsageTotals extends UsageTokenCounts {
  cost_usd?: number | null;
}

/** One bucket of the tokens-per-5-min sparkline. */
export interface UsageBucket extends UsageTokenCounts {
  at: string;
  /** Tokens in the bucket; falls back to the sum of the counts above. */
  tokens?: number | null;
}

export interface UsageResponse {
  /** Contract version. Unknown fields anywhere in this payload are ignored. */
  schema_version?: string | number;
  generated_at: string;
  slots?: UsageSlot[] | null;
  totals_today?: UsageTotals | null;
  buckets?: UsageBucket[] | null;
  /** Width of one bucket. Informational: the sparkline lays points out by count. */
  bucket_seconds?: number;
}

/** Query of `GET /api/v1/usage`. `range` is the sparkline's span (`24h`). */
export interface UsageQuery {
  family?: string;
  range?: string;
}
